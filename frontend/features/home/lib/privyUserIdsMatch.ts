/** Match Privy ids across `did:privy:…` vs bare forms stored in the API/DB. */
export function privyUserIdsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const key = (s: string) => {
    const t = String(s ?? "").trim().toLowerCase();
    return t.startsWith("did:privy:") ? t.slice("did:privy:".length) : t;
  };
  const x = key(String(a ?? ""));
  const y = key(String(b ?? ""));
  if (!x || !y) return false;
  return x === y;
}
