const { isAddress } = require("viem");
const { env } = require("../config/env");
const {
  rampConfigured,
  createSessionToken,
  buildOnrampUrl,
  buildOfframpUrl,
  partnerRef,
  resolveOfframpRedirectUrl,
} = require("../services/coinbaseRampService");
const { syncSepoliaUsdcAfterOnramp } = require("../services/coinbaseSepoliaCreditService");

function readClientIp(req) {
  const xf = String(req.headers["x-forwarded-for"] || "")
    .split(",")[0]
    .trim();
  if (xf) return xf;
  const raw = req.socket?.remoteAddress;
  return raw ? String(raw).replace(/^::ffff:/, "") : undefined;
}

/**
 * POST /api/coinbase/ramp-session
 * Body: { flow: "onramp" | "offramp", destinationAddress: "0x..." }
 */
async function postRampSession(req, res) {
  if (!rampConfigured()) {
    return res.status(503).json({
      error:
        "Coinbase Onramp/Offramp is not configured. Set CDP_API_KEY_ID and CDP_API_KEY_SECRET on the backend.",
    });
  }

  const flow = String(req.body?.flow ?? "").toLowerCase();
  if (flow !== "onramp" && flow !== "offramp") {
    return res.status(400).json({ error: 'Invalid flow. Use "onramp" or "offramp".' });
  }

  if (flow === "offramp" && !resolveOfframpRedirectUrl()) {
    return res.status(400).json({
      error:
        "Offramp requires redirectUrl. Set COINBASE_OFFRAMP_REDIRECT_URL, COINBASE_RAMP_REDIRECT_URL, or FRONTEND_URL to a valid http(s) URL (must match your app; allowlist in CDP for production).",
    });
  }

  const destinationAddress = String(req.body?.destinationAddress ?? "").trim();
  if (!destinationAddress || !isAddress(destinationAddress)) {
    return res.status(400).json({ error: "destinationAddress must be a valid 0x address." });
  }

  const privyUserId = req.privyUserId;
  const pref = partnerRef(privyUserId);

  try {
    const token = await createSessionToken(destinationAddress, readClientIp(req));
    const url =
      flow === "onramp" ? buildOnrampUrl(token, pref) : buildOfframpUrl(token, pref);
    return res.json({
      data: { url, flow, sandbox: env.coinbaseRampSandbox },
    });
  } catch (e) {
    const status = e.statusCode && Number.isInteger(e.statusCode) ? e.statusCode : 500;
    const message = e instanceof Error ? e.message : "Ramp session failed.";
    return res.status(status).json({ error: message });
  }
}

/**
 * POST /api/coinbase/credit-sepolia-usdc
 * Polls Coinbase Onramp buy history for this user, then drips CDP Base Sepolia USDC faucet to match (demo).
 */
async function postCreditSepoliaUsdc(req, res) {
  if (!rampConfigured()) {
    return res.status(503).json({
      error:
        "Coinbase is not configured. Set CDP_API_KEY_ID and CDP_API_KEY_SECRET on the backend (same key works for Onramp + CDP Faucet).",
    });
  }

  const destinationAddress = String(req.body?.destinationAddress ?? "").trim();
  if (!destinationAddress || !isAddress(destinationAddress)) {
    return res.status(400).json({ error: "destinationAddress must be a valid 0x address." });
  }

  const privyUserId = req.privyUserId;
  try {
    const data = await syncSepoliaUsdcAfterOnramp({
      privyUserId,
      walletAddress: destinationAddress,
    });
    return res.json({ data });
  } catch (e) {
    const status = e.statusCode && Number.isInteger(e.statusCode) ? e.statusCode : 500;
    const message = e instanceof Error ? e.message : "Credit sync failed.";
    return res.status(status).json({ error: message });
  }
}

module.exports = { postRampSession, postCreditSepoliaUsdc };
