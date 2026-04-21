/**
 * Safe default export for tooling that resolves the package root.
 * For local full stack (WebSockets + background sync): `npm start` → `src/server.js`.
 * Vercel invokes `api/index.js` only — never `require("./src/server")` here or deploys
 * can exit on missing `ISSUE_SIGNER_SECRET` before any request runs.
 */
module.exports = require("./src/app").app;
