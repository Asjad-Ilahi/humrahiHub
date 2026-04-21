/**
 * Vercel serverless entry: export the Express `app` directly.
 * Vercel's Node runtime wraps `IncomingMessage` / `ServerResponse` for you.
 *
 * Do NOT use `serverless-http` here with its default AWS provider — that expects
 * Lambda (event, context) and crashes on Vercel with FUNCTION_INVOCATION_FAILED.
 */
const { app } = require("../src/app");

module.exports = app;
