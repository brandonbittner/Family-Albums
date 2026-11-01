import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Mail, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Avatar from '@/components/Avatar';
import GlassIconButton from '@/components/GlassIconButton';
import { checkInviteEmail, inviteErrorMessage, inviteToAlbum, parseEmails } from '@/lib/invites';
import { supabase } from '@/lib/supabase';

/**
 * An email on the invite list. Only emails that can be invited are added;
 * `error` is set if sending to it then failed.
 */
type Recipient = { email: string; error: string | null };

/** Typed text that couldn't be added to the list, and why. */
type Rejected = { text: string; reason: string };

/** What to show under the field for emails that couldn't be added. */
function rejectionMessage(rejected: Rejected[]): string | null {
  if (rejected.length === 0) return null;
  if (rejected.length === 1) return rejected[0].reason;
  return rejected.map((r) => `${r.text}: ${r.reason}`).join('\n');
}

// TODO: send invite emails to people who haven't signed up yet, with a link
//       that lets them create an account and join the album in one go. Until
//       then only existing accounts can be invited ('User not found' otherwise),
//       since the invite only shows in the app's notifications.
// TODO: let people pick from their phone's contacts instead of typing.
export default function InviteMembersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [albumTitle, setAlbumTitle] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  /** True while typed emails are being checked before joining the list. */
  const [adding, setAdding] = useState(false);
  const [sending, setSending] = useState(false);
  /** Shown after a send where some invites didn't go through. */
  const [summary, setSummary] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('albums')
      .select('title')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => setAlbumTitle(data?.title ?? null));
  }, [id]);

  /** Why an email can't be invited (no account, already a member, …), or null. */
  const problemWith = async (email: string): Promise<string | null> => {
    try {
      const problem = await checkInviteEmail(id, email);
      return problem ? inviteErrorMessage(problem) : null;
    } catch (e) {
      console.error('[InviteMembersScreen] check failed:', email, e);
      return 'Couldn’t check this email. Please try again.';
    }
  };

  /**
   * Checks what's typed and adds the emails that can be invited to the list.
   * The rest stay in the field with an error under it. Resolves the emails
   * added, or null if any were turned away.
   */
  const addTyped = async (): Promise<string[] | null> => {
    const { valid, invalid } = parseEmails(input);
    const fresh = valid.filter((email) => !recipients.some((r) => r.email === email));
    setInputError(null);
    setSummary(null);

    setAdding(true);
    const problems = await Promise.all(fresh.map(problemWith));
    setAdding(false);

    const added = fresh.filter((_, i) => problems[i] === null);
    const rejected: Rejected[] = [
      ...invalid.map((text) => ({
        text,
        reason:
          invalid.length + fresh.length === 1
            ? `“${text}” doesn’t look like an email address.`
            : 'Not an email address.',
      })),
      ...fresh.flatMap((email, i) => {
        const reason = problems[i];
        return reason ? [{ text: email, reason }] : [];
      }),
    ];

    setRecipients((prev) => [...prev, ...added.map((email) => ({ email, error: null }))]);
    setInput(rejected.map((r) => r.text).join(', '));
    setInputError(rejectionMessage(rejected));
    return rejected.length > 0 ? null : added;
  };

  const remove = (email: string) => setRecipients((prev) => prev.filter((r) => r.email !== email));

  const toSendCount = recipients.length + parseEmails(input).valid.length;
  const canSend = toSendCount > 0 && !adding && !sending;

  const handleSend = async () => {
    if (!canSend) return;
    // Include whatever is still typed, so there's no need to tap Add first —
    // but don't send anything if some of it can't be invited.
    let typed: string[] = [];
    if (input.trim()) {
      const added = await addTyped();
      if (!added) return;
      typed = added;
    }
    const emails = [...recipients.map((r) => r.email), ...typed];

    setSending(true);
    const results = await Promise.all(
      emails.map(async (email): Promise<Recipient> => {
        try {
          await inviteToAlbum(id, email);
          return { email, error: null };
        } catch (e) {
          console.error('[InviteMembersScreen] invite failed:', email, e);
          return { email, error: inviteErrorMessage(e) };
        }
      }),
    );
    setSending(false);

    const failed = results.filter((r) => r.error !== null);
    if (failed.length === 0) {
      // Members refreshes on focus, so the invites show under Invited.
      router.back();
      return;
    }
    // Rare, since emails are checked when added (e.g. someone else invited
    // them meanwhile). Keep only the failed ones, each with its reason.
    setRecipients(failed);
    const sent = results.length - failed.length;
    setSummary(
      sent > 0
        ? `${sent} sent. ${failed.length} couldn’t be sent.`
        : failed.length === 1
          ? 'The invite couldn’t be sent.'
          : 'None of the invites could be sent.',
    );
  };

  const sendLabel =
    toSendCount > 1 ? `Send ${toSendCount} Invites` : toSendCount === 1 ? 'Send Invite' : 'Send';

  return (
    <View style={styles.root}>
      {/* ── Nav row ── */}
      <View style={[styles.navRow, { paddingTop: insets.top + 8 }]}>
        <GlassIconButton onPress={() => router.back()} accessibilityLabel="Back">
          <ArrowLeft size={20} color="#FFFFFF" />
        </GlassIconButton>
        <Text style={styles.navTitle}>Invite</Text>
        <View style={{ width: 44 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: 24 }]}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>
            {albumTitle ? `Invite people to ${albumTitle}` : 'Invite people'}
          </Text>
          <Text style={styles.subtitle}>
            Add as many emails as you like. They’ll see your invitation in their notifications when
            they sign in with that email.
          </Text>

          <View style={[styles.input, inputError && styles.inputError]}>
            <Mail size={18} color="#737373" />
            <TextInput
              value={input}
              onChangeText={(text) => {
                setInput(text);
                setInputError(null);
              }}
              placeholder="Email address"
              placeholderTextColor="#525252"
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="next"
              // Return adds the email and keeps the keyboard up for the next one.
              submitBehavior="submit"
              onSubmitEditing={() => input.trim() && !adding && addTyped()}
              editable={!adding && !sending}
              style={styles.inputText}
            />
            <Pressable
              onPress={addTyped}
              disabled={!input.trim() || adding || sending}
              accessibilityRole="button"
              accessibilityLabel="Add email"
              hitSlop={8}
            >
              {({ pressed }) => (
                <View
                  style={[
                    styles.addButton,
                    pressed && { opacity: 0.7 },
                    !input.trim() && !adding && { opacity: 0.4 },
                  ]}
                >
                  {adding ? (
                    <ActivityIndicator size="small" color="#60A5FA" />
                  ) : (
                    <Text style={styles.addText}>Add</Text>
                  )}
                </View>
              )}
            </Pressable>
          </View>
          {inputError && <Text style={styles.error}>{inputError}</Text>}

          {recipients.length > 0 && (
            <View style={{ marginTop: 24 }}>
              <Text style={styles.sectionTitle}>To invite ({recipients.length})</Text>
              <Animated.View style={styles.group} layout={LinearTransition}>
                {recipients.map((r, i) => (
                  <Animated.View
                    key={r.email}
                    entering={FadeIn}
                    exiting={FadeOut}
                    layout={LinearTransition}
                    style={[styles.row, i > 0 && styles.rowDivider]}
                  >
                    <Avatar name={null} seed={r.email} fallback={r.email} size={36} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.email} numberOfLines={1}>
                        {r.email}
                      </Text>
                      {r.error && <Text style={styles.rowError}>{r.error}</Text>}
                    </View>
                    <Pressable
                      onPress={() => remove(r.email)}
                      disabled={sending}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${r.email}`}
                      hitSlop={10}
                    >
                      <X size={18} color="#737373" />
                    </Pressable>
                  </Animated.View>
                ))}
              </Animated.View>
            </View>
          )}
        </ScrollView>

        {/* ── Send — pinned above the keyboard ── */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
          {summary && <Text style={styles.summary}>{summary}</Text>}
          <Pressable onPress={handleSend} disabled={!canSend} accessibilityRole="button">
            {({ pressed }) => (
              <View
                style={[
                  styles.send,
                  pressed && { backgroundColor: '#2563EB' },
                  !canSend && !sending && { opacity: 0.5 },
                ]}
              >
                {sending ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.sendText}>{sendLabel}</Text>
                )}
              </View>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
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
  title: { color: '#F5F5F5', fontSize: 22, fontWeight: '600', marginBottom: 8 },
  subtitle: { color: '#737373', fontSize: 15, lineHeight: 21, marginBottom: 24 },
  // Matches the create-album inputs.
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingLeft: 14,
    paddingRight: 8,
    minHeight: 50,
  },
  inputError: { borderColor: 'rgba(239,68,68,0.6)' },
  inputText: { flex: 1, color: '#F5F5F5', fontSize: 16, paddingVertical: 13 },
  // Fixed size so swapping "Add" for the spinner doesn't change its width.
  addButton: {
    width: 52,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: 'rgba(59,130,246,0.16)',
  },
  addText: { color: '#60A5FA', fontSize: 14, fontWeight: '600' },
  error: { color: '#F87171', fontSize: 14, marginTop: 8, marginLeft: 4 },
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
    paddingVertical: 10,
  },
  rowDivider: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  email: { color: '#F5F5F5', fontSize: 15 },
  rowError: { color: '#F87171', fontSize: 13 },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    backgroundColor: '#0A0A0A',
  },
  summary: { color: '#A3A3A3', fontSize: 14, textAlign: 'center' },
  send: {
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#3B82F6',
  },
  sendText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
