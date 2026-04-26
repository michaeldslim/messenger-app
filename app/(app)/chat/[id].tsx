import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  ImageBackground,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as Notifications from 'expo-notifications';
import { useAuth } from '../../../providers/AuthProvider';
import { useMessages, sendMessage, deleteMessage, usePresence } from '../../../lib/hooks/useChat';
import type { Message } from '../../../lib/types';

function getDateKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((today.getTime() - msgDay.getTime()) / (1000 * 60 * 60 * 24));
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 0) return time;
  if (diffDays < 7) return `${d.toLocaleString('default', { weekday: 'short' })} ${time}`;
  const month = d.toLocaleString('default', { month: 'short' });
  if (d.getFullYear() === now.getFullYear()) return `${month} ${d.getDate()}, ${time}`;
  return `${month} ${d.getDate()} ${d.getFullYear()}, ${time}`;
}

function formatDateSeparator(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((today.getTime() - msgDay.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  const month = d.toLocaleString('default', { month: 'long' });
  if (d.getFullYear() === now.getFullYear()) return `${month} ${d.getDate()}`;
  return `${month} ${d.getDate()}, ${d.getFullYear()}`;
}

type SeparatorItem = { type: 'separator'; date: string; id: string };
type ListItem = Message | SeparatorItem;

function buildMessageList(reversedMessages: Message[]): ListItem[] {
  const result: ListItem[] = [];
  for (let i = 0; i < reversedMessages.length; i++) {
    result.push(reversedMessages[i]);
    const currentKey = getDateKey(reversedMessages[i].created_at);
    const nextKey = i + 1 < reversedMessages.length ? getDateKey(reversedMessages[i + 1].created_at) : null;
    if (nextKey === null || currentKey !== nextKey) {
      result.push({ type: 'separator', date: reversedMessages[i].created_at, id: `sep-${currentKey}` });
    }
  }
  return result;
}

function DateSeparator({ label }: { label: string }) {
  return (
    <View style={styles.dateSeparatorRow}>
      <View style={styles.dateSeparatorLine} />
      <View style={styles.dateSeparatorPill}>
        <Text style={styles.dateSeparatorText}>{label}</Text>
      </View>
      <View style={styles.dateSeparatorLine} />
    </View>
  );
}

function Avatar({ uri, name, size = 32 }: { uri?: string | null; name?: string | null; size?: number }) {
  if (uri) {
    return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: '#4285F4',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>
        {(name ?? '?').slice(0, 2).toUpperCase()}
      </Text>
    </View>
  );
}

function MessageBubble({ message, isOwn, onDelete }: { message: Message; isOwn: boolean; onDelete?: () => void }) {
  const senderName = message.sender?.display_name ?? message.sender?.username ?? '';

  if (message.is_deleted) {
    return (
      <View style={[styles.bubbleRow, isOwn && styles.bubbleRowOwn]}>
        {!isOwn && <Avatar uri={null} name={senderName} />}
        <View style={[styles.bubble, styles.bubbleDeleted]}>
          <Text style={styles.deletedText}>This message was deleted</Text>
        </View>
      </View>
    );
  }

  return (
    <TouchableWithoutFeedback onLongPress={isOwn ? onDelete : undefined} delayLongPress={400}>
      <View style={[styles.bubbleRow, isOwn && styles.bubbleRowOwn]}>
        {!isOwn && (
          <Avatar
            uri={message.sender?.avatar_url}
            name={senderName}
          />
        )}
        <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
          {message.content && (
            <Text style={[styles.bubbleText, isOwn && styles.bubbleTextOwn]}>
              {message.content}
            </Text>
          )}
          <Text style={[styles.bubbleTime, isOwn && styles.bubbleTimeOwn]}>
            {formatTime(message.created_at)}
            {message.is_edited && ' · edited'}
          </Text>
        </View>
      </View>
    </TouchableWithoutFeedback>
  );
}

export default function ChatScreen() {
  const { id, title, otherUserId } = useLocalSearchParams<{ id: string; title: string; otherUserId: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const { messages, loading } = useMessages(id);
  const { isOtherOnline } = usePresence(id, otherUserId ?? null);
  const listData = useMemo(() => buildMessageList([...messages].reverse()), [messages]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const listRef = useRef<FlatList>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  // Dismiss all notifications when any chat screen is opened and clear badge count
  useEffect(() => {
    Notifications.dismissAllNotificationsAsync();
    Notifications.setBadgeCountAsync(0);
  }, [id]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || !user) return;
    setSending(true);
    setText('');
    try {
      await sendMessage(id, user.id, trimmed);
    } catch (e: any) {
      Alert.alert('Failed to send', e.message);
      setText(trimmed); // restore text on failure
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
      enabled={Platform.OS === 'ios' || keyboardVisible}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backChevron}>‹</Text>
          <Text style={styles.backLabel}>Back</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>{title ?? 'Chat'}</Text>
          {isOtherOnline && (
            <View style={styles.onlineRow}>
              <View style={styles.onlineDot} />
              <Text style={styles.onlineText}>online</Text>
            </View>
          )}
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Messages */}
      <ImageBackground
        source={require('../../../assets/bg-leaves.png')}
        style={styles.messageListBg}
        resizeMode="repeat"
        imageStyle={{ opacity: 1, transform: [{ scale: 5 }] }}
      >
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#4285F4" />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={listData}
            keyExtractor={(item) => ('type' in item ? item.id : item.id)}
            renderItem={({ item }) => {
              if ('type' in item && item.type === 'separator') {
                return <DateSeparator label={formatDateSeparator(item.date)} />;
              }
              const msg = item as Message;
              return (
                <MessageBubble
                  message={msg}
                  isOwn={msg.sender_id === user?.id}
                  onDelete={() => {
                    Alert.alert('Delete message', 'This message will be deleted for everyone.', [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Delete',
                        style: 'destructive',
                        onPress: async () => {
                          try {
                            await deleteMessage(msg.id);
                          } catch (e: any) {
                            Alert.alert('Error', e.message);
                          }
                        },
                      },
                    ]);
                  }}
                />
              );
            }}
            style={styles.messageList}
            contentContainerStyle={styles.messagesList}
            inverted
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <View style={styles.centered}>
                <Text style={styles.emptyText}>No messages yet. Say hello! 👋</Text>
              </View>
            }
          />
        )}
      </ImageBackground>

      {/* Input bar */}
      <View style={[styles.inputBar, { paddingBottom: (!keyboardVisible && insets.bottom > 0) ? insets.bottom : 8 }]}>
        <TextInput
          style={styles.input}
          placeholder="Message…"
          placeholderTextColor="#999"
          value={text}
          onChangeText={setText}
          multiline
          maxLength={2000}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!text.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="send" size={20} color="#fff" />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f8f8' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 56,
    paddingHorizontal: 12,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', width: 60, gap: 2, padding: 4 },
  backChevron: { color: '#4285F4', fontSize: 28, lineHeight: 32, marginTop: -2 },
  backLabel: { color: '#4285F4', fontSize: 16, fontWeight: '500' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1a1a1a',
    textAlign: 'center',
  },
  onlineRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#34C759' },
  onlineText: { fontSize: 12, color: '#34C759', fontWeight: '500' },
  messageListBg: { flex: 1, overflow: 'hidden' },
  messageList: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyText: { color: '#999', fontSize: 15 },
  messagesList: { flexGrow: 1, paddingVertical: 12, paddingHorizontal: 12, gap: 8 },
  bubbleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginVertical: 2,
  },
  bubbleRowOwn: { flexDirection: 'row-reverse' },
  bubble: {
    maxWidth: '75%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  bubbleOther: {
    backgroundColor: '#fff',
    borderBottomLeftRadius: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  bubbleDeleted: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#ccc',
    borderStyle: 'dashed',
  },
  deletedText: { fontSize: 14, color: '#aaa', fontStyle: 'italic' },
  bubbleOwn: {
    backgroundColor: '#4285F4',
    borderBottomRightRadius: 4,
  },
  bubbleText: { fontSize: 15, color: '#1a1a1a', lineHeight: 20 },
  bubbleTextOwn: { color: '#fff' },
  bubbleTime: { fontSize: 11, color: '#aaa', marginTop: 4, alignSelf: 'flex-end' },
  bubbleTimeOwn: { color: 'rgba(255,255,255,0.7)' },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: '#1a1a1a',
    maxHeight: 120,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#4285F4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#c0d4f5' },
  sendText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  dateSeparatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 8,
    marginHorizontal: 4,
  },
  dateSeparatorLine: { flex: 1, height: 1, backgroundColor: 'rgba(0,0,0,0.1)' },
  dateSeparatorPill: {
    backgroundColor: 'rgba(0,0,0,0.12)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 3,
    marginHorizontal: 8,
  },
  dateSeparatorText: { fontSize: 12, color: '#555', fontWeight: '500' },
});
