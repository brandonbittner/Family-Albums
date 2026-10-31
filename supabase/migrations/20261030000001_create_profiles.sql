-- ── profiles ──────────────────────────────────────────────────────────────────
-- Public-facing details for each user (auth.users isn't exposed to the API).
-- One row per user, created automatically on sign-up.

CREATE TABLE public.profiles (
  id            uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  text        CHECK (char_length(display_name) <= 80),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Reuse the set_updated_at function created in the albums migration
CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- For now users only see their own profile. When albums are shared, widen this
-- to people who share an album with you.
CREATE POLICY "user can select own profile"
  ON public.profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "user can update own profile"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid());

-- ── Auto-create on sign-up ────────────────────────────────────────────────────
-- The app passes display_name in the sign-up metadata.

CREATE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, NULLIF(trim(NEW.raw_user_meta_data ->> 'display_name'), ''));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── Backfill users who signed up before this migration ───────────────────────

INSERT INTO public.profiles (id, display_name)
SELECT id, NULLIF(trim(raw_user_meta_data ->> 'display_name'), '')
FROM auth.users
ON CONFLICT (id) DO NOTHING;
