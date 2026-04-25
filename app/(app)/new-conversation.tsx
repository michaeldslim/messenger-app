import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useAuth } from '../../providers/AuthProvider';
import { useUsers, createOrGetDM } from '../../lib/hooks/useChat';
import type { Profile } from '../../lib/types';

function Avatar({ uri, name }: { uri?: string | null; name?: string | null }) {
  if (uri) {
    return <Image source={{ uri }} style={styles.avatar} />;
  }
  return (
    <View style={styles.avatarFallback}>
      <Text style={styles.avatarText}>{(name ?? '?').slice(0, 2).toUpperCase()}</Text>
    </View>
  );
}

export default function NewConversationScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { users, loading, searchUsers } = useUsers();
  const [query, setQuery] = useState('');
  const [starting, setStarting] = useState<string | null>(null);

  const handleSelect = async (profile: Profile) => {
    if (!user) return;
    setStarting(profile.id);
    try {
      const conversationId = await createOrGetDM(user.id, profile.id);
      router.replace({
        pathname: '/(app)/chat/[id]',
        params: {
          id: conversationId,
          title: profile.display_name ?? profile.username,
          otherUserId: profile.id,
        },
      });
    } catch (e: any) {
      Alert.alert('Error', e.message);
      setStarting(null);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backChevron}>‹</Text>
          <Text style={styles.backLabel}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Chat</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or username…"
          placeholderTextColor="#999"
          value={query}
          onChangeText={(text) => {
            setQuery(text);
            searchUsers(text);
          }}
          autoFocus
          autoCapitalize="none"
        />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#4285F4" />
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.userItem}
              onPress={() => handleSelect(item)}
              disabled={!!starting}
            >
              <Avatar uri={item.avatar_url} name={item.display_name ?? item.username} />
              <View style={styles.userInfo}>
                <Text style={styles.displayName}>
                  {item.display_name ?? item.username}
                </Text>
                <Text style={styles.username}>@{item.username}</Text>
              </View>
              {starting === item.id && <ActivityIndicator color="#4285F4" />}
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            query.length > 0 ? (
              <View style={styles.centered}>
                <Text style={styles.emptyText}>No users found for "{query}"</Text>
              </View>
            ) : (
              <View style={styles.centered}>
                <Text style={styles.emptyText}>Search for someone to chat with</Text>
              </View>
            )
          }
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
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', width: 60, gap: 2 },
  backChevron: { color: '#4285F4', fontSize: 28, lineHeight: 32, marginTop: -2 },
  backLabel: { color: '#4285F4', fontSize: 16, fontWeight: '500' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a1a' },
  searchContainer: { padding: 12 },
  searchInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    color: '#1a1a1a',
  },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyText: { color: '#999', fontSize: 15 },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#e0e0e0' },
  avatarFallback: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#4285F4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  userInfo: { flex: 1 },
  displayName: { fontSize: 16, fontWeight: '600', color: '#1a1a1a' },
  username: { fontSize: 13, color: '#999', marginTop: 2 },
  separator: { height: 1, backgroundColor: '#f5f5f5', marginLeft: 76 },
});
