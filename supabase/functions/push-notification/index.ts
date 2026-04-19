import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface MessageRecord {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
}

Deno.serve(async (req) => {
  try {
    const { record } = await req.json() as { record: MessageRecord };
    if (!record?.id) return new Response('no record', { status: 200 });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get sender profile
    const { data: sender } = await supabase
      .from('kuku_profiles')
      .select('display_name, username')
      .eq('id', record.sender_id)
      .single();

    const senderName = sender?.display_name ?? sender?.username ?? 'Someone';

    // Get all members of the conversation except the sender
    const { data: members } = await supabase
      .from('kuku_conversation_members')
      .select('user_id')
      .eq('conversation_id', record.conversation_id)
      .neq('user_id', record.sender_id);

    if (!members?.length) return new Response('no recipients', { status: 200 });

    const recipientIds = members.map((m) => m.user_id);

    // Get push tokens for recipients
    const { data: profiles } = await supabase
      .from('kuku_profiles')
      .select('push_token')
      .in('id', recipientIds)
      .not('push_token', 'is', null);

    const tokens = profiles?.map((p) => p.push_token).filter(Boolean) ?? [];
    if (!tokens.length) return new Response('no push tokens', { status: 200 });

    // Send push notifications via Expo Push API
    const messages = tokens.map((token) => ({
      to: token,
      sound: 'default',
      title: senderName,
      body: record.content ?? '📎 Attachment',
      data: {
        conversationId: record.conversation_id,
        senderName,
      },
      channelId: 'messages',
    }));

    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(messages),
    });

    const result = await response.json();
    return new Response(JSON.stringify(result), { status: 200 });
  } catch (err) {
    console.error('push-notification error:', err);
    return new Response(String(err), { status: 500 });
  }
});
