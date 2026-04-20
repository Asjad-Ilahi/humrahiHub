const crypto = require("crypto");

/**
 * Encrypts a 0x-prefixed secp256k1 private key for server-side custody of per-issue vault EOAs.
 * Requires ISSUE_SIGNER_SECRET (>= 32 chars) in backend/.env.
 * @param {`0x${string}`} privateKeyHex
 * @returns {string} JSON string with iv, salt, ciphertext (hex)
 */
function encryptPrivateKeyHex(privateKeyHex) {
  const secret = process.env.ISSUE_SIGNER_SECRET;
  if (!secret || String(secret).length < 32) {
    throw new Error("ISSUE_SIGNER_SECRET must be set in backend/.env (minimum 32 characters).");
  }
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(String(secret), salt, 32);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let ciphertext = cipher.update(privateKeyHex, "utf8", "hex");
  ciphertext += cipher.final("hex");
  return JSON.stringify({
    v: 1,
    iv: iv.toString("hex"),
    salt: salt.toString("hex"),
    ciphertext,
  });
}

module.exports = { encryptPrivateKeyHex };
