const crypto = require("crypto");

/**
 * @param {string} payload - raw JSON string
 * @param {string|undefined} signatureHeader - X-Hook0-Signature
 * @param {string} secret - subscription secret from CDP
 * @param {import("http").IncomingHttpHeaders} headers
 * @param {number} [maxAgeMinutes]
 */
function verifyCoinbaseWebhookSignature(payload, signatureHeader, secret, headers, maxAgeMinutes = 5) {
  if (!secret || !signatureHeader || typeof payload !== "string") return false;
  try {
    /** @type {Record<string, string>} */
    const parts = {};
    for (const part of String(signatureHeader).split(",")) {
      const eq = part.indexOf("=");
      if (eq === -1) continue;
      parts[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
    }
    const timestamp = parts.t;
    const headerNamesRaw = parts.h;
    const v1 = parts.v1;
    if (!timestamp || !headerNamesRaw || !v1) return false;

    const headerNameList = headerNamesRaw.split(/\s+/).map((s) => s.trim()).filter(Boolean);
    const headerValues = headerNameList
      .map((name) => {
        const hk = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
        return hk ? String(headers[hk] ?? "") : "";
      })
      .join(".");

    const signedPayload = `${timestamp}.${headerNamesRaw}.${headerValues}.${payload}`;
    const expected = crypto.createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex");

    const v1hex = String(v1).replace(/^v1=/, "").replace(/^0x/i, "");
    let a;
    let b;
    try {
      a = Buffer.from(v1hex, "hex");
      b = Buffer.from(expected, "hex");
    } catch {
      return false;
    }
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;

    const ageSec = Date.now() / 1000 - Number(timestamp);
    if (!Number.isFinite(ageSec) || ageSec > maxAgeMinutes * 60 || ageSec < -120) return false;
    return true;
  } catch {
    return false;
  }
}

module.exports = { verifyCoinbaseWebhookSignature };
