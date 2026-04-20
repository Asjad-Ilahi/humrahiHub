const { Pool } = require("pg");
const { env } = require("./env");

const pool = env.supabaseDbUrl ? new Pool({ connectionString: env.supabaseDbUrl }) : null;

module.exports = { pool };
