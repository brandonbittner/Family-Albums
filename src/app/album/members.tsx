import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Clock, ImageIcon, UserPlus } from 'lucide-react-native';
import { useCallback, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Avatar from '@/components/Avatar';
import GlassIconButton from '@/components/GlassIconButton';
import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/lib/supabase';
import { timeAgo } from '@/lib/time-ago';

type Member = {
  userId: string;
  name: string | null;
  email: string | null;
  role: 'Owner';
  /** Artifacts this person has added to the album. */
  artifactCount: number;
};

type Invite = {
  id: string;
  /** Name entered when inviting, if any. */
  name: string | null;
  email: string;
  sentAt: Date;
};

// TODO: fetch the album's members (people who accepted an invite) from the
//       album membership table, joined to profiles for names and with a count of
//       album_artifacts each has added. Sample data until album sharing exists.
const SAMPLE_MEMBERS: Member[] = [
  {
    userId: 'sample-member-1',
    name: 'Sample Member',
    email: 'member@example.com',
    role: 'Owner',
    artifactCount: 12,
  },
  {
    userId: 'sample-member-2',
    name: 'Another Member',
    email: 'another@example.com',
    role: 'Owner',
    artifactCount: 3,
  },
];

// TODO: fetch pending invites for this album from the invites table.
//       Sample data until album sharing exists.
const SAMPLE_INVITES: Invite[] = [
  {
    id: 'sample-invite-1',
    name: 'Invited Person',
    email: 'invited@example.com',
    sentAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
  },
  {
    id: 'sample-invite-2',
    name: null,
    email: 'pending@example.com',
    sentAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000),
  },
];

function formatCount(n: number): string {
  return `${n} ${n === 1 ? 'artifact' : 'artifacts'}`;
}

// TODO: enhance members screen UI
export default function AlbumMembersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();
  const [myCount, setMyCount] = useState<number | null>(null);

  // Count what the signed-in user has added; refreshed each time the screen shows.
  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let cancelled = false;
      supabase
        .from('album_artifacts')
        .select('*', { count: 'exact', head: true })
        .eq('album_id', id)
        .eq('added_by', user.id)
        .then(({ count, error }) => {
          if (error) console.error('[AlbumMembersScreen] count failed:', error);
          if (!cancelled) setMyCount(count ?? 0);
        });
      return () => {
        cancelled = true;
      };
    }, [id, user]),
  );

  return (
    <View style={styles.root}>
      {/* ── Nav row ── */}
      <View style={[styles.navRow, { paddingTop: insets.top + 8 }]}>
        <GlassIconButton onPress={() => router.back()} accessibilityLabel="Back">
          <ArrowLeft size={20} color="#FFFFFF" />
        </GlassIconButton>
        <Text style={styles.navTitle}>Members</Text>
        <GlassIconButton
          onPress={() => {
            // TODO: open the add-member flow — pick someone to invite (e.g. by email
            //       or from contacts), create a pending invite and add it to Invited
          }}
          accessibilityLabel="Add member"
        >
          <UserPlus size={19} color="#FFFFFF" />
        </GlassIconButton>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
        <Section title="You">
          {user && (
            <PersonRow
              seed={user.id}
              name={profile?.display_name ?? null}
              email={user.email ?? null}
              // TODO: use the user's real role once album roles exist
              tag="Owner"
              detail={
                <Detail icon="artifacts" text={myCount === null ? '…' : formatCount(myCount)} />
              }
            />
          )}
        </Section>

        <Section title="Members" emptyText="No one else has joined this album yet.">
          {SAMPLE_MEMBERS.map((m, i) => (
            <PersonRow
              key={m.userId}
              seed={m.userId}
              name={m.name}
              email={m.email}
              tag={m.role}
              detail={<Detail icon="artifacts" text={formatCount(m.artifactCount)} />}
              divider={i > 0}
            />
          ))}
        </Section>

        <Section title="Invited" emptyText="No pending invites.">
          {SAMPLE_INVITES.map((inv, i) => (
            <PersonRow
              key={inv.id}
              seed={inv.email}
              name={inv.name}
              email={inv.email}
              tag="Invited"
              detail={<Detail icon="sent" text={timeAgo(inv.sentAt)} />}
              divider={i > 0}
            />
          ))}
        </Section>
      </ScrollView>
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
}: {
  seed: string;
  name: string | null;
  email: string | null;
  tag: 'Owner' | 'Invited';
  detail: ReactNode;
  divider?: boolean;
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
      <View style={[styles.tag, tag === 'Invited' && styles.tagInvited]}>
        <Text style={[styles.tagText, tag === 'Invited' && styles.tagTextInvited]}>{tag}</Text>
      </View>
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
  tagInvited: { backgroundColor: 'rgba(245,158,11,0.14)' },
  tagText: { color: '#60A5FA', fontSize: 12, fontWeight: '600' },
  tagTextInvited: { color: '#FBBF24' },
  detail: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  detailText: { color: '#A3A3A3', fontSize: 13 },
  empty: { color: '#737373', fontSize: 14, paddingHorizontal: 14, paddingVertical: 16 },
});
