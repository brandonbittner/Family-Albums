import { BlurView } from 'expo-blur';
import { Redirect, Tabs } from 'expo-router';
import { Library, User } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/hooks/use-auth';

export default function AppLayout() {
  const { session, loading } = useAuth();

  if (loading) return null;
  if (!session) return <Redirect href="/(auth)/sign-in" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          bottom: 16,
          marginHorizontal: 16,
          backgroundColor: 'transparent',
          borderRadius: 36,
          height: 72,
          paddingBottom: 0,
          paddingTop: 0,
          paddingHorizontal: 16,
          borderTopWidth: 0,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.3,
          shadowRadius: 16,
          elevation: 12,
        },
        tabBarBackground: () => (
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                borderRadius: 36,
                overflow: 'hidden',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.1)',
              },
            ]}
          >
            <BlurView
              intensity={20}
              tint="systemUltraThinMaterialDark"
              style={StyleSheet.absoluteFill}
            />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.25)' }]} />
          </View>
        ),
        tabBarItemStyle: {
          justifyContent: 'center',
          alignItems: 'center',
          paddingTop: 10,
          paddingBottom: 0,
          gap: 3,
        },
        tabBarActiveTintColor: '#60A5FA',
        tabBarInactiveTintColor: '#737373',
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
          marginTop: 0,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Albums',
          tabBarIcon: ({ color }) => <Library size={22} stroke={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: ({ color }) => <User size={22} stroke={color} /> }}
      />
      <Tabs.Screen
        name="create-album"
        options={{ tabBarButton: () => null, tabBarStyle: { display: 'none' } }}
      />
      <Tabs.Screen
        name="album"
        options={{ tabBarButton: () => null, tabBarStyle: { display: 'none' } }}
      />
    </Tabs>
  );
}
