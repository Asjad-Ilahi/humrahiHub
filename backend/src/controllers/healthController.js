const { supabase } = require("../config/supabase");
const { pool } = require("../config/database");

function getRoot(_req, res) {
  res.json({
    app: "HumRahi hub backend",
    status: "ok",
  });
}

function getHealth(_req, res) {
  res.json({
    status: "ok",
    supabaseConfigured: Boolean(supabase),
    dbSetupAvailable: Boolean(pool),
  });
}

module.exports = { getHealth, getRoot };
