/**
 * Trusts `x-privy-user-id` from the frontend. Replace with Privy access-token verification in production.
 */
function requirePrivyUserId(req, res, next) {
  const id = String(req.headers["x-privy-user-id"] ?? "").trim();
  if (!id) {
    return res.status(401).json({ error: "Missing x-privy-user-id header." });
  }
  req.privyUserId = id;
  return next();
}

module.exports = { requirePrivyUserId };
