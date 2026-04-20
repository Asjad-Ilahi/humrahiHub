const express = require("express");

const app = express();
const PORT = process.env.PORT || 5000;

app.get("/", (_req, res) => {
  res.json({
    app: "HumRahi hub backend",
    status: "ok",
  });
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
