const { generateJwt } = require("@coinbase/cdp-sdk/auth");
const { getAddress, isAddress } = require("viem");
const { env } = require("../config/env");
const { sanitizeClientIpForCoinbase } = require("../lib/publicClientIp");

const TOKEN_URL = "https://api.developer.coinbase.com/onramp/v1/token";
const TOKEN_PATH = "/onramp/v1/token";
const TOKEN_HOST = "api.developer.coinbase.com";
const PAY_PRODUCTION = "https://pay.coinbase.com";
/** Non-production Coinbase Pay; see https://docs.cdp.coinbase.com/onramp/additional-resources/sandbox-testing */
const PAY_SANDBOX = "https://pay-sandbox.coinbase.com";

function payOrigin() {
  return env.coinbaseRampSandbox ? PAY_SANDBOX : PAY_PRODUCTION;
}

function isValidHttpUrl(s) {
  try {
    const u = new URL(String(s).trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Base app URL for Pay `redirectUrl` (must be allowlisted in CDP for production). */
function resolveOnrampRedirectBase() {
  const primary = String(env.coinbaseRampRedirectUrl || "").trim();
  if (primary && isValidHttpUrl(primary)) return primary;
  if (env.nodeEnv !== "production") return "http://localhost:3000/home";
  return "";
}

/**
 * Offramp requires `redirectUrl` (Coinbase Pay error if missing).
 * Prefer COINBASE_OFFRAMP_REDIRECT_URL when set.
 */
function resolveOfframpRedirectUrl() {
  const off = String(env.coinbaseOfframpRedirectUrl || "").trim();
  if (off && isValidHttpUrl(off)) return off;
  const shared = String(env.coinbaseRampRedirectUrl || "").trim();
  if (shared && isValidHttpUrl(shared)) return shared;
  if (env.nodeEnv !== "production") return "http://localhost:3000/home";
  return "";
}

function rampConfigured() {
  return Boolean(env.cdpApiKeyId && env.cdpApiKeySecret);
}

/**
 * @param {string | undefined} clientIp
 * @param {`0x${string}`} destinationAddress checksummed or lower
 */
async function createSessionToken(destinationAddress, clientIp) {
  if (!rampConfigured()) {
    const err = new Error("Coinbase CDP API keys are not configured on the server.");
    err.statusCode = 503;
    throw err;
  }

  if (!isAddress(destinationAddress)) {
    const err = new Error("Invalid destination address.");
    err.statusCode = 400;
    throw err;
  }
  const normalizedAddress = getAddress(destinationAddress);

  const jwt = await generateJwt({
    apiKeyId: env.cdpApiKeyId,
    apiKeySecret: env.cdpApiKeySecret,
    requestMethod: "POST",
    requestHost: TOKEN_HOST,
    requestPath: TOKEN_PATH,
    expiresIn: 120,
  });

  const body = {
    addresses: [
      {
        address: normalizedAddress,
        blockchains: [env.coinbaseRampBlockchain],
      },
    ],
    assets: ["USDC"],
  };
  const safeIp = sanitizeClientIpForCoinbase(clientIp);
  if (safeIp) body.clientIp = safeIp;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  if (!res.ok) {
    const msg =
      (json && (json.message || json.error || json.detail)) ||
      text.slice(0, 200) ||
      `Coinbase token API error (${res.status})`;
    const err = new Error(msg);
    err.statusCode = res.status >= 400 && res.status < 500 ? 400 : 502;
    throw err;
  }

  const token = json?.token;
  if (!token || typeof token !== "string") {
    const err = new Error("Coinbase token API returned an unexpected payload.");
    err.statusCode = 502;
    throw err;
  }
  return token;
}

function partnerRef(privyUserId) {
  const s = String(privyUserId || "").trim();
  return s.length <= 49 ? s : s.slice(0, 49);
}

/** Appends `coinbase_onramp=1` so the client can call the credit API after Pay returns. */
function onrampReturnRedirectUrl() {
  const base = resolveOnrampRedirectBase();
  if (!base) return undefined;
  try {
    const u = new URL(base);
    u.searchParams.set("coinbase_onramp", "1");
    return u.toString();
  } catch {
    return base;
  }
}

function buildOnrampUrl(sessionToken, partnerUserRef) {
  const q = new URLSearchParams();
  q.set("sessionToken", sessionToken);
  q.set("defaultNetwork", env.coinbaseRampBlockchain);
  q.set("defaultAsset", "USDC");
  if (partnerUserRef) q.set("partnerUserRef", partnerUserRef);
  const returnUrl = onrampReturnRedirectUrl();
  if (returnUrl) q.set("redirectUrl", returnUrl);
  const origin = payOrigin();
  if (env.coinbaseRampSandbox) {
    return `${origin}/?${q.toString()}`;
  }
  return `${origin}/buy/select-asset?${q.toString()}`;
}

/** Coinbase-hosted offramp (ACH, Coinbase balance, etc. per Coinbase product availability). */
function buildOfframpUrl(sessionToken, partnerUserRef) {
  const redirectUrl = resolveOfframpRedirectUrl();
  const q = new URLSearchParams();
  q.set("sessionToken", sessionToken);
  if (partnerUserRef) q.set("partnerUserRef", partnerUserRef);
  q.set("redirectUrl", redirectUrl);
  const origin = payOrigin();
  return `${origin}/v3/sell/input?${q.toString()}`;
}

module.exports = {
  rampConfigured,
  createSessionToken,
  buildOnrampUrl,
  buildOfframpUrl,
  partnerRef,
  resolveOfframpRedirectUrl,
  resolveOnrampRedirectBase,
};
