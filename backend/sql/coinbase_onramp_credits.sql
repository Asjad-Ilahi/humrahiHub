-- Deduplicate Base Sepolia faucet credits tied to Coinbase Onramp transaction IDs.
-- Run in Supabase SQL editor if you use the optional persistence path.

CREATE TABLE IF NOT EXISTS public.coinbase_onramp_credits (
  coinbase_transaction_id TEXT PRIMARY KEY,
  privy_user_id TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  faucet_drips INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coinbase_onramp_credits_privy_user_id_idx
  ON public.coinbase_onramp_credits (privy_user_id);
