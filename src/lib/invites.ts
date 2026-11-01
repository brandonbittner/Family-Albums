import { supabase } from '@/lib/supabase';

/** A pending invite addressed to the signed-in user. */
export type ReceivedInvite = {
  id: string;
  albumId: string;
  albumTitle: string;
  inviterId: string;
  inviterName: string | null;
  sentAt: Date;
};

/** A pending invite to an album, as seen by its members. */
export type PendingInvite = {
  id: string;
  email: string;
  sentAt: Date;
};

export type AlbumMember = {
  userId: string;
  name: string | null;
  email: string | null;
  role: string;
  artifactCount: number;
};

/** Lowercased and trimmed — how invite emails are stored and matched. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** A loose shape check (something@domain.tld); the database checks again. */
export function isValidEmail(email: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizeEmail(email));
}

/**
 * Splits typed or pasted text into emails — separated by commas, semicolons,
 * spaces or new lines. Valid ones are normalized and de-duplicated; anything
 * that isn't an email comes back in `invalid` as typed.
 */
export function parseEmails(text: string): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const part of text.split(/[\s,;]+/).filter(Boolean)) {
    if (!isValidEmail(part)) invalid.push(part);
    else if (!valid.includes(normalizeEmail(part))) valid.push(normalizeEmail(part));
  }
  return { valid, invalid };
}

// The database functions raise these codes; anything else is unexpected.
const ERROR_MESSAGES: Record<string, string> = {
  invalid_email: 'That doesn’t look like an email address.',
  album_not_found: 'This album is no longer available.',
  cannot_invite_self: 'That’s your own email address.',
  already_member: 'That person is already a member of this album.',
  already_invited: 'That person has already been invited.',
  user_not_found: 'User not found.',
  invite_not_found: 'This invitation is no longer available.',
  not_authenticated: 'You’re signed out. Please sign in again.',
};

/** A message to show for an error code, or an error, from the invite functions. */
export function inviteErrorMessage(error: unknown): string {
  const code =
    typeof error === 'string'
      ? error
      : error instanceof Error || isMessage(error)
        ? error.message
        : '';
  return ERROR_MESSAGES[code] ?? 'Something went wrong. Please try again.';
}

function isMessage(value: unknown): value is { message: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    typeof value.message === 'string'
  );
}

/**
 * Checks whether an email can be invited to the album: resolves null if so, or
 * a code saying why not (e.g. 'user_not_found', 'already_member').
 * TODO: once invites can be emailed to people without an account (letting them
 *       sign up and join the album in one go), 'user_not_found' goes away.
 */
export async function checkInviteEmail(albumId: string, email: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('check_album_invite', {
    p_album_id: albumId,
    p_email: normalizeEmail(email),
  });
  if (error) throw error;
  return data;
}

export async function inviteToAlbum(albumId: string, email: string): Promise<void> {
  const { error } = await supabase.rpc('invite_to_album', {
    p_album_id: albumId,
    p_email: normalizeEmail(email),
  });
  if (error) throw error;
}

export async function fetchMyInvites(): Promise<ReceivedInvite[]> {
  const { data, error } = await supabase.rpc('my_album_invites');
  if (error) throw error;
  return data.map((row) => ({
    id: row.id,
    albumId: row.album_id,
    albumTitle: row.album_title,
    inviterId: row.invited_by,
    inviterName: row.inviter_name,
    sentAt: new Date(row.created_at),
  }));
}

/** Joins the album; resolves its id. */
export async function acceptInvite(inviteId: string): Promise<string> {
  const { data, error } = await supabase.rpc('accept_album_invite', { p_invite_id: inviteId });
  if (error) throw error;
  return data;
}

export async function declineInvite(inviteId: string): Promise<void> {
  const { error } = await supabase.rpc('decline_album_invite', { p_invite_id: inviteId });
  if (error) throw error;
}

export async function fetchAlbumMembers(albumId: string): Promise<AlbumMember[]> {
  const { data, error } = await supabase.rpc('album_member_list', { p_album_id: albumId });
  if (error) throw error;
  return data.map((row) => ({
    userId: row.user_id,
    name: row.display_name,
    email: row.email,
    role: row.role,
    artifactCount: Number(row.artifact_count),
  }));
}

export async function fetchAlbumInvites(albumId: string): Promise<PendingInvite[]> {
  const { data, error } = await supabase
    .from('album_invites')
    .select('id, email, created_at')
    .eq('album_id', albumId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data.map((row) => ({ id: row.id, email: row.email, sentAt: new Date(row.created_at) }));
}

/**
 * Cancels a pending invite. Throws 'invite_not_found' if it's already gone —
 * e.g. the person accepted or declined it meanwhile.
 */
export async function cancelInvite(inviteId: string): Promise<void> {
  const { data, error } = await supabase
    .from('album_invites')
    .delete()
    .eq('id', inviteId)
    .select('id');
  if (error) throw error;
  if (data.length === 0) throw new Error('invite_not_found');
}
