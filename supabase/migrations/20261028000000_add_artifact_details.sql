-- User-entered details collected after picking artifacts for upload.
-- The artifact date reuses taken_at (pre-filled from EXIF, editable by the user).
ALTER TABLE public.artifacts
  ADD COLUMN IF NOT EXISTS caption       text,
  ADD COLUMN IF NOT EXISTS location_name text;
