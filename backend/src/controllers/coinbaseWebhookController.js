const { env } = require("../config/env");
const { verifyCoinbaseWebhookSignature } = require("../lib/coinbaseWebhookVerify");
const { creditFromOnrampWebhookBody } = require("../services/coinbaseSepoliaCreditService");

/**
 * POST /api/coinbase/webhooks/onramp (raw JSON body — registered before express.json() in app.js)
 */
async function postCoinbaseOnrampWebhook(req, res) {
  const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body ?? "");
  const sig = req.headers["x-hook0-signature"] ?? req.headers["X-Hook0-Signature"];

  if (!env.coinbaseWebhookSecret) {
    return res.status(503).json({
      error:
        "Webhooks require COINBASE_WEBHOOK_SECRET. Until configured, use POST /api/coinbase/credit-sepolia-usdc after onramp.",
    });
  }

  if (!verifyCoinbaseWebhookSignature(raw, Array.isArray(sig) ? sig[0] : sig, env.coinbaseWebhookSecret, req.headers)) {
    return res.status(401).json({ error: "Invalid webhook signature." });
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: "Invalid JSON." });
  }

  try {
    const out = await creditFromOnrampWebhookBody(body);
    return res.status(200).json({ ok: true, ignored: !out.handled, ...out });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("onramp webhook credit error:", e);
    return res.status(500).json({ error: "Webhook handler failed." });
  }
}

module.exports = { postCoinbaseOnrampWebhook };
