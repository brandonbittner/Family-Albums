import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Clock, ImageIcon, UserPlus, X } from 'lucide-react-native';
import { useCallback, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Avatar from '@/components/Avatar';
import GlassIconButton from '@/components/GlassIconButton';
import { useAuth } from '@/hooks/use-auth';
import {
  cancelInvite,
  fetchAlbumInvites,
  fetchAlbumMembers,
  inviteErrorMessage,
  type AlbumMember,
  type PendingInvite,
} from '@/lib/invites';
import { timeAgo } from '@/lib/time-ago';

function formatCount(n: number): string {
  return `${n} ${n === 1 ? 'artifact' : 'artifacts'}`;
}

// TODO: enhance members screen UI
export default function AlbumMembersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();
  const [members, setMembers] = useState<AlbumMember[] | null>(null);
  const [invites, setInvites] = useState<PendingInvite[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  /** Invites being cancelled, to show a spinner in place of their X. */
  const [cancelling, setCancelling] = useState<string[]>([]);

  // Refreshed each time the screen shows, e.g. after sending an invite.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      Promise.all([fetchAlbumMembers(id), fetchAlbumInvites(id)])
        .then(([m, i]) => {
          if (cancelled) return;
          setMembers(m);
          setInvites(i);
          setLoadFailed(false);
        })
        .catch((e) => {
          console.error('[AlbumMembersScreen] load failed:', e);
          if (!cancelled) setLoadFailed(true);
        });
      return () => {
        cancelled = true;
      };
    }, [id]),
  );

  const handleCancelInvite = (invite: PendingInvite) => {
    Alert.alert('Cancel invitation?', `${invite.email} won’t be able to join this album.`, [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel Invitation',
        style: 'destructive',
        onPress: async () => {
          setCancelling((prev) => [...prev, invite.id]);
          try {
            await cancelInvite(invite.id);
          } catch (e) {
            console.error('[AlbumMembersScreen] cancel invite failed:', e);
            // If it's already gone (accepted or declined), just refresh below.
            if (!(e instanceof Error && e.message === 'invite_not_found')) {
              Alert.alert('Couldn’t cancel invitation', inviteErrorMessage(e));
              setCancelling((prev) => prev.filter((id) => id !== invite.id));
              return;
            }
            fetchAlbumMembers(id)
              .then(setMembers)
              .catch(() => {});
          }
          setInvites((prev) => prev?.filter((i) => i.id !== invite.id) ?? prev);
          setCancelling((prev) => prev.filter((id) => id !== invite.id));
        },
      },
    ]);
  };

  const me = members?.find((m) => m.userId === user?.id);
  const others = members?.filter((m) => m.userId !== user?.id) ?? [];
  const loading = members === null || invites === null;

  return (
    <View style={styles.root}>
      {/* ── Nav row ── */}
      <View style={[styles.navRow, { paddingTop: insets.top + 8 }]}>
        <GlassIconButton onPress={() => router.back()} accessibilityLabel="Back">
          <ArrowLeft size={20} color="#FFFFFF" />
        </GlassIconButton>
        <Text style={styles.navTitle}>Members</Text>
        <GlassIconButton
          onPress={() => router.push({ pathname: '/album/invite', params: { id } })}
          accessibilityLabel="Invite someone"
        >
          <UserPlus size={19} color="#FFFFFF" />
        </GlassIconButton>
      </View>

      {loading ? (
        <View style={styles.center}>
          {loadFailed ? (
            <Text style={styles.empty}>Couldn’t load members.</Text>
          ) : (
            <ActivityIndicator color="#737373" />
          )}
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
          <Section title="You">
            {user && (
              <PersonRow
                seed={user.id}
                name={profile?.display_name ?? null}
                email={user.email ?? null}
                // TODO: show the real role once album roles are defined — everyone
                //       is an owner for now.
                tag="Owner"
                detail={<Detail icon="artifacts" text={formatCount(me?.artifactCount ?? 0)} />}
              />
            )}
          </Section>

          <Section title="Members" emptyText="No one else has joined this album yet.">
            {others.map((m, i) => (
              <PersonRow
                key={m.userId}
                seed={m.userId}
                name={m.name}
                email={m.email}
                tag="Owner"
                detail={<Detail icon="artifacts" text={formatCount(m.artifactCount)} />}
                divider={i > 0}
              />
            ))}
          </Section>

          {/* TODO: let members resend a pending invite (e.g. once invites are emailed). */}
          <Section title="Invited" emptyText="No pending invites.">
            {invites.map((inv, i) => (
              <Animated.View key={inv.id} exiting={FadeOut} layout={LinearTransition}>
                <PersonRow
                  seed={inv.email}
                  name={null}
                  email={inv.email}
                  detail={<Detail icon="sent" text={timeAgo(inv.sentAt)} />}
                  divider={i > 0}
                  action={
                    cancelling.includes(inv.id) ? (
                      <ActivityIndicator size="small" color="#737373" style={styles.action} />
                    ) : (
                      <Pressable
                        onPress={() => handleCancelInvite(inv)}
                        accessibilityRole="button"
                        accessibilityLabel={`Cancel invitation to ${inv.email}`}
                        hitSlop={10}
                        style={styles.action}
                      >
                        <X size={18} color="#737373" />
                      </Pressable>
                    )
                  }
                />
              </Animated.View>
            ))}
          </Section>
        </ScrollView>
      )}
    </View>
  );
}

function Section({
  title,
  emptyText,
  children,
}: {
  title: string;
  emptyText?: string;
  children: ReactNode;
}) {
  const isEmpty = !children || (Array.isArray(children) && children.length === 0);
  return (
    <View style={{ marginBottom: 28 }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.group}>
        {isEmpty ? <Text style={styles.empty}>{emptyText}</Text> : children}
      </View>
    </View>
  );
}

function PersonRow({
  seed,
  name,
  email,
  tag,
  detail,
  divider,
  action,
}: {
  seed: string;
  name: string | null;
  email: string | null;
  /** Role tag; omitted for pending invites, which their section already labels. */
  tag?: 'Owner';
  detail: ReactNode;
  divider?: boolean;
  /** Shown at the end of the row, e.g. a button to cancel an invite. */
  action?: ReactNode;
}) {
  // Someone without a name yet (e.g. invited by email) is shown by their email.
  const title = name?.trim() || email || 'Unknown';
  return (
    <View style={[styles.row, divider && styles.rowDivider]}>
      <Avatar name={name} seed={seed} fallback={email ?? undefined} size={44} />
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={styles.name} numberOfLines={1}>
          {title}
        </Text>
        {detail}
      </View>
      {tag && (
        <View style={styles.tag}>
          <Text style={styles.tagText}>{tag}</Text>
        </View>
      )}
      {action}
    </View>
  );
}

function Detail({ icon, text }: { icon: 'artifacts' | 'sent'; text: string }) {
  const Icon = icon === 'artifacts' ? ImageIcon : Clock;
  return (
    <View style={styles.detail}>
      <Icon size={14} color="#737373" />
      <Text style={styles.detailText}>{text}</Text>
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
  content: { paddingHorizontal: 16, paddingTop: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: {
    color: '#737373',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
    marginLeft: 4,
  },
  group: {
    borderRadius: 14,
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowDivider: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  name: { color: '#F5F5F5', fontSize: 16, fontWeight: '600' },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(59,130,246,0.16)',
  },
  tagText: { color: '#60A5FA', fontSize: 12, fontWeight: '600' },
  // Same size whether it holds the X or a spinner.
  action: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  detail: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  detailText: { color: '#A3A3A3', fontSize: 13 },
  empty: { color: '#737373', fontSize: 14, paddingHorizontal: 14, paddingVertical: 16 },
});
