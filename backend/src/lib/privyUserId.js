/**
 * Compare Privy user ids across formats (e.g. `did:privy:…` vs legacy bare ids in DB).
 */
function normalizePrivyUserIdForCompare(id) {
  const s = String(id ?? "").trim().toLowerCase();
  if (s.startsWith("did:privy:")) return s.slice("did:privy:".length);
  return s;
}

function privyUserIdsMatch(a, b) {
  const x = normalizePrivyUserIdForCompare(a);
  const y = normalizePrivyUserIdForCompare(b);
  if (!x || !y) return false;
  return x === y;
}

/** DB may store `did:privy:…` or a bare id — try all variants for `.in()` lookups. */
function privyUserIdDbLookupKeys(id) {
  const raw = String(id ?? "").trim();
  if (!raw) return [];
  const lower = raw.toLowerCase();
  const keys = new Set([raw, lower]);
  if (lower.startsWith("did:privy:")) {
    keys.add(lower.slice("did:privy:".length));
  } else {
    keys.add(`did:privy:${lower}`);
  }
  return [...keys];
}

module.exports = { normalizePrivyUserIdForCompare, privyUserIdsMatch, privyUserIdDbLookupKeys };
