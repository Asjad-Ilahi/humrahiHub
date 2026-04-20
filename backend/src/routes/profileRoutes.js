const express = require("express");
const { fetchProfile, saveProfile, setupProfiles } = require("../controllers/profileController");

const router = express.Router();

router.post("/api/profiles/setup", setupProfiles);
router.get("/api/profiles/:privyUserId", fetchProfile);
router.post("/api/profiles/upsert", saveProfile);

module.exports = { profileRoutes: router };
