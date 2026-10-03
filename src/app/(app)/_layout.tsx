import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { House, User } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

export default function AppLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#3B82F6',
        tabBarInactiveTintColor: '#52525b',
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: 'transparent',
          paddingHorizontal: 16,
          borderTopWidth: 1,
          borderTopColor: '#27272a',
          height: 80,
          paddingBottom: 32,
          paddingTop: 14,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.5,
          shadowRadius: 8,
          elevation: 16,
        },
        tabBarBackground: () => (
          <>
            <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(24,24,27,0.9)' }]} />
          </>
        ),
        tabBarLabelStyle: {
          fontSize: 13,
          fontWeight: '500',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', tabBarIcon: ({ color }) => <House size={22} stroke={color} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: ({ color }) => <User size={22} stroke={color} /> }}
      />
    </Tabs>
  );
}
