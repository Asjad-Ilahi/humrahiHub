const { env } = require("../config/env");

function requireAdminToken(req, res, next) {
  const expected = String(env.adminReviewToken ?? "").trim();
  if (!expected) {
    return res.status(503).json({
      error: "Admin review is not configured. Set ADMIN_REVIEW_TOKEN in backend/.env.",
    });
  }
  const tok = String(req.headers["x-admin-token"] ?? "").trim();
  if (tok !== expected) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return next();
}

module.exports = { requireAdminToken };
