const express = require("express");
const { requirePrivyUserId } = require("../middleware/privyUserId");
const { postRampSession, postCreditSepoliaUsdc } = require("../controllers/coinbaseRampController");

const coinbaseRampRoutes = express.Router();

coinbaseRampRoutes.post("/api/coinbase/ramp-session", requirePrivyUserId, postRampSession);
coinbaseRampRoutes.post("/api/coinbase/credit-sepolia-usdc", requirePrivyUserId, postCreditSepoliaUsdc);

module.exports = { coinbaseRampRoutes };
