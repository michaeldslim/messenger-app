import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar as RNStatusBar } from 'react-native';
import { AuthProvider } from '../providers/AuthProvider';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <RNStatusBar barStyle="dark-content" translucent backgroundColor="transparent" />
      <AuthProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
