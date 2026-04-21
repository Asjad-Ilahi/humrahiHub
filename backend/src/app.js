const express = require("express");
const cors = require("cors");
const { healthRoutes } = require("./routes/healthRoutes");
const { profileRoutes } = require("./routes/profileRoutes");
const { issueRoutes } = require("./routes/issueRoutes");
const { volunteerRoutes } = require("./routes/volunteerRoutes");
const { coinbaseRampRoutes } = require("./routes/coinbaseRampRoutes");
const { postCoinbaseOnrampWebhook } = require("./controllers/coinbaseWebhookController");
const { env } = require("./config/env");

const app = express();

/** Behind Vercel / proxies so `req.ip` and secure cookies behave correctly. */
app.set("trust proxy", 1);

function allowedOriginSet() {
  const raw = [
    process.env.FRONTEND_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    env.coinbaseRampRedirectUrl,
    env.coinbaseOfframpRedirectUrl,
  ]
    .map((v) => String(v || "").trim().replace(/\/$/, ""))
    .filter(Boolean);
  return new Set(raw);
}

const allowedOrigins = allowedOriginSet();
const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    const normalized = String(origin).replace(/\/$/, "");
    let hostname = "";
    try {
      hostname = new URL(normalized).hostname;
    } catch {
      hostname = "";
    }
    if (
      allowedOrigins.has(normalized) ||
      (hostname && /\.vercel\.app$/i.test(hostname))
    ) {
      return cb(null, true);
    }
    return cb(new Error(`CORS blocked for origin: ${origin}`));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-privy-user-id", "x-admin-token"],
  credentials: false,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
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
