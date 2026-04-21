-- Per-issue donations (on-chain USDC on Base Sepolia, amounts stored as USD cents) and community chat.
-- Run in Supabase SQL editor after `issues` exists.

CREATE TABLE IF NOT EXISTS public.issue_donations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID NOT NULL REFERENCES public.issues (id) ON DELETE CASCADE,
  privy_user_id TEXT NOT NULL,
  donor_display_name TEXT NOT NULL DEFAULT '',
  usd_cents BIGINT NOT NULL CHECK (usd_cents > 0),
  tx_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS issue_donations_issue_idx ON public.issue_donations (issue_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.issue_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID NOT NULL REFERENCES public.issues (id) ON DELETE CASCADE,
  privy_user_id TEXT NOT NULL,
  sender_display_name TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL CHECK (char_length(body) > 0 AND char_length(body) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS issue_chat_issue_created_idx ON public.issue_chat_messages (issue_id, created_at);
