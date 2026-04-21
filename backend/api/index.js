/**
 * Vercel serverless entry with crash-safe lazy boot.
 * If app import fails (env/module issue), return JSON 500 instead of
 * FUNCTION_INVOCATION_FAILED so logs show the actual cause.
 */
let cachedApp = null;
let bootError = null;

function applyCorsHeaders(req, res) {
  const origin = String(req?.headers?.origin || "").trim();
  if (origin) {
    res.setHeader("access-control-allow-origin", origin);
    res.setHeader("vary", "origin");
  } else {
    res.setHeader("access-control-allow-origin", "*");
  }
  res.setHeader("access-control-allow-methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("access-control-allow-headers", "Content-Type, Authorization, x-privy-user-id, x-admin-token");
}

function ensureAppLoaded() {
  if (cachedApp || bootError) return;
  try {
    cachedApp = require("../src/app").app;
  } catch (err) {
    bootError = err;
    // eslint-disable-next-line no-console
    console.error("[backend] app boot failed:", err);
  }
}

module.exports = (req, res) => {
  applyCorsHeaders(req, res);
  if (String(req.method || "").toUpperCase() === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  ensureAppLoaded();

  if (bootError) {
    const message = bootError instanceof Error ? bootError.message : "Unknown boot error";
    const stack = bootError instanceof Error ? bootError.stack : String(bootError);
    res.statusCode = 500;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(
      JSON.stringify({
        error: "Backend boot failed.",
        message,
        // expose stack only outside production for easier debugging
        ...(process.env.NODE_ENV === "production" ? {} : { stack }),
      })
    );
    return;
  }

  return cachedApp(req, res);
};
