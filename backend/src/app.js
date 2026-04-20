const express = require("express");
const cors = require("cors");
const { healthRoutes } = require("./routes/healthRoutes");
const { profileRoutes } = require("./routes/profileRoutes");

const app = express();

app.use(cors());
app.use(express.json());
app.use(healthRoutes);
app.use(profileRoutes);

module.exports = { app };
