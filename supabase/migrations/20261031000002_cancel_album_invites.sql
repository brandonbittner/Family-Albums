-- ── Cancelling invites ────────────────────────────────────────────────────────
-- Any member of an album can cancel (rescind) its pending invites. Everyone is
-- an owner for now; revisit who may cancel once album roles are defined.

CREATE POLICY "members can delete album_invites"
  ON public.album_invites FOR DELETE
  USING (public.is_album_member(album_id));
