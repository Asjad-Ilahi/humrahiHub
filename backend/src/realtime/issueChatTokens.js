const crypto = require("crypto");
const { env } = require("../config/env");

const TTL_SEC = 15 * 60;

function hmacHex(secret, body) {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

/**
 * @param {string} issueId
 * @param {string} privyUserId
 */
function createIssueChatToken(issueId, privyUserId) {
  const secret = String(env.issueSignerSecret || "");
  if (secret.length < 32) throw new Error("ISSUE_SIGNER_SECRET missing.");
  const exp = Math.floor(Date.now() / 1000) + TTL_SEC;
  const body = JSON.stringify({ issueId, sub: privyUserId, exp });
  const sig = hmacHex(secret, body);
  return Buffer.from(`${body}|${sig}`, "utf8").toString("base64url");
}

/**
 * @param {string} token
 * @returns {{ issueId: string; sub: string; exp: number } | null}
 */
function verifyIssueChatToken(token) {
  const secret = String(env.issueSignerSecret || "");
  if (secret.length < 32) return null;
  let decoded;
  try {
    decoded = Buffer.from(String(token || "").trim(), "base64url").toString("utf8");
  } catch {
    return null;
  }
  const pipe = decoded.lastIndexOf("|");
  if (pipe <= 0) return null;
  const body = decoded.slice(0, pipe);
  const sig = decoded.slice(pipe + 1);
  const expected = hmacHex(secret, body);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return null;
  }
  let obj;
  try {
    obj = JSON.parse(body);
  } catch {
    return null;
  }
  if (!obj || typeof obj.issueId !== "string" || typeof obj.sub !== "string" || typeof obj.exp !== "number") {
    return null;
  }
  if (Math.floor(Date.now() / 1000) > obj.exp) return null;
  return obj;
}

module.exports = { createIssueChatToken, verifyIssueChatToken, TTL_SEC };
