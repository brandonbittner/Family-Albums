-- ── Only invite people who have an account ───────────────────────────────────
-- Invites are only seen in the app's notifications, and nothing is emailed, so
-- an invite to an address without an account would never reach anyone. Such
-- invites are now refused with 'user_not_found'.
--
-- TODO: rewrite this to email people who haven't signed up yet, with a link
--       that lets them create an account and join the album in one go. Then
--       invites to unknown addresses become valid again.
--
-- Also adds check_album_invite so the app can flag problems (unknown email,
-- already a member, …) as emails are added to the invite list, before sending.

-- Why an email can't be invited to an album right now, or null if it can.
-- Shared by check_album_invite and invite_to_album so they always agree.
CREATE FUNCTION public.album_invite_problem(p_album_id uuid, p_email text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email text := lower(trim(p_email));
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN 'not_authenticated';
  END IF;
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RETURN 'invalid_email';
  END IF;
  IF NOT public.is_album_member(p_album_id)
     OR NOT EXISTS (SELECT 1 FROM public.albums WHERE id = p_album_id AND deleted_at IS NULL) THEN
    RETURN 'album_not_found';
  END IF;
  IF v_email = (SELECT lower(email) FROM auth.users WHERE id = auth.uid()) THEN
    RETURN 'cannot_invite_self';
  END IF;
  -- Confirmed accounts only: invites are matched to confirmed emails, so an
  -- unconfirmed account couldn't see the invite anyway.
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE lower(email) = v_email AND email_confirmed_at IS NOT NULL
  ) THEN
    RETURN 'user_not_found';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.album_members m
    JOIN auth.users u ON u.id = m.user_id
    WHERE m.album_id = p_album_id AND lower(u.email) = v_email
  ) THEN
    RETURN 'already_member';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.album_invites
    WHERE album_id = p_album_id AND email = v_email
  ) THEN
    RETURN 'already_invited';
  END IF;
  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.album_invite_problem(uuid, text)
  FROM public, anon, authenticated;

-- Callable by the app. Note this lets a signed-in album member learn whether
-- an email has an account — acceptable for now, revisit with email invites.
CREATE FUNCTION public.check_album_invite(p_album_id uuid, p_email text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.album_invite_problem(p_album_id, p_email);
$$;

REVOKE EXECUTE ON FUNCTION public.check_album_invite(uuid, text) FROM public, anon;

CREATE OR REPLACE FUNCTION public.invite_to_album(p_album_id uuid, p_email text)
RETURNS public.album_invites
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_problem text := public.album_invite_problem(p_album_id, p_email);
  v_invite  public.album_invites;
BEGIN
  IF v_problem IS NOT NULL THEN
    RAISE EXCEPTION '%', v_problem;
  END IF;

  INSERT INTO public.album_invites (album_id, invited_by, email)
  VALUES (p_album_id, auth.uid(), lower(trim(p_email)))
  ON CONFLICT (album_id, email) DO NOTHING
  RETURNING * INTO v_invite;

  -- Lost a race with another invite to the same email.
  IF v_invite.id IS NULL THEN
    RAISE EXCEPTION 'already_invited';
  END IF;
  RETURN v_invite;
END;
$$;
