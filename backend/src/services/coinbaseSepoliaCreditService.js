const { getAddress, isAddress } = require("viem");
const { env } = require("../config/env");
const { supabase } = require("../config/supabase");
const { requestBaseSepoliaUsdcOnce } = require("./cdpFaucetService");
const { partnerRef } = require("./coinbaseRampService");

/** @type {Set<string>} */
const creditedTxMemory = new Set();

/** Throttle return-based faucet credits per Privy user (ms since epoch). */
const lastReturnCreditAt = new Map();

function txId(tx) {
  return String(tx.transaction_id ?? tx.transactionId ?? tx.id ?? "").trim();
}

function walletFromTx(tx) {
  const w = tx.wallet_address ?? tx.walletAddress ?? tx.destination_address ?? tx.destinationAddress;
  return typeof w === "string" ? w.trim() : "";
}

/**
 * Best-effort USDC amount from webhook-shaped objects.
 * @param {Record<string, unknown>} tx
 */
function parseUsdcAmount(tx) {
  const cur = String(tx.purchase_currency ?? tx.purchaseCurrency ?? tx.coin ?? tx.asset ?? "").toUpperCase();
  const raw =
    tx.purchase_amount ??
    tx.purchaseAmount ??
    tx.coin_amount ??
    tx.coinAmount ??
    tx.crypto_amount ??
    tx.cryptoAmount ??
    tx.amount;
  const n = typeof raw === "number" ? raw : Number.parseFloat(String(raw ?? ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  if (cur && cur !== "USDC") return null;
  return n;
}

async function alreadyCredited(txKey) {
  if (!txKey) return true;
  if (creditedTxMemory.has(txKey)) return true;
  if (!supabase) return false;
  const { data, error } = await supabase
    .from("coinbase_onramp_credits")
    .select("coinbase_transaction_id")
    .eq("coinbase_transaction_id", txKey)
    .maybeSingle();
  if (error) return false;
  return Boolean(data);
}

async function markCredited(txKey, privyUserId, wallet, drips) {
  if (supabase) {
    try {
      const { error } = await supabase.from("coinbase_onramp_credits").insert({
        coinbase_transaction_id: txKey,
        privy_user_id: privyUserId,
        wallet_address: wallet,
        faucet_drips: drips,
      });
      if (error && error.code !== "23505") {
        // eslint-disable-next-line no-console
        console.error("coinbase_onramp_credits insert:", error.message);
        return;
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("coinbase_onramp_credits insert failed:", e);
      return;
    }
  }
  creditedTxMemory.add(txKey);
}

/**
 * Credits Base Sepolia test USDC via CDP Faucet when the user returns from Coinbase Onramp (no Buy Transaction API).
 * Coinbase Pay redirects with `coinbase_onramp=1`; the app calls this once. Uses COINBASE_ONRAMP_RETURN_USDC_DRIPS (default 2).
 *
 * @param {{ privyUserId: string; walletAddress: string }} p
 */
async function syncSepoliaUsdcAfterOnramp(p) {
  const { privyUserId, walletAddress } = p;
  if (!isAddress(walletAddress)) {
    const err = new Error("Invalid wallet address.");
    err.statusCode = 400;
    throw err;
  }
  const wallet = getAddress(walletAddress);

  const now = Date.now();
  const prev = lastReturnCreditAt.get(privyUserId) ?? 0;
  if (now - prev < 90_000) {
    return {
      creditedDrips: 0,
      creditedTransactionIds: [],
      partnerUserRef: partnerRef(privyUserId),
      throttled: true,
    };
  }

  const targetDrips = env.coinbaseOnrampReturnUsdcDrips;
  let total = 0;
  for (let i = 0; i < targetDrips; i++) {
    const r = await requestBaseSepoliaUsdcOnce(wallet);
    if (!r.ok) break;
    total += 1;
  }

  const syntheticId = `return:${privyUserId}:${Math.floor(now / 60_000)}`;
  if (total > 0) {
    lastReturnCreditAt.set(privyUserId, now);
    await markCredited(syntheticId, privyUserId, wallet, total);
  }

  return {
    creditedDrips: total,
    creditedTransactionIds: total > 0 ? [syntheticId] : [],
    partnerUserRef: partnerRef(privyUserId),
    throttled: false,
  };
}

/**
 * Handle verified Onramp webhook payload (shape varies).
 * @param {Record<string, unknown>} body
 */
async function creditFromOnrampWebhookBody(body) {
  const evt = String(body.event_type ?? body.eventType ?? body.type ?? "").toLowerCase();
  if (evt !== "onramp.transaction.success") {
    return { handled: false, creditedDrips: 0 };
  }
  const nested = body.transaction && typeof body.transaction === "object" ? body.transaction : body;
  const id = txId(/** @type {Record<string, unknown>} */ (nested));
  const walletRaw = walletFromTx(/** @type {Record<string, unknown>} */ (nested));
  if (!id || !walletRaw || !isAddress(walletRaw)) return { handled: true, creditedDrips: 0 };
  if (await alreadyCredited(id)) return { handled: true, creditedDrips: 0 };

  const wallet = getAddress(walletRaw);
  const amt = parseUsdcAmount(/** @type {Record<string, unknown>} */ (nested));
  const drips = Math.min(10, Math.max(1, amt != null ? Math.ceil(amt) : 1));
  let creditedDrips = 0;
  for (let i = 0; i < drips; i++) {
    const r = await requestBaseSepoliaUsdcOnce(wallet);
    if (!r.ok) break;
    creditedDrips += 1;
  }
  if (creditedDrips > 0) {
    const pref = String(
      body.partner_user_ref ?? body.partnerUserRef ?? nested.partner_user_ref ?? nested.partnerUserRef ?? "webhook"
    ).slice(0, 200);
    await markCredited(id, pref, wallet, creditedDrips);
  }
  return { handled: true, creditedDrips };
}

module.exports = {
  syncSepoliaUsdcAfterOnramp,
  creditFromOnrampWebhookBody,
};
