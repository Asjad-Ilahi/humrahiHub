/**
 * Vercel serverless entry: runs the same Express `app` as local `server.js`,
 * without starting `http.Server` or WebSockets (those require a long-running host).
 */
const serverless = require("serverless-http");
const { app } = require("../src/app");

module.exports = serverless(app);
