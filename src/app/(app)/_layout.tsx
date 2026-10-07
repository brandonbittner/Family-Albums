import { BlurView } from 'expo-blur';
import { Redirect, Tabs } from 'expo-router';
import { Activity, Images, Library, Users } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/hooks/use-auth';

const ACTIVE = '#60A5FA';
const INACTIVE = '#9CA3AF';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function FloatingTabBar({
  state,
  descriptors,
  navigation,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  state: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  descriptors: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  navigation: any;
}) {
  return (
    <View style={[styles.shadow, { bottom: 16 }]}>
      <View style={styles.bar}>
        <BlurView
          intensity={5}
          tint="systemUltraThinMaterialDark"
          style={StyleSheet.absoluteFill}
        />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.2)' }]} />

        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {state.routes.map((route: any, index: number) => {
          const { options } = descriptors[route.key];
          if (!options.tabBarIcon) return null;

          const focused = state.index === index;
          const color = focused ? ACTIVE : INACTIVE;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
          };

          return (
            <Pressable key={route.key} onPress={onPress} style={styles.item}>
              <View style={[styles.tabContent, focused && styles.tabContentActive]}>
                {focused && (
                  <>
                    <BlurView
                      intensity={5}
                      tint="systemUltraThinMaterialDark"
                      style={StyleSheet.absoluteFill}
                    />
                    <View
                      style={[
                        StyleSheet.absoluteFill,
                        { backgroundColor: 'rgba(255,255,255,0.06)' },
                      ]}
                    />
                  </>
                )}
                {options.tabBarIcon({ focused, color, size: 22 })}
                <Text style={[styles.label, { color }]}>{options.title}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: {
    position: 'absolute',
    left: 16,
    right: 16,
    height: 72,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.7,
    shadowRadius: 24,
    elevation: 20,
  },
  bar: {
    flex: 1,
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 999,
    overflow: 'hidden',
  },
  item: {
    flex: 1,
  },
  tabContent: {
    flex: 1,
    margin: 6,
    borderRadius: 999,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  tabContentActive: {},
  label: { fontSize: 12, fontWeight: '500' },
});

export default function AppLayout() {
  const { session, loading } = useAuth();

  if (loading) return null;
  if (!session) return <Redirect href="/(auth)/sign-in" />;

  return (
    <Tabs tabBar={(props) => <FloatingTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Albums',
          tabBarIcon: ({ color }) => <Images size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: 'Library',
          tabBarIcon: ({ color }) => <Library size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: 'Activity',
          tabBarIcon: ({ color }) => <Activity size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="groups"
        options={{
          title: 'Groups',
          tabBarIcon: ({ color }) => <Users size={22} color={color} />,
        }}
      />
      <Tabs.Screen name="profile" options={{ href: null }} />
      <Tabs.Screen name="create-album" options={{ href: null }} />
      <Tabs.Screen name="album" options={{ href: null }} />
    </Tabs>
  );
}
