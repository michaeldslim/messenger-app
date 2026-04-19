import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../../providers/AuthProvider';

export default function ChatsScreen() {
  const { user, signOut } = useAuth();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Chats</Text>
        <TouchableOpacity onPress={signOut}>
          <Text style={styles.signOut}>Sign out</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.body}>
        <Text style={styles.welcome}>Welcome, {user?.email}</Text>
        <Text style={styles.hint}>Your conversations will appear here.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerTitle: { fontSize: 24, fontWeight: 'bold' },
  signOut: { color: '#4285F4', fontSize: 14 },
  body: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  welcome: { fontSize: 16, color: '#333', marginBottom: 8 },
  hint: { fontSize: 14, color: '#999' },
});
