const { generateJwt } = require("@coinbase/cdp-sdk/auth");
const { getAddress, isAddress } = require("viem");
const { env } = require("../config/env");

const FAUCET_HOST = "api.cdp.coinbase.com";
const FAUCET_PATH = "/platform/v2/evm/faucet";
const FAUCET_URL = `https://${FAUCET_HOST}${FAUCET_PATH}`;

function faucetConfigured() {
  return Boolean(env.cdpApiKeyId && env.cdpApiKeySecret);
}

/**
 * One CDP faucet drip: 1 USDC on Base Sepolia per https://docs.cdp.coinbase.com/api-reference/v2/rest-api/faucets/request-funds-on-evm-test-networks
 * @param {string} destinationAddress
 * @returns {Promise<{ ok: boolean; status: number; detail?: string }>}
 */
async function requestBaseSepoliaUsdcOnce(destinationAddress) {
  if (!faucetConfigured()) {
    return { ok: false, status: 503, detail: "CDP API keys missing for faucet." };
  }
  if (!isAddress(destinationAddress)) {
    return { ok: false, status: 400, detail: "Invalid address." };
  }
  const address = getAddress(destinationAddress);
  const jwt = await generateJwt({
    apiKeyId: env.cdpApiKeyId,
    apiKeySecret: env.cdpApiKeySecret,
    requestMethod: "POST",
    requestHost: FAUCET_HOST,
    requestPath: FAUCET_PATH,
    expiresIn: 120,
  });

  const res = await fetch(FAUCET_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      network: "base-sepolia",
      address,
      token: "usdc",
    }),
  });

  const text = await res.text();
  if (res.ok) return { ok: true, status: res.status };
  let detail = text.slice(0, 300);
  try {
    const j = JSON.parse(text);
    detail = j.errorMessage || j.message || j.error || j.detail || detail;
  } catch {
    /* ignore */
  }
  return { ok: false, status: res.status, detail };
}

module.exports = { requestBaseSepoliaUsdcOnce, faucetConfigured };
