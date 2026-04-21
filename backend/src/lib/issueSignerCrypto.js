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

/**
 * @param {string} payloadJson JSON from encryptPrivateKeyHex
 * @returns {`0x${string}`}
 */
function decryptPrivateKeyHex(payloadJson) {
  const secret = process.env.ISSUE_SIGNER_SECRET;
  if (!secret || String(secret).length < 32) {
    throw new Error("ISSUE_SIGNER_SECRET must be set in backend/.env (minimum 32 characters).");
  }
  const o = JSON.parse(String(payloadJson ?? "{}"));
  if (o.v !== 1 || !o.iv || !o.salt || !o.ciphertext) {
    throw new Error("Invalid encrypted key payload.");
  }
  const salt = Buffer.from(String(o.salt), "hex");
  const iv = Buffer.from(String(o.iv), "hex");
  const key = crypto.scryptSync(String(secret), salt, 32);
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  let dec = decipher.update(String(o.ciphertext), "hex", "utf8");
  dec += decipher.final("utf8");
  if (!/^0x[0-9a-fA-F]{64}$/.test(dec.trim())) {
    throw new Error("Decrypted value is not a valid private key.");
  }
  return /** @type {`0x${string}`} */ (dec.trim());
}

module.exports = { encryptPrivateKeyHex, decryptPrivateKeyHex };
