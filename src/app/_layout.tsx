import {
  Roboto_400Regular,
  Roboto_500Medium,
  Roboto_700Bold,
  useFonts,
} from '@expo-google-fonts/roboto';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { colorScheme } from 'nativewind';
import { useEffect } from 'react';

import '@/global.css';
import { AuthProvider } from '@/hooks/use-auth';

SplashScreen.preventAutoHideAsync();
colorScheme.set('dark');

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Roboto_400Regular,
    Roboto_500Medium,
    Roboto_700Bold,
  });

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  if (!loaded && !error) {
    return null;
  }

  return (
    <AuthProvider>
      <Stack screenOptions={{ headerShown: false }}>
        {/* Swipe-to-dismiss is off so leaving always goes through Cancel, Skip, or Done. */}
        <Stack.Screen
          name="artifact-details"
          options={{ presentation: 'fullScreenModal', gestureEnabled: false }}
        />
      </Stack>
    </AuthProvider>
  );
}
