-- Structured location for artifacts picked from place search. location_name
-- (added earlier) stays the display name and is the only field set when the
-- user types a free-text place such as "Grandma's house".
ALTER TABLE public.artifacts
  ADD COLUMN IF NOT EXISTS location_address  text,
  ADD COLUMN IF NOT EXISTS location_place_id text,
  ADD COLUMN IF NOT EXISTS location_lat      double precision CHECK (location_lat BETWEEN -90 AND 90),
  ADD COLUMN IF NOT EXISTS location_lng      double precision CHECK (location_lng BETWEEN -180 AND 180);
