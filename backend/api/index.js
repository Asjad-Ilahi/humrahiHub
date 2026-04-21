/**
 * Vercel serverless entry with crash-safe lazy boot.
 * If app import fails (env/module issue), return JSON 500 instead of
 * FUNCTION_INVOCATION_FAILED so logs show the actual cause.
 */
let cachedApp = null;
let bootError = null;

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
