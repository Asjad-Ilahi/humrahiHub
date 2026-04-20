const express = require("express");
const cors = require("cors");
const { healthRoutes } = require("./routes/healthRoutes");
const { profileRoutes } = require("./routes/profileRoutes");
const { issueRoutes } = require("./routes/issueRoutes");

const app = express();

app.use(cors());
app.use(express.json());
app.use(healthRoutes);
app.use(profileRoutes);
app.use(issueRoutes);

module.exports = { app };
