-- User-entered artifact date. People often only know part of it — just the
-- year, or the year and month — so each part is stored separately and may be
-- filled in only in order: year, then month, then day.
-- taken_at keeps the capture time from the file's metadata, which can be wrong
-- for scanned or imported photos, so it's never treated as the artifact date.
ALTER TABLE public.artifacts
  ADD COLUMN IF NOT EXISTS date_year  smallint CHECK (date_year BETWEEN 1 AND 9999),
  ADD COLUMN IF NOT EXISTS date_month smallint CHECK (date_month BETWEEN 1 AND 12),
  ADD COLUMN IF NOT EXISTS date_day   smallint CHECK (date_day BETWEEN 1 AND 31),
  ADD CONSTRAINT artifacts_date_parts_in_order CHECK (
    (date_month IS NULL OR date_year IS NOT NULL)
    AND (date_day IS NULL OR date_month IS NOT NULL)
  );
