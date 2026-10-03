import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/hooks/use-auth';

export default function AuthLayout() {
  const { session, loading } = useAuth();

  if (loading) return null;
  if (session) return <Redirect href="/(app)" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'fade',
      }}
    />
  );
}
