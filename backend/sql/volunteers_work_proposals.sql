-- Run in Supabase SQL editor after user_profiles and issues exist.
-- Extends issue lifecycle with accepting_proposals (5-minute window after goal met).

ALTER TABLE public.issues
  ADD COLUMN IF NOT EXISTS accepting_proposals_ends_at TIMESTAMPTZ;

ALTER TABLE public.issues DROP CONSTRAINT IF EXISTS issues_phase_check;
ALTER TABLE public.issues
  ADD CONSTRAINT issues_phase_check CHECK (
    phase IN (
      'needs_initiation',
      'fundraising',
      'accepting_proposals',
      'in_progress',
      'completed'
    )
  );

CREATE TABLE IF NOT EXISTS public.volunteer_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  privy_user_id TEXT NOT NULL REFERENCES public.user_profiles (privy_user_id) ON DELETE CASCADE,
  skills TEXT NOT NULL DEFAULT '',
  role_description TEXT NOT NULL DEFAULT '',
  phone TEXT,
  availability_notes TEXT,
  id_document_storage_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  admin_note TEXT
);

CREATE INDEX IF NOT EXISTS volunteer_applications_status_idx ON public.volunteer_applications (status);
CREATE INDEX IF NOT EXISTS volunteer_applications_privy_idx ON public.volunteer_applications (privy_user_id);

CREATE TABLE IF NOT EXISTS public.volunteers (
  privy_user_id TEXT PRIMARY KEY REFERENCES public.user_profiles (privy_user_id) ON DELETE CASCADE,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  application_id UUID REFERENCES public.volunteer_applications (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.issue_work_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID NOT NULL REFERENCES public.issues (id) ON DELETE CASCADE,
  proposer_privy_user_id TEXT NOT NULL REFERENCES public.user_profiles (privy_user_id) ON DELETE CASCADE,
  pitch TEXT NOT NULL,
  milestones JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS issue_work_proposals_issue_idx ON public.issue_work_proposals (issue_id);
CREATE INDEX IF NOT EXISTS issue_work_proposals_proposer_idx ON public.issue_work_proposals (proposer_privy_user_id);
