const dotenv = require("dotenv");

/** Single source: `backend/.env` (loaded by dotenv from the backend working directory). */
dotenv.config();

/**
 * Coinbase Onramp/Offramp token API rejects `base-sepolia` for typical smart-wallet addresses.
 * Map known testnets to the mainnet slug Coinbase expects so `COINBASE_RAMP_BLOCKCHAIN=base-sepolia` in .env cannot break ramp.
 */
function resolveCoinbaseRampBlockchain(raw) {
  const v = String(raw ?? "base").trim().toLowerCase();
  const testnetToMainnet = {
    "base-sepolia": "base",
    "ethereum-sepolia": "ethereum",
    "arbitrum-sepolia": "arbitrum",
    "optimism-sepolia": "optimism",
    "polygon-amoy": "polygon",
  };
  return testnetToMainnet[v] ?? v;
}

const env = {
  port: Number(process.env.PORT) || 5000,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  supabaseDbUrl: process.env.SUPABASE_DB_URL,
  /** Min 32 chars; used to encrypt each issue fund wallet private key at create time. */
  issueSignerSecret: process.env.ISSUE_SIGNER_SECRET,
  /** CDP Secret API key (server only) — see https://docs.cdp.coinbase.com/get-started/authentication/cdp-api-keys */
  cdpApiKeyId:
    process.env.CDP_API_KEY_ID ||
    process.env.COINBASE_CDP_API_KEY_ID ||
    process.env.KEY_NAME,
  cdpApiKeySecret:
    process.env.CDP_API_KEY_SECRET ||
    process.env.COINBASE_CDP_API_KEY_SECRET ||
    process.env.KEY_SECRET,
  /**
   * Network slug for Onramp/Offramp session token + Pay `defaultNetwork` (after testnet→mainnet coercion above).
   */
  coinbaseRampBlockchain: resolveCoinbaseRampBlockchain(
    process.env.COINBASE_RAMP_BLOCKCHAIN || "base"
  ),
  /** Absolute URL for Pay return (onramp + offramp). Offramp requires `redirectUrl` in widget. */
  coinbaseRampRedirectUrl: (process.env.COINBASE_RAMP_REDIRECT_URL || process.env.FRONTEND_URL || "").trim(),
  /** Overrides onramp return only when set; offramp uses this first if set, else coinbaseRampRedirectUrl. */
  coinbaseOfframpRedirectUrl: (process.env.COINBASE_OFFRAMP_REDIRECT_URL || "").trim(),
  nodeEnv: process.env.NODE_ENV || "development",
  /**
   * USDC faucet drips on each onramp return (`coinbase_onramp=1`) / credit call (1 USDC per drip, CDP caps apply).
   * Buy Transaction API is not used (often 401); credit runs when Coinbase redirects the user back.
   */
  coinbaseOnrampReturnUsdcDrips: Math.min(
    5,
    Math.max(1, Number(process.env.COINBASE_ONRAMP_RETURN_USDC_DRIPS) || 2)
  ),
  /**
   * Use Coinbase Pay sandbox (https://pay-sandbox.coinbase.com) for onramp/offramp.
   * Set COINBASE_RAMP_SANDBOX=false for production pay.coinbase.com links.
   */
  coinbaseRampSandbox: process.env.COINBASE_RAMP_SANDBOX !== "false",
  /** HMAC secret from CDP webhook subscription; see https://docs.cdp.coinbase.com/onramp/core-features/webhooks */
  coinbaseWebhookSecret: process.env.COINBASE_WEBHOOK_SECRET || "",
};

module.exports = { env };
