const express = require("express");
const cors = require("cors");
const { healthRoutes } = require("./routes/healthRoutes");
const { profileRoutes } = require("./routes/profileRoutes");
const { issueRoutes } = require("./routes/issueRoutes");
const { volunteerRoutes } = require("./routes/volunteerRoutes");
const { coinbaseRampRoutes } = require("./routes/coinbaseRampRoutes");
const { postCoinbaseOnrampWebhook } = require("./controllers/coinbaseWebhookController");

const app = express();

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

module.exports = { app };
