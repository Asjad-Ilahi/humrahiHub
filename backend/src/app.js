const express = require("express");
const cors = require("cors");
const { healthRoutes } = require("./routes/healthRoutes");
const { profileRoutes } = require("./routes/profileRoutes");
const { issueRoutes } = require("./routes/issueRoutes");
const { volunteerRoutes } = require("./routes/volunteerRoutes");
const { coinbaseRampRoutes } = require("./routes/coinbaseRampRoutes");
const { postCoinbaseOnrampWebhook } = require("./controllers/coinbaseWebhookController");

const app = express();

/** Behind Vercel / proxies so `req.ip` and secure cookies behave correctly. */
app.set("trust proxy", 1);

app.use(cors());
app.post(
  "/api/coinbase/webhooks/onramp",
  express.raw({ type: "application/json" }),
  (req, res, next) => {
    void postCoinbaseOnrampWebhook(req, res).catch(next);
  }
);
app.use(express.json());
app.use(healthRoutes);
app.use(profileRoutes);
app.use(issueRoutes);
app.use(volunteerRoutes);
app.use(coinbaseRampRoutes);

app.use((err, _req, res, _next) => {
  // eslint-disable-next-line no-console
  console.error("[backend] unhandled request error:", err);
  if (res.headersSent) return;
  const status = Number(err?.statusCode || err?.status || 500);
  res.status(status >= 400 && status < 600 ? status : 500).json({
    error: status >= 500 ? "Internal server error." : String(err?.message || "Request failed."),
  });
});

module.exports = { app };
