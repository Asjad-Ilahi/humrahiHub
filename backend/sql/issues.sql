-- Issues feed: images in Storage bucket `storage` (public), paths like issues/<id>.<ext>
-- Run in Supabase SQL editor after user_profiles exists.

CREATE TABLE IF NOT EXISTS public.issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_privy_user_id TEXT NOT NULL REFERENCES public.user_profiles (privy_user_id) ON DELETE CASCADE,
  creator_display_name TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image_storage_path TEXT NOT NULL,
  category TEXT NOT NULL,
  severity TEXT NOT NULL,
  city TEXT NOT NULL,
  village TEXT NOT NULL,
  street TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  distance_km NUMERIC(10, 2) NOT NULL DEFAULT 0,
  donation_target_cents BIGINT NOT NULL CHECK (donation_target_cents > 0),
  fund_raised_cents BIGINT NOT NULL DEFAULT 0 CHECK (fund_raised_cents >= 0),
  phase TEXT NOT NULL DEFAULT 'needs_initiation'
    CHECK (phase IN ('needs_initiation', 'fundraising', 'in_progress', 'completed')),
  follower_count INTEGER NOT NULL DEFAULT 0 CHECK (follower_count >= 0),
  initiation_threshold INTEGER NOT NULL DEFAULT 5 CHECK (initiation_threshold > 0),
  smart_wallet_address TEXT,
  signer_encrypted_payload TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fund_not_over_target CHECK (fund_raised_cents <= donation_target_cents),
  CONSTRAINT issues_lat_range CHECK (latitude >= -90 AND latitude <= 90),
  CONSTRAINT issues_lng_range CHECK (longitude >= -180 AND longitude <= 180)
);

CREATE INDEX IF NOT EXISTS issues_phase_idx ON public.issues (phase);
CREATE INDEX IF NOT EXISTS issues_creator_idx ON public.issues (creator_privy_user_id);
CREATE INDEX IF NOT EXISTS issues_geo_idx ON public.issues (latitude, longitude);

CREATE TABLE IF NOT EXISTS public.issue_initiation_votes (
  issue_id UUID NOT NULL REFERENCES public.issues (id) ON DELETE CASCADE,
  privy_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (issue_id, privy_user_id)
);

CREATE INDEX IF NOT EXISTS issue_initiation_votes_issue_idx ON public.issue_initiation_votes (issue_id);

CREATE TABLE IF NOT EXISTS public.issue_follows (
  issue_id UUID NOT NULL REFERENCES public.issues (id) ON DELETE CASCADE,
  privy_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (issue_id, privy_user_id)
);

CREATE OR REPLACE FUNCTION public.set_issues_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_issues_updated_at ON public.issues;
CREATE TRIGGER set_issues_updated_at
  BEFORE UPDATE ON public.issues
  FOR EACH ROW
  EXECUTE FUNCTION public.set_issues_updated_at();
