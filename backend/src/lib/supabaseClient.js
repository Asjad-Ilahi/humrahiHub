const { createClient } = require("@supabase/supabase-js");
const { env } = require("../config/env");

let cached = null;

/**
 * Server-side Supabase client (no cookie session). Uses the service role key
 * so the API can upsert `user_profiles` regardless of RLS.
 */
function getSupabaseAdmin() {
  if (!env.supabaseUrl) {
    return null;
  }
  if (!env.supabaseServiceRoleKey) {
    return null;
  }
  if (!cached) {
    cached = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return cached;
}

module.exports = { getSupabaseAdmin };
