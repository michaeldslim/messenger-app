import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const JSON_HEADERS = { 'Content-Type': 'application/json' };

interface MessageRecord {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
}

Deno.serve(async (req: Request) => {
  try {
    const { record } = await req.json() as { record: MessageRecord };
    if (!record?.id) {
      return new Response(JSON.stringify({ ok: true, reason: 'no record' }), { status: 200, headers: JSON_HEADERS });
    }

    const supabaseUrl = Deno.env.get('EXPO_PUSH_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL');
    const serviceRoleKey =
      Deno.env.get('EXPO_PUSH_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({
          error:
            'Missing EXPO_PUSH_SUPABASE_URL/EXPO_PUSH_SERVICE_ROLE_KEY (or reserved SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY)',
        }),
        { status: 500, headers: JSON_HEADERS }
      );
    }

    const supabase = createClient(
      supabaseUrl,
      serviceRoleKey
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

    if (!members?.length) {
      return new Response(JSON.stringify({ ok: true, reason: 'no recipients' }), { status: 200, headers: JSON_HEADERS });
    }

    const recipientIds = members.map((m) => m.user_id);

    // Get push tokens for recipients
    const { data: profiles } = await supabase
      .from('kuku_profiles')
      .select('push_token')
      .in('id', recipientIds)
      .not('push_token', 'is', null);

    const tokens = profiles?.map((p) => p.push_token).filter(Boolean) ?? [];
    if (!tokens.length) {
      return new Response(JSON.stringify({ ok: true, reason: 'no push tokens' }), { status: 200, headers: JSON_HEADERS });
    }

    // Send push notifications via Expo Push API
    const messages = tokens.map((token) => ({
      to: token,
      sound: 'default',
      title: senderName,
      body: record.content ?? '📎 Attachment',
      priority: 'high',
      data: {
        conversationId: record.conversation_id,
        senderName,
        senderId: record.sender_id,
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

    const resultText = await response.text();
    if (!response.ok) {
      console.error('Expo Push API failure', { status: response.status, body: resultText });
      return new Response(
        JSON.stringify({
          error: 'Expo Push API request failed',
          status: response.status,
          body: resultText,
        }),
        { status: 502, headers: JSON_HEADERS }
      );
    }

    let result: unknown = resultText;
    try {
      result = JSON.parse(resultText);
    } catch {
      // Keep plain text body when Expo does not return JSON.
    }

    return new Response(JSON.stringify({ ok: true, result }), { status: 200, headers: JSON_HEADERS });
  } catch (err) {
    console.error('push-notification error:', err);
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: JSON_HEADERS });
  }
});
