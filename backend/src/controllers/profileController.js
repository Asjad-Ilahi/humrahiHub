const { supabase } = require("../config/supabase");
const {
  buildProfilePayload,
  ensureProfilesTable,
  getProfileByPrivyUserId,
  upsertProfile,
  validateProfileInput,
} = require("../services/profileService");

function assertSupabaseConfigured(res) {
  if (!supabase) {
    res.status(500).json({
      error:
        "Supabase admin client is not configured. In backend/.env set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (Dashboard → Settings → API → service_role). The anon/publishable key cannot be used for server upserts.",
    });
    return false;
  }
  return true;
}

async function setupProfiles(_req, res) {
  try {
    const result = await ensureProfilesTable();
    if (!result.ok) {
      return res.status(400).json(result);
    }
    return res.json({ ok: true, message: "user_profiles table is ready." });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function fetchProfile(req, res) {
  if (!assertSupabaseConfigured(res)) return;

  try {
    const { data, error } = await getProfileByPrivyUserId(req.params.privyUserId);
    if (error) {
      return res.status(400).json({ error: error.message, code: error.code });
    }
    return res.json({ data: data ?? null });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function saveProfile(req, res) {
  if (!assertSupabaseConfigured(res)) return;

  const validation = validateProfileInput(req.body);
  if (!validation.ok) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    const payload = buildProfilePayload(req.body);
    const { data, error } = await upsertProfile(payload);

    if (error) {
      if (error.code === "PGRST205") {
        return res.status(400).json({
          error:
            "Table public.user_profiles not found in schema cache. Call POST /api/profiles/setup after adding SUPABASE_DB_URL, or create the table manually.",
          code: error.code,
        });
      }
      return res.status(400).json({ error: error.message, code: error.code });
    }

    return res.json({ data });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

module.exports = { fetchProfile, saveProfile, setupProfiles };
