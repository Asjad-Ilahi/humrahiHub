const crypto = require("crypto");
const { supabase } = require("../config/supabase");

const BUCKET = "storage";
const VOLUNTEER_PREFIX = "volunteer-ids";

function publicUrlForPath(storagePath) {
  if (!supabase) return null;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

function extFromMime(mime) {
  const m = String(mime).toLowerCase();
  if (m === "image/jpeg" || m === "image/jpg") return "jpg";
  if (m === "image/png") return "png";
  if (m === "application/pdf") return "pdf";
  return null;
}

async function getVolunteerStatus(privyUserId) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const uid = String(privyUserId ?? "").trim();
  if (!uid) return { approved: false, application: null };

  const { data: vol, error: vErr } = await supabase
    .from("volunteers")
    .select("privy_user_id, approved_at")
    .eq("privy_user_id", uid)
    .maybeSingle();
  if (vErr && vErr.code === "42P01") return { approved: false, application: null };
  if (vErr) throw vErr;
  if (vol) {
    return { approved: true, application: null, approved_at: vol.approved_at };
  }

  const { data: app, error } = await supabase
    .from("volunteer_applications")
    .select("id, status, skills, role_description, created_at, reviewed_at, admin_note")
    .eq("privy_user_id", uid)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error && error.code === "42P01") return { approved: false, application: null };
  if (error) throw error;
  return { approved: false, application: app ?? null };
}

async function applyVolunteer({
  privyUserId,
  skills,
  roleDescription,
  phone,
  availabilityNotes,
  idBuffer,
  mimeType,
}) {
  if (!supabase) return { ok: false, error: "Supabase is not configured." };
  const uid = String(privyUserId ?? "").trim();
  const sk = String(skills ?? "").trim();
  const role = String(roleDescription ?? "").trim();
  const ph = String(phone ?? "").trim();
  const avail = String(availabilityNotes ?? "").trim();

  if (!uid) return { ok: false, error: "Missing user id." };
  if (!sk) return { ok: false, error: "skills is required (e.g. plumbing, electrical)." };
  if (!role) return { ok: false, error: "role_description is required." };
  if (role.length > 4000) return { ok: false, error: "role_description is too long." };
  if (!Buffer.isBuffer(idBuffer) || idBuffer.length === 0) return { ok: false, error: "ID document file is required." };
  if (idBuffer.length > 5 * 1024 * 1024) return { ok: false, error: "ID document must be 5MB or smaller." };
  const ext = extFromMime(mimeType);
  if (!ext) return { ok: false, error: "ID document must be PNG, JPEG, or PDF." };

  const { data: prof, error: pErr } = await supabase.from("user_profiles").select("privy_user_id").eq("privy_user_id", uid).maybeSingle();
  if (pErr) return { ok: false, error: pErr.message };
  if (!prof) return { ok: false, error: "Complete your profile before applying as a volunteer." };

  const { data: existingV } = await supabase.from("volunteers").select("privy_user_id").eq("privy_user_id", uid).maybeSingle();
  if (existingV) return { ok: false, error: "You are already an approved volunteer." };

  const { data: pending } = await supabase
    .from("volunteer_applications")
    .select("id")
    .eq("privy_user_id", uid)
    .eq("status", "pending")
    .maybeSingle();
  if (pending) return { ok: false, error: "You already have a pending volunteer application." };

  const docId = crypto.randomUUID();
  const path = `${VOLUNTEER_PREFIX}/${uid}/${docId}.${ext}`;
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, idBuffer, {
    contentType: mimeType,
    upsert: false,
  });
  if (upErr) return { ok: false, error: upErr.message || "Storage upload failed." };

  const { data: inserted, error: insErr } = await supabase
    .from("volunteer_applications")
    .insert({
      privy_user_id: uid,
      skills: sk,
      role_description: role,
      phone: ph || null,
      availability_notes: avail || null,
      id_document_storage_path: path,
      status: "pending",
    })
    .select("id, status, created_at")
    .single();

  if (insErr) {
    await supabase.storage.from(BUCKET).remove([path]);
    if (insErr.code === "42P01") {
      return {
        ok: false,
        error: "Volunteer tables missing. Run backend/sql/volunteers_work_proposals.sql in Supabase.",
      };
    }
    return { ok: false, error: insErr.message };
  }

  return {
    ok: true,
    application: {
      ...inserted,
      id_document_public_url: publicUrlForPath(path),
    },
  };
}

async function listVolunteerApplicationsForAdmin() {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase
    .from("volunteer_applications")
    .select(
      "id, privy_user_id, skills, role_description, phone, availability_notes, id_document_storage_path, status, created_at, reviewed_at, admin_note"
    )
    .order("created_at", { ascending: false });
  if (error) {
    if (error.code === "42P01") return [];
    throw error;
  }
  return (data ?? []).map((r) => ({
    ...r,
    id_document_public_url: publicUrlForPath(r.id_document_storage_path),
  }));
}

async function reviewVolunteerApplication(applicationId, { status, adminNote }) {
  if (!supabase) return { ok: false, error: "Supabase is not configured." };
  const id = String(applicationId ?? "").trim();
  const st = String(status ?? "").trim().toLowerCase();
  if (!id) return { ok: false, error: "Invalid application id." };
  if (!["approved", "rejected"].includes(st)) return { ok: false, error: "status must be approved or rejected." };

  const { data: row, error: gErr } = await supabase.from("volunteer_applications").select("*").eq("id", id).maybeSingle();
  if (gErr) return { ok: false, error: gErr.message };
  if (!row) return { ok: false, error: "Application not found." };
  if (row.status !== "pending") return { ok: false, error: "Application is already reviewed." };

  const now = new Date().toISOString();
  const note = String(adminNote ?? "").trim() || null;

  const { error: uErr } = await supabase
    .from("volunteer_applications")
    .update({ status: st, reviewed_at: now, admin_note: note })
    .eq("id", id)
    .eq("status", "pending");
  if (uErr) return { ok: false, error: uErr.message };

  if (st === "approved") {
    const { error: vErr } = await supabase.from("volunteers").upsert(
      {
        privy_user_id: row.privy_user_id,
        approved_at: now,
        application_id: id,
      },
      { onConflict: "privy_user_id" }
    );
    if (vErr) return { ok: false, error: vErr.message };
  }

  return { ok: true };
}

module.exports = {
  getVolunteerStatus,
  applyVolunteer,
  listVolunteerApplicationsForAdmin,
  reviewVolunteerApplication,
};
