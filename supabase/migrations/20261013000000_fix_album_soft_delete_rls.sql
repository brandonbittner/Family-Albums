-- Soft-deleting an album (UPDATE ... SET deleted_at = now()) was rejected by RLS.
-- When an UPDATE reads existing columns (e.g. WHERE id = ...), Postgres also checks
-- the updated row against the table's SELECT policies. The old SELECT policy hid
-- rows with deleted_at set, so the soft-deleted row failed that check and the
-- whole UPDATE errored.
--
-- Owners can now select all of their albums; hiding soft-deleted albums is done
-- in queries with `deleted_at IS NULL`. This also lets a future "Recently
-- Deleted" view read them.

DROP POLICY "owner can select albums" ON public.albums;

CREATE POLICY "owner can select albums"
  ON public.albums FOR SELECT
  USING (owner_id = auth.uid());
