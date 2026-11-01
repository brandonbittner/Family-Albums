-- ── Album sharing ─────────────────────────────────────────────────────────────
-- Albums are shared by inviting people by email. Accepting an invite makes the
-- person a member; every member can see the album and everything in it.
--
-- For now every member is an owner with full access. Roles will be refined
-- later — the role column exists so that change doesn't need a new table.

-- ── album_members ─────────────────────────────────────────────────────────────

CREATE TABLE public.album_members (
  album_id   uuid        NOT NULL REFERENCES public.albums(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       text        NOT NULL DEFAULT 'owner' CHECK (role IN ('owner')),
  joined_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (album_id, user_id)
);

CREATE INDEX album_members_user_id_idx ON public.album_members (user_id);

-- ── album_invites ─────────────────────────────────────────────────────────────
-- Pending invites only: accepting or declining deletes the row. Invites are
-- addressed to an email rather than a user, so people without an account yet
-- can be invited and see the invite once they sign up with that email.

CREATE TABLE public.album_invites (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id    uuid        NOT NULL REFERENCES public.albums(id) ON DELETE CASCADE,
  invited_by  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email       text        NOT NULL CHECK (email = lower(trim(email))),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (album_id, email)
);

CREATE INDEX album_invites_email_idx ON public.album_invites (email);

-- ── Helpers ───────────────────────────────────────────────────────────────────
-- SECURITY DEFINER so policies can call them without recursing into the RLS
-- of the tables they read.

CREATE FUNCTION public.is_album_member(p_album_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.album_members
    WHERE album_id = p_album_id AND user_id = auth.uid()
  );
$$;

-- True if the artifact is in an album the current user is a member of.
CREATE FUNCTION public.is_artifact_shared_with_me(p_artifact_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.album_artifacts aa
    JOIN public.album_members m ON m.album_id = aa.album_id
    WHERE aa.artifact_id = p_artifact_id
      AND aa.removed_at IS NULL
      AND m.user_id = auth.uid()
  );
$$;

-- The signed-in user's email, lowercased — only once it's confirmed, so an
-- unconfirmed sign-up can't claim invites sent to someone else's address.
-- (With email confirmation turned off, Supabase confirms every sign-up.)
CREATE FUNCTION public.current_user_email()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT lower(email) FROM auth.users
  WHERE id = auth.uid() AND email_confirmed_at IS NOT NULL;
$$;

-- Not part of the API: only policies and the functions below use these.
REVOKE EXECUTE ON FUNCTION public.current_user_email() FROM public, anon, authenticated;

-- ── Album creator becomes a member ───────────────────────────────────────────

CREATE FUNCTION public.handle_new_album()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.album_members (album_id, user_id, role)
  VALUES (NEW.id, NEW.owner_id, 'owner')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_album_created
  AFTER INSERT ON public.albums
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_album();

INSERT INTO public.album_members (album_id, user_id, role, joined_at)
SELECT id, owner_id, 'owner', created_at FROM public.albums
ON CONFLICT DO NOTHING;

-- ── RLS: album_members and album_invites ─────────────────────────────────────
-- Read-only from the app; rows are written by the trigger and functions below.

ALTER TABLE public.album_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members can select album_members"
  ON public.album_members FOR SELECT
  USING (public.is_album_member(album_id));

ALTER TABLE public.album_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members can select album_invites"
  ON public.album_invites FOR SELECT
  USING (public.is_album_member(album_id));

-- ── RLS: albums ───────────────────────────────────────────────────────────────
-- owner_id stays as "who created it". The creator check is kept alongside the
-- member check so the album is readable in the same statement that inserts it.

DROP POLICY "owner can select albums" ON public.albums;
DROP POLICY "owner can update albums" ON public.albums;
DROP POLICY "owner can delete albums" ON public.albums;

CREATE POLICY "members can select albums"
  ON public.albums FOR SELECT
  USING (owner_id = auth.uid() OR public.is_album_member(id));

CREATE POLICY "members can update albums"
  ON public.albums FOR UPDATE
  USING (owner_id = auth.uid() OR public.is_album_member(id));

CREATE POLICY "members can delete albums"
  ON public.albums FOR DELETE
  USING (owner_id = auth.uid() OR public.is_album_member(id));

-- ── RLS: album_artifacts ─────────────────────────────────────────────────────

DROP POLICY "album owner can select album_artifacts" ON public.album_artifacts;
DROP POLICY "album owner can insert album_artifacts" ON public.album_artifacts;
DROP POLICY "album owner can update album_artifacts" ON public.album_artifacts;
DROP POLICY "album owner can delete album_artifacts" ON public.album_artifacts;

CREATE POLICY "members can select album_artifacts"
  ON public.album_artifacts FOR SELECT
  USING (removed_at IS NULL AND public.is_album_member(album_id));

CREATE POLICY "members can insert album_artifacts"
  ON public.album_artifacts FOR INSERT
  WITH CHECK (added_by = auth.uid() AND public.is_album_member(album_id));

CREATE POLICY "members can update album_artifacts"
  ON public.album_artifacts FOR UPDATE
  USING (public.is_album_member(album_id));

CREATE POLICY "members can delete album_artifacts"
  ON public.album_artifacts FOR DELETE
  USING (public.is_album_member(album_id));

-- ── RLS: artifacts ────────────────────────────────────────────────────────────
-- Visible and editable by the uploader and by members of any album holding it.

DROP POLICY "uploader can select artifacts" ON public.artifacts;
DROP POLICY "uploader can update artifacts" ON public.artifacts;

CREATE POLICY "uploader or album members can select artifacts"
  ON public.artifacts FOR SELECT
  USING (
    deleted_at IS NULL
    AND (uploaded_by = auth.uid() OR public.is_artifact_shared_with_me(id))
  );

CREATE POLICY "uploader or album members can update artifacts"
  ON public.artifacts FOR UPDATE
  USING (uploaded_by = auth.uid() OR public.is_artifact_shared_with_me(id));

-- ── RLS: profiles ─────────────────────────────────────────────────────────────

CREATE POLICY "user can select profiles of album co-members"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.album_members mine
      JOIN public.album_members theirs ON theirs.album_id = mine.album_id
      WHERE mine.user_id = auth.uid() AND theirs.user_id = profiles.id
    )
  );

-- ── Functions called by the app ──────────────────────────────────────────────
-- Errors are raised with short codes (e.g. 'already_invited') that the app
-- turns into messages.

-- Invite someone to an album by email. Any member can invite.
CREATE FUNCTION public.invite_to_album(p_album_id uuid, p_email text)
RETURNS public.album_invites
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email  text := lower(trim(p_email));
  v_invite public.album_invites;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'invalid_email';
  END IF;
  IF NOT public.is_album_member(p_album_id)
     OR NOT EXISTS (SELECT 1 FROM public.albums WHERE id = p_album_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'album_not_found';
  END IF;
  IF v_email = (SELECT lower(email) FROM auth.users WHERE id = auth.uid()) THEN
    RAISE EXCEPTION 'cannot_invite_self';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.album_members m
    JOIN auth.users u ON u.id = m.user_id
    WHERE m.album_id = p_album_id AND lower(u.email) = v_email
  ) THEN
    RAISE EXCEPTION 'already_member';
  END IF;

  INSERT INTO public.album_invites (album_id, invited_by, email)
  VALUES (p_album_id, auth.uid(), v_email)
  ON CONFLICT (album_id, email) DO NOTHING
  RETURNING * INTO v_invite;

  IF v_invite.id IS NULL THEN
    RAISE EXCEPTION 'already_invited';
  END IF;
  RETURN v_invite;
END;
$$;

-- Pending invites addressed to the signed-in user, with what the invitee
-- needs to see but can't read directly yet (album title, inviter's name).
CREATE FUNCTION public.my_album_invites()
RETURNS TABLE (
  id            uuid,
  album_id      uuid,
  album_title   text,
  invited_by    uuid,
  inviter_name  text,
  created_at    timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT i.id, i.album_id, a.title, i.invited_by, p.display_name, i.created_at
  FROM public.album_invites i
  JOIN public.albums a ON a.id = i.album_id AND a.deleted_at IS NULL
  LEFT JOIN public.profiles p ON p.id = i.invited_by
  WHERE i.email = public.current_user_email()
  ORDER BY i.created_at DESC;
$$;

-- Accept an invite: join the album and delete the invite. Returns the album id.
CREATE FUNCTION public.accept_album_invite(p_invite_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_album_id uuid;
BEGIN
  DELETE FROM public.album_invites
  WHERE id = p_invite_id AND email = public.current_user_email()
  RETURNING album_id INTO v_album_id;

  IF v_album_id IS NULL THEN
    RAISE EXCEPTION 'invite_not_found';
  END IF;

  -- TODO: give new members their real role once album roles are defined.
  INSERT INTO public.album_members (album_id, user_id, role)
  VALUES (v_album_id, auth.uid(), 'owner')
  ON CONFLICT DO NOTHING;

  RETURN v_album_id;
END;
$$;

-- Decline an invite: just delete it.
CREATE FUNCTION public.decline_album_invite(p_invite_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.album_invites
  WHERE id = p_invite_id AND email = public.current_user_email();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite_not_found';
  END IF;
END;
$$;

-- An album's members with their names, emails and how many artifacts each
-- has added. Only callable by members of that album.
CREATE FUNCTION public.album_member_list(p_album_id uuid)
RETURNS TABLE (
  user_id         uuid,
  display_name    text,
  email           text,
  role            text,
  joined_at       timestamptz,
  artifact_count  bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    m.user_id,
    p.display_name,
    u.email::text,
    m.role,
    m.joined_at,
    (
      SELECT count(*)
      FROM public.album_artifacts aa
      JOIN public.artifacts a ON a.id = aa.artifact_id
      WHERE aa.album_id = m.album_id
        AND aa.added_by = m.user_id
        AND aa.removed_at IS NULL
        AND a.status = 'ready'
        AND a.deleted_at IS NULL
    )
  FROM public.album_members m
  JOIN auth.users u ON u.id = m.user_id
  LEFT JOIN public.profiles p ON p.id = m.user_id
  WHERE m.album_id = p_album_id
    AND public.is_album_member(p_album_id)
  ORDER BY m.joined_at;
$$;

REVOKE EXECUTE ON FUNCTION public.invite_to_album(uuid, text) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.my_album_invites() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.accept_album_invite(uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.decline_album_invite(uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.album_member_list(uuid) FROM public, anon;
