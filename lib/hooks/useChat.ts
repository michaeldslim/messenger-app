import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../../providers/AuthProvider';
import type { Conversation, Message, Profile } from '../types';

export function usePresence(conversationId: string, otherUserId: string | null) {
  const { user } = useAuth();
  const [isOtherOnline, setIsOtherOnline] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!user || !conversationId) return;

    const channel = supabase.channel(`presence:${conversationId}`, {
      config: { presence: { key: user.id } },
    });

    channelRef.current = channel;

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<{ user_id: string }>();
        const onlineIds = Object.values(state).flat().map((p) => p.user_id);
        setIsOtherOnline(otherUserId ? onlineIds.includes(otherUserId) : false);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ user_id: user.id });
        }
      });

    return () => {
      channel.untrack();
      supabase.removeChannel(channel);
    };
  }, [conversationId, user, otherUserId]);

  return { isOtherOnline };
}

export function useConversations() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConversations = useCallback(async () => {
    if (!user) return;
    try {
      // Get all conversations the user is a member of
      const { data: memberRows, error: memberError } = await supabase
        .from('kuku_conversation_members')
        .select('conversation_id')
        .eq('user_id', user.id);

      if (memberError) throw memberError;
      if (!memberRows?.length) {
        setConversations([]);
        setLoading(false);
        return;
      }

      const conversationIds = memberRows.map((r) => r.conversation_id);

      const { data: convData, error: convError } = await supabase
        .from('kuku_conversations')
        .select('*')
        .in('id', conversationIds)
        .order('updated_at', { ascending: false });

      if (convError) throw convError;

      // For each conversation, get the last message and the other user (for DMs)
      const enriched: Conversation[] = await Promise.all(
        (convData ?? []).map(async (conv) => {
          // Last message
          const { data: msgData } = await supabase
            .from('kuku_messages')
            .select('*, sender:kuku_profiles!sender_id(id, username, display_name, avatar_url)')
            .eq('conversation_id', conv.id)
            .eq('is_deleted', false)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          // Other user for DMs
          let other_user: Profile | null = null;
          if (!conv.is_group) {
            const { data: members } = await supabase
              .from('kuku_conversation_members')
              .select('user_id, profile:kuku_profiles!user_id(*)')
              .eq('conversation_id', conv.id)
              .neq('user_id', user.id)
              .limit(1)
              .single();
            other_user = (members?.profile as unknown as Profile) ?? null;
          }

          return {
            ...conv,
            last_message: msgData ?? null,
            other_user,
          };
        })
      );

      setConversations(enriched);
    } catch (e) {
      console.error('fetchConversations error:', e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchConversations();

    // Real-time: refresh list when conversations are updated (updated_at changes on new message via trigger)
    const channel = supabase
      .channel('conversations-list')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'kuku_conversations' },
        () => fetchConversations()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchConversations]);

  return { conversations, loading };
}

export function useMessages(conversationId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMessages = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('kuku_messages')
        .select('*, sender:kuku_profiles!sender_id(id, username, display_name, avatar_url)')
        .eq('conversation_id', conversationId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages((data as Message[]) ?? []);
    } catch (e) {
      console.error('fetchMessages error:', e);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    fetchMessages();

    // Real-time subscription for new messages in this conversation
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'kuku_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          // Fetch the full message with sender profile
          const { data } = await supabase
            .from('kuku_messages')
            .select('*, sender:kuku_profiles!sender_id(id, username, display_name, avatar_url)')
            .eq('id', payload.new.id)
            .single();
          if (data) {
            setMessages((prev) => [...prev, data as Message]);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'kuku_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          // If the message was soft-deleted, remove it from state
          if (payload.new.is_deleted) {
            setMessages((prev) => prev.filter((m) => m.id !== payload.new.id));
          } else {
            setMessages((prev) =>
              prev.map((m) => (m.id === payload.new.id ? { ...m, ...payload.new } : m))
            );
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [conversationId, fetchMessages]);

  return { messages, loading };
}

export async function sendMessage(
  conversationId: string,
  senderId: string,
  content: string
) {
  const { error } = await supabase.from('kuku_messages').insert({
    conversation_id: conversationId,
    sender_id: senderId,
    content: content.trim(),
    message_type: 'text',
  });

  if (error) throw error;

  // Push notification is handled by the Supabase database webhook (on_new_message_push)
  // which calls the push-notification edge function on every INSERT into kuku_messages.
}

export async function createOrGetDM(
  currentUserId: string,
  otherUserId: string
): Promise<string> {
  // Check if a DM already exists between these two users
  const { data: myConvs } = await supabase
    .from('kuku_conversation_members')
    .select('conversation_id')
    .eq('user_id', currentUserId);

  if (myConvs?.length) {
    const myIds = myConvs.map((r) => r.conversation_id);
    const { data: shared } = await supabase
      .from('kuku_conversation_members')
      .select('conversation_id, conversation:kuku_conversations!conversation_id(is_group)')
      .eq('user_id', otherUserId)
      .in('conversation_id', myIds);

    const existingDM = shared?.find((r) => !(r.conversation as any)?.is_group);
    if (existingDM) return existingDM.conversation_id;
  }

  // Create new DM conversation
  const { data: conv, error: convError } = await supabase
    .from('kuku_conversations')
    .insert({ is_group: false })
    .select()
    .single();

  if (convError) throw convError;

  const { error: memberError } = await supabase
    .from('kuku_conversation_members')
    .insert([
      { conversation_id: conv.id, user_id: currentUserId, role: 'admin' },
      { conversation_id: conv.id, user_id: otherUserId, role: 'member' },
    ]);

  if (memberError) throw memberError;

  return conv.id;
}

export function useUsers() {
  const { user } = useAuth();
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);

  const searchUsers = useCallback(async (query: string) => {
    if (!query.trim()) { setUsers([]); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('kuku_profiles')
        .select('*')
        .neq('id', user?.id ?? '')
        .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
        .limit(20);

      if (error) throw error;
      setUsers((data as Profile[]) ?? []);
    } catch (e) {
      console.error('searchUsers error:', e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  return { users, loading, searchUsers };
}
