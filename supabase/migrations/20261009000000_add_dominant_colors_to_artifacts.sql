-- Add dominant_colors to artifacts for mesh gradient palette extraction.
-- Only populated for the first-ordered artifact in an album (prototype behavior).
-- TODO: when users can select cover images, populate this only for designated
--       cover artifacts instead of the first-uploaded image.
ALTER TABLE artifacts
  ADD COLUMN IF NOT EXISTS dominant_colors text[];
