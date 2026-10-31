import { router } from 'expo-router';
import { ArrowLeft, LogOut } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import GlassIconButton from '@/components/GlassIconButton';
import UserAvatar from '@/components/UserAvatar';
import { useAuth } from '@/hooks/use-auth';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, profile, signOut, updateDisplayName } = useAuth();
  const savedName = profile?.display_name ?? '';
  const [name, setName] = useState(savedName);
  const [savingName, setSavingName] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // The profile loads after sign-in; pick up its name once it arrives.
  useEffect(() => {
    setName(savedName);
  }, [savedName]);

  const saveName = async () => {
    if (name.trim() === savedName.trim()) return;
    setSavingName(true);
    try {
      await updateDisplayName(name);
    } catch (e) {
      console.error('[ProfileScreen] updateDisplayName failed:', e);
      Alert.alert('Error', "Couldn't update your name. Please try again.");
      setName(savedName);
    } finally {
      setSavingName(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert('Sign out?', "You'll need to sign in again to see your albums.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          setSigningOut(true);
          try {
            // The app layout redirects to sign-in once the session clears.
            await signOut();
          } catch (e) {
            console.error('[ProfileScreen] signOut failed:', e);
            Alert.alert('Error', "Couldn't sign out. Please try again.");
            setSigningOut(false);
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.root}>
      {/* ── Nav row ── */}
      <View style={[styles.navRow, { paddingTop: insets.top + 8 }]}>
        <GlassIconButton onPress={() => router.back()} accessibilityLabel="Back">
          <ArrowLeft size={20} color="#FFFFFF" />
        </GlassIconButton>
        <Text style={styles.navTitle}>Profile</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ alignItems: 'center', gap: 12, marginBottom: 32 }}>
          <UserAvatar size={96} />
          <Text style={styles.headline} numberOfLines={1}>
            {savedName || user?.email}
          </Text>
        </View>

        <View style={{ gap: 8 }}>
          <Text style={styles.label}>Name</Text>
          <View style={[styles.input, styles.row]}>
            <TextInput
              value={name}
              onChangeText={setName}
              onBlur={saveName}
              onSubmitEditing={saveName}
              placeholder="Add your name"
              placeholderTextColor="#525252"
              autoCapitalize="words"
              autoComplete="name"
              maxLength={80}
              returnKeyType="done"
              editable={!savingName}
              style={[styles.inputText, { flex: 1, padding: 0 }]}
            />
            {savingName && <ActivityIndicator size="small" color="#737373" />}
          </View>
        </View>

        <View style={{ gap: 8, marginTop: 20 }}>
          <Text style={styles.label}>Email</Text>
          <View style={[styles.input, styles.row]}>
            <Text style={[styles.inputText, { color: '#A3A3A3' }]} numberOfLines={1}>
              {user?.email}
            </Text>
          </View>
        </View>

        <Pressable
          onPress={handleSignOut}
          disabled={signingOut}
          accessibilityRole="button"
          style={{ marginTop: 40 }}
        >
          {({ pressed }) => (
            <View style={[styles.signOut, pressed && { backgroundColor: 'rgba(239,68,68,0.16)' }]}>
              {signingOut ? (
                <ActivityIndicator color="#EF4444" />
              ) : (
                <>
                  <LogOut size={18} color="#EF4444" />
                  <Text style={styles.signOutText}>Sign Out</Text>
                </>
              )}
            </View>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A0A0A' },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  navTitle: { color: 'rgba(255,255,255,0.85)', fontSize: 17, fontWeight: '600' },
  content: { paddingHorizontal: 20, paddingTop: 24 },
  headline: { color: '#F5F5F5', fontSize: 22, fontWeight: '600' },
  label: { color: '#A3A3A3', fontSize: 15, fontWeight: '500' },
  // Matches the create-album inputs.
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  inputText: { color: '#F5F5F5', fontSize: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 50 },
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.4)',
    backgroundColor: 'rgba(239,68,68,0.08)',
  },
  signOutText: { color: '#EF4444', fontSize: 16, fontWeight: '600' },
});
