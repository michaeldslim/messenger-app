import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useEffect, useRef, useState } from 'react';

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;

    // If a session arrives via deep link while we're waiting, navigate immediately
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && isMounted.current) {
        router.replace('/(app)/chats');
      }
    });

    return () => {
      isMounted.current = false;
      subscription.unsubscribe();
    };
  }, []);

  const redirectUri = AuthSession.makeRedirectUri({
    scheme: 'messenger-app',
    path: 'auth/callback',
  });

  const signInWithGoogle = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUri,
          skipBrowserRedirect: true,
        },
      });

      if (error) throw error;
      if (!data.url) throw new Error('No OAuth URL returned');

      const result = await WebBrowser.openAuthSessionAsync(
        data.url,
        redirectUri
      );

      if (result.type === 'success' && result.url) {
        const url = new URL(result.url);
        const hashParams = new URLSearchParams(url.hash.replace('#', ''));
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');

        if (accessToken && refreshToken) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (sessionError) throw sessionError;
        }
        // onAuthStateChange above will handle navigation
      }
      // If result.type === 'dismiss', the deep link may have already set the session
      // via onAuthStateChange — no error needed
    } catch (err: any) {
      Alert.alert('Sign in failed', err.message);
    } finally {
      if (isMounted.current) setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>뭐라고? (Mworago?)</Text>
      <Text style={styles.subtitle}>Connect with anyone, anywhere</Text>

      <TouchableOpacity
        style={styles.googleButton}
        onPress={signInWithGoogle}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.googleButtonText}>Continue with Google</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#1a1a1a',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 48,
  },
  googleButton: {
    backgroundColor: '#4285F4',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
  },
  googleButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
