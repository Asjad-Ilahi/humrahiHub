-- Issue lifecycle: proposal voting, winner assignment, milestone execution (run after volunteers_work_proposals.sql).

ALTER TABLE public.issues DROP CONSTRAINT IF EXISTS issues_phase_check;
ALTER TABLE public.issues
  ADD CONSTRAINT issues_phase_check CHECK (
    phase IN (
      'needs_initiation',
      'fundraising',
      'accepting_proposals',
      'proposal_voting',
      'in_progress',
      'completed'
    )
  );

ALTER TABLE public.issues
  ADD COLUMN IF NOT EXISTS proposal_voting_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS recommended_proposal_id UUID REFERENCES public.issue_work_proposals (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS winning_proposal_id UUID REFERENCES public.issue_work_proposals (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_worker_privy_user_id TEXT REFERENCES public.user_profiles (privy_user_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS winning_milestones_json JSONB,
  ADD COLUMN IF NOT EXISTS exec_payouts_completed INTEGER NOT NULL DEFAULT 0 CHECK (exec_payouts_completed >= 0 AND exec_payouts_completed <= 3),
  ADD COLUMN IF NOT EXISTS milestone_proof_storage_path TEXT,
  ADD COLUMN IF NOT EXISTS milestone_review_deadline TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS milestone_payout_tx_hashes JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS vault_payout_last_error TEXT;

CREATE TABLE IF NOT EXISTS public.issue_proposal_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID NOT NULL REFERENCES public.issues (id) ON DELETE CASCADE,
  proposal_id UUID NOT NULL REFERENCES public.issue_work_proposals (id) ON DELETE CASCADE,
  voter_privy_user_id TEXT NOT NULL REFERENCES public.user_profiles (privy_user_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (issue_id, voter_privy_user_id)
);

CREATE INDEX IF NOT EXISTS issue_proposal_votes_issue_idx ON public.issue_proposal_votes (issue_id);
CREATE INDEX IF NOT EXISTS issue_proposal_votes_proposal_idx ON public.issue_proposal_votes (proposal_id);
