-- Albums: one row per photo album owned by a user.
-- Soft deletes via deleted_at; hard deletes are never used.

CREATE TABLE public.albums (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       text        NOT NULL,
  description text,
  start_date  date,
  end_date    date,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

CREATE INDEX albums_owner_id_idx ON public.albums (owner_id);

-- Keep updated_at current automatically
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER albums_set_updated_at
  BEFORE UPDATE ON public.albums
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Row Level Security: users can only touch their own non-deleted albums
ALTER TABLE public.albums ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner can select albums"
  ON public.albums FOR SELECT
  USING (owner_id = auth.uid() AND deleted_at IS NULL);

CREATE POLICY "owner can insert albums"
  ON public.albums FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "owner can update albums"
  ON public.albums FOR UPDATE
  USING (owner_id = auth.uid());

CREATE POLICY "owner can delete albums"
  ON public.albums FOR DELETE
  USING (owner_id = auth.uid());
