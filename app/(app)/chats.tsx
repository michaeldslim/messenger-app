import {
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../providers/AuthProvider';
import { useConversations } from '../../lib/hooks/useChat';
import type { Conversation } from '../../lib/types';

function formatTime(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function Avatar({ uri, name, size = 48 }: { uri?: string | null; name?: string | null; size?: number }) {
  if (uri) {
    return <Image source={{ uri }} style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]} />;
  }
  const initials = (name ?? '?').slice(0, 2).toUpperCase();
  return (
    <View style={[styles.avatarFallback, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={styles.avatarText}>{initials}</Text>
    </View>
  );
}

function ConversationItem({ item }: { item: Conversation }) {
  const router = useRouter();
  const displayName = item.is_group
    ? (item.name ?? 'Group')
    : (item.other_user?.display_name ?? item.other_user?.username ?? 'Unknown');
  const avatarUri = item.is_group ? item.avatar_url : item.other_user?.avatar_url;
  const lastMsg = item.last_message;

  return (
    <TouchableOpacity
      style={styles.item}
      onPress={() =>
        router.push({
          pathname: '/(app)/chat/[id]',
          params: { id: item.id, title: displayName },
        })
      }
    >
      <Avatar uri={avatarUri} name={displayName} />
      <View style={styles.itemContent}>
        <View style={styles.itemHeader}>
          <Text style={styles.itemName} numberOfLines={1}>{displayName}</Text>
          {lastMsg && (
            <Text style={styles.itemTime}>{formatTime(lastMsg.created_at)}</Text>
          )}
        </View>
        <Text style={styles.itemPreview} numberOfLines={1}>
          {lastMsg
            ? lastMsg.message_type === 'text'
              ? lastMsg.content ?? ''
              : `[${lastMsg.message_type}]`
            : 'No messages yet'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export default function ChatsScreen() {
  const { signOut } = useAuth();
  const { conversations, loading } = useConversations();
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Chats</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.newChatBtn}
            onPress={() => router.push('/(app)/new-conversation')}
          >
            <Text style={styles.newChatText}>＋</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={signOut}>
            <Text style={styles.signOut}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#4285F4" />
        </View>
      ) : conversations.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>No conversations yet</Text>
          <Text style={styles.emptyHint}>Tap ＋ to start a new chat</Text>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ConversationItem item={item} />}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#1a1a1a' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  newChatBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#4285F4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  newChatText: { color: '#fff', fontSize: 20, lineHeight: 24 },
  signOut: { color: '#999', fontSize: 14 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#333', marginBottom: 8 },
  emptyHint: { fontSize: 14, color: '#999' },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  avatar: { backgroundColor: '#e0e0e0' },
  avatarFallback: {
    backgroundColor: '#4285F4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  itemContent: { flex: 1 },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  itemName: { fontSize: 16, fontWeight: '600', color: '#1a1a1a', flex: 1, marginRight: 8 },
  itemTime: { fontSize: 12, color: '#999' },
  itemPreview: { fontSize: 14, color: '#666' },
  separator: { height: 1, backgroundColor: '#f5f5f5', marginLeft: 76 },
});
