import { Redirect, Slot } from 'expo-router';

import { useAuth } from '@/hooks/use-auth';

// Use Slot (not Stack) so album screens are direct children of the root Stack.
// A nested Stack here would preserve its own history between visits, causing
// previously-viewed albums to appear in the back stack.
export default function AlbumLayout() {
  const { session, loading } = useAuth();
  if (loading) return null;
  if (!session) return <Redirect href="/(auth)/sign-in" />;
  return <Slot />;
}
