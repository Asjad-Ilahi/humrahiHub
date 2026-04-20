const { getSupabaseAdmin } = require("../lib/supabaseClient");

const supabase = getSupabaseAdmin();

module.exports = { supabase };
