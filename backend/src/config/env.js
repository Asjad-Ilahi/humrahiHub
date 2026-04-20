const dotenv = require("dotenv");

/** Single source: `backend/.env` (loaded by dotenv from the backend working directory). */
dotenv.config();

const env = {
  port: Number(process.env.PORT) || 5000,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  supabaseDbUrl: process.env.SUPABASE_DB_URL,
};

module.exports = { env };
