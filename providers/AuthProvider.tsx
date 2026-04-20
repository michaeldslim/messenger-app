import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { Session, User } from '@supabase/supabase-js';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { supabase } from '../lib/supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) return null;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return null;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return null;

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('messages', {
      name: 'Messages',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#4285F4',
    });
  }

  return token;
}

type AuthContextType = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  signOut: async () => {},
});

async function ensureProfile(user: User) {
  const username =
    user.user_metadata?.preferred_username ??
    user.email?.split('@')[0] ??
    user.id.slice(0, 8);
  const display_name =
    user.user_metadata?.full_name ?? user.user_metadata?.name ?? null;
  const avatar_url = user.user_metadata?.avatar_url ?? null;

  await supabase.from('kuku_profiles').upsert(
    { id: user.id, username, display_name, avatar_url },
    { onConflict: 'id', ignoreDuplicates: true }
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);

  const savePushToken = async (userId: string) => {
    try {
      const token = await registerForPushNotifications();
      if (token) {
        const { data, error } = await supabase
          .from('kuku_profiles')
          .update({ push_token: token })
          .eq('id', userId)
          .select('id');
        if (error) {
          console.error('[Push] failed to save token:', error.message);
        } else if (!data?.length) {
          console.error('[Push] profile row not found for user:', userId);
        }
      }
    } catch (error) {
      console.error('[Push] registration failed:', error);
    }
  };

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        ensureProfile(session.user)
          .then(() => savePushToken(session.user.id))
          .catch((error) => console.error('ensureProfile error:', error));
      }
      setLoading(false);
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        if (session?.user) {
          ensureProfile(session.user)
            .then(() => savePushToken(session.user.id))
            .catch((error) => console.error('ensureProfile error:', error));
        }
        setLoading(false);
      }
    );

    // Notification listeners
    notificationListener.current = Notifications.addNotificationReceivedListener(() => {
      // Notification received while app is foregrounded — handled by setNotificationHandler above
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      // User tapped notification — navigate to the conversation
      const conversationId = response.notification.request.content.data?.conversationId as string | undefined;
      const title = response.notification.request.content.data?.senderName as string | undefined;
      if (conversationId) {
        // Use a small delay to ensure router is mounted
        setTimeout(() => {
          const { router } = require('expo-router');
          router.push({ pathname: '/(app)/chat/[id]', params: { id: conversationId, title: title ?? 'Chat' } });
        }, 500);
      }
    });

    return () => {
      subscription.unsubscribe();
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{ session, user: session?.user ?? null, loading, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
