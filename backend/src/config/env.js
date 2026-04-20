const dotenv = require("dotenv");

/** Single source: `backend/.env` (loaded by dotenv from the backend working directory). */
dotenv.config();

const env = {
  port: Number(process.env.PORT) || 5000,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  supabaseDbUrl: process.env.SUPABASE_DB_URL,
  /** Min 32 chars; used to encrypt each issue fund wallet private key at create time. */
  issueSignerSecret: process.env.ISSUE_SIGNER_SECRET,
};

module.exports = { env };
