import { router, useFocusEffect } from 'expo-router';
import { ArrowLeft, BellOff, Clock } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Avatar from '@/components/Avatar';
import GlassIconButton from '@/components/GlassIconButton';
import {
  acceptInvite,
  declineInvite,
  fetchMyInvites,
  inviteErrorMessage,
  type ReceivedInvite,
} from '@/lib/invites';
import { timeAgo } from '@/lib/time-ago';

/** An invite card's state while the user acts on it. */
type CardState = 'idle' | 'accepting' | 'declining';

// TODO: show other notification types (new artifacts, comments, …) once there's
//       a general notifications table. For now notifications are pending invites.
export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const [invites, setInvites] = useState<ReceivedInvite[] | null>(null);
  // Accepted invites no longer exist on the server; they're kept here so their
  // card can stay (as "You joined …") with a link to the album.
  const [joined, setJoined] = useState<ReceivedInvite[]>([]);
  const [cardStates, setCardStates] = useState<Record<string, CardState>>({});
  const [loadFailed, setLoadFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setInvites(await fetchMyInvites());
      setLoadFailed(false);
    } catch (e) {
      console.error('[NotificationsScreen] load failed:', e);
      setLoadFailed(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const setCardState = (id: string, state: CardState) =>
    setCardStates((prev) => ({ ...prev, [id]: state }));

  const handleAccept = async (invite: ReceivedInvite) => {
    setCardState(invite.id, 'accepting');
    try {
      await acceptInvite(invite.id);
      setJoined((prev) => [invite, ...prev]);
      setInvites((prev) => prev?.filter((i) => i.id !== invite.id) ?? prev);
    } catch (e) {
      console.error('[NotificationsScreen] accept failed:', e);
      setCardState(invite.id, 'idle');
      Alert.alert('Couldn’t accept invitation', inviteErrorMessage(e));
      load();
    }
  };

  const handleDecline = (invite: ReceivedInvite) => {
    Alert.alert('Decline invitation?', `You won’t be added to “${invite.albumTitle}”.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Decline',
        style: 'destructive',
        onPress: async () => {
          setCardState(invite.id, 'declining');
          try {
            await declineInvite(invite.id);
            setInvites((prev) => prev?.filter((i) => i.id !== invite.id) ?? prev);
          } catch (e) {
            console.error('[NotificationsScreen] decline failed:', e);
            setCardState(invite.id, 'idle');
            Alert.alert('Couldn’t decline invitation', inviteErrorMessage(e));
            load();
          }
        },
      },
    ]);
  };

  const cards = [
    ...(invites ?? []).map((invite) => ({ invite, isJoined: false })),
    ...joined.map((invite) => ({ invite, isJoined: true })),
  ];

  return (
    <View style={styles.root}>
      {/* ── Nav row ── */}
      <View style={[styles.navRow, { paddingTop: insets.top + 8 }]}>
        <GlassIconButton onPress={() => router.back()} accessibilityLabel="Back">
          <ArrowLeft size={20} color="#FFFFFF" />
        </GlassIconButton>
        <Text style={styles.navTitle}>Notifications</Text>
        <View style={{ width: 44 }} />
      </View>

      {invites === null && joined.length === 0 ? (
        <View style={styles.center}>
          {loadFailed ? (
            <>
              <Text style={styles.emptyText}>Couldn’t load notifications.</Text>
              <Pressable onPress={load} accessibilityRole="button" hitSlop={8}>
                <Text style={styles.link}>Try again</Text>
              </Pressable>
            </>
          ) : (
            <ActivityIndicator color="#737373" />
          )}
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + 32 },
            cards.length === 0 && { flexGrow: 1 },
          ]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#737373" />
          }
        >
          {cards.length === 0 ? (
            <View style={styles.center}>
              <BellOff size={32} color="#525252" />
              <Text style={styles.emptyTitle}>No notifications</Text>
              <Text style={styles.emptyText}>Album invitations will show up here.</Text>
            </View>
          ) : (
            cards.map(({ invite, isJoined }) => (
              <Animated.View key={invite.id} layout={LinearTransition} exiting={FadeOut}>
                <InviteCard
                  invite={invite}
                  joined={isJoined}
                  state={cardStates[invite.id] ?? 'idle'}
                  onAccept={() => handleAccept(invite)}
                  onDecline={() => handleDecline(invite)}
                  onOpenAlbum={() =>
                    router.push({ pathname: '/album/[id]', params: { id: invite.albumId } })
                  }
                />
              </Animated.View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

function InviteCard({
  invite,
  joined,
  state,
  onAccept,
  onDecline,
  onOpenAlbum,
}: {
  invite: ReceivedInvite;
  joined: boolean;
  state: CardState;
  onAccept: () => void;
  onDecline: () => void;
  onOpenAlbum: () => void;
}) {
  const inviter = invite.inviterName?.trim() || 'Someone';
  const busy = state === 'accepting' || state === 'declining';

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Avatar name={invite.inviterName} seed={invite.inviterId} size={44} />
        <View style={{ flex: 1, gap: 4 }}>
          {joined ? (
            <Text style={styles.message}>
              You joined <Text style={styles.strong}>{invite.albumTitle}</Text>
            </Text>
          ) : (
            <Text style={styles.message}>
              <Text style={styles.strong}>{inviter}</Text> invited you to{' '}
              <Text style={styles.strong}>{invite.albumTitle}</Text>
            </Text>
          )}
          <View style={styles.detail}>
            <Clock size={14} color="#737373" />
            <Text style={styles.detailText}>{timeAgo(invite.sentAt)}</Text>
          </View>
        </View>
      </View>

      {joined ? (
        <CardButton label="Open Album" variant="primary" onPress={onOpenAlbum} />
      ) : (
        <View style={styles.buttons}>
          <CardButton
            label="Decline"
            variant="secondary"
            onPress={onDecline}
            disabled={busy}
            loading={state === 'declining'}
          />
          <CardButton
            label="Accept"
            variant="primary"
            onPress={onAccept}
            disabled={busy}
            loading={state === 'accepting'}
          />
        </View>
      )}
    </View>
  );
}

function CardButton({
  label,
  variant,
  onPress,
  disabled,
  loading,
}: {
  label: string;
  variant: 'primary' | 'secondary';
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const primary = variant === 'primary';
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" style={{ flex: 1 }}>
      {({ pressed }) => (
        <View
          style={[
            styles.button,
            primary ? styles.buttonPrimary : styles.buttonSecondary,
            pressed && { opacity: 0.8 },
            disabled && !loading && { opacity: 0.5 },
          ]}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={[styles.buttonText, !primary && { color: '#D4D4D4' }]}>{label}</Text>
          )}
        </View>
      )}
    </Pressable>
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
  content: { paddingHorizontal: 16, paddingTop: 20, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 32 },
  emptyTitle: { color: '#D4D4D4', fontSize: 17, fontWeight: '600', marginTop: 4 },
  emptyText: { color: '#737373', fontSize: 15, textAlign: 'center' },
  link: { color: '#60A5FA', fontSize: 15, fontWeight: '600' },
  card: {
    borderRadius: 14,
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 14,
    gap: 14,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  message: { color: '#D4D4D4', fontSize: 15, lineHeight: 21 },
  strong: { color: '#F5F5F5', fontWeight: '600' },
  detail: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  detailText: { color: '#A3A3A3', fontSize: 13 },
  buttons: { flexDirection: 'row', gap: 10 },
  button: {
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPrimary: { backgroundColor: '#3B82F6' },
  buttonSecondary: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
});
