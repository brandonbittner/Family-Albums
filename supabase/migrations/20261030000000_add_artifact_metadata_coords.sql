-- GPS position from the uploaded file's EXIF data, kept so the town suggestion
-- is still available when editing later. Like taken_at, this is the file's own
-- metadata — not the user's chosen location (location_lat/location_lng) — and
-- is never shown as the artifact's location unless the user picks it.
ALTER TABLE public.artifacts
  ADD COLUMN IF NOT EXISTS metadata_lat double precision CHECK (metadata_lat BETWEEN -90 AND 90),
  ADD COLUMN IF NOT EXISTS metadata_lng double precision CHECK (metadata_lng BETWEEN -180 AND 180);
