const { pool } = require("../config/database");
const { supabase } = require("../config/supabase");
const { CREATE_TABLE_SQL, TRIGGER_SQL } = require("../db/userProfilesSchema");

async function ensureProfilesTable() {
  if (!pool) {
    return {
      ok: false,
      reason: "SUPABASE_DB_URL is missing. Add it in backend/.env to allow auto table setup.",
    };
  }
  await pool.query(CREATE_TABLE_SQL);
  await pool.query(TRIGGER_SQL);
  return { ok: true };
}

function validateProfileInput(body) {
  const required = ["firstName", "lastName", "phone", "street", "streetNumber", "postalCode", "city", "country"];
  const missing = required.filter((field) => !String(body?.[field] ?? "").trim());
  if (missing.length > 0) {
    return { ok: false, error: `Missing required fields: ${missing.join(", ")}` };
  }
  if (!String(body?.privyUserId ?? "").trim()) {
    return { ok: false, error: "Missing required field: privyUserId" };
  }
  const lat = body?.latitude;
  const lng = body?.longitude;
  if (lat != null && (typeof lat !== "number" || Number.isNaN(lat))) {
    return { ok: false, error: "Invalid field: latitude" };
  }
  if (lng != null && (typeof lng !== "number" || Number.isNaN(lng))) {
    return { ok: false, error: "Invalid field: longitude" };
  }
  return { ok: true };
}

function buildProfilePayload(body) {
  return {
    privy_user_id: body.privyUserId,
    email: body.email ?? null,
    first_name: body.firstName,
    second_name: body.secondName || null,
    last_name: body.lastName,
    phone: body.phone,
    street: body.street,
    street_number: body.streetNumber,
    postal_code: body.postalCode,
    city: body.city,
    country: body.country,
    chain_id: Number(body.chainId || 8453),
    wallet_address: body.walletAddress || null,
    smart_wallet_address: body.smartWalletAddress || null,
    latitude: typeof body.latitude === "number" && !Number.isNaN(body.latitude) ? body.latitude : null,
    longitude: typeof body.longitude === "number" && !Number.isNaN(body.longitude) ? body.longitude : null,
  };
}

async function getProfileByPrivyUserId(privyUserId) {
  const { data, error } = await supabase.from("user_profiles").select("*").eq("privy_user_id", privyUserId).maybeSingle();
  return { data, error };
}

async function upsertProfile(payload) {
  const { data, error } = await supabase.from("user_profiles").upsert(payload, { onConflict: "privy_user_id" }).select("*").single();
  return { data, error };
}

module.exports = {
  buildProfilePayload,
  ensureProfilesTable,
  getProfileByPrivyUserId,
  upsertProfile,
  validateProfileInput,
};
