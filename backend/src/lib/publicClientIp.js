/**
 * Coinbase Onramp token API rejects private/loopback IPs in `clientIp`.
 * Only forward a routable public IPv4; omit otherwise (local dev, CGNAT, etc.).
 * @param {string | undefined} raw
 * @returns {string | undefined}
 */
function sanitizeClientIpForCoinbase(raw) {
  if (typeof raw !== "string") return undefined;
  let trimmed = raw.trim();
  if (/^::ffff:/i.test(trimmed)) trimmed = trimmed.replace(/^::ffff:/i, "");
  trimmed = trimmed.trim();
  if (trimmed.length === 0 || trimmed.length > 45 || /[\s\r\n]/.test(trimmed)) return undefined;
  if (!isPublicRoutableIpv4(trimmed)) return undefined;
  return trimmed;
}

/**
 * @param {string} ip
 */
function isPublicRoutableIpv4(ip) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return false;
  const o = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
  if (o.some((x) => !Number.isInteger(x) || x < 0 || x > 255)) return false;
  const [a, b] = o;
  if (a === 0) return false;
  if (a === 10) return false;
  if (a === 127) return false;
  if (a === 169 && o[1] === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a >= 224) return false;
  return true;
}

module.exports = { sanitizeClientIpForCoinbase };
