-- One-time migration if you already created `issues` with a single `location` column.
-- Run in Supabase SQL editor, then drop `location` when data looks correct.

ALTER TABLE public.issues
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS village TEXT,
  ADD COLUMN IF NOT EXISTS street TEXT,
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

-- Move legacy `location` into street when new columns are empty
UPDATE public.issues
SET
  street = COALESCE(NULLIF(trim(street), ''), trim(location)),
  city = COALESCE(NULLIF(trim(city), ''), 'Unknown'),
  village = COALESCE(trim(village), '')
WHERE EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'issues' AND column_name = 'location'
);

UPDATE public.issues SET latitude = 0, longitude = 0 WHERE latitude IS NULL OR longitude IS NULL;

ALTER TABLE public.issues ALTER COLUMN city SET NOT NULL;
ALTER TABLE public.issues ALTER COLUMN village SET NOT NULL;
ALTER TABLE public.issues ALTER COLUMN street SET NOT NULL;
ALTER TABLE public.issues ALTER COLUMN latitude SET NOT NULL;
ALTER TABLE public.issues ALTER COLUMN longitude SET NOT NULL;

ALTER TABLE public.issues DROP COLUMN IF EXISTS location;

ALTER TABLE public.issues DROP CONSTRAINT IF EXISTS issues_lat_range;
ALTER TABLE public.issues DROP CONSTRAINT IF EXISTS issues_lng_range;
ALTER TABLE public.issues ADD CONSTRAINT issues_lat_range CHECK (latitude >= -90 AND latitude <= 90);
ALTER TABLE public.issues ADD CONSTRAINT issues_lng_range CHECK (longitude >= -180 AND longitude <= 180);

CREATE INDEX IF NOT EXISTS issues_geo_idx ON public.issues (latitude, longitude);
