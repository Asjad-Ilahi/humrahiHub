const multer = require("multer");
const { supabase } = require("../config/supabase");
const {
  getVolunteerStatus,
  applyVolunteer,
  listVolunteerApplicationsForAdmin,
  reviewVolunteerApplication,
} = require("../services/volunteerService");
const { listMyVolunteerEngagements } = require("../services/workProposalService");

function assertSupabase(res) {
  if (!supabase) {
    res.status(503).json({
      error: "Supabase admin client is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env.",
    });
    return false;
  }
  return true;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const ok = ["image/jpeg", "image/jpg", "image/png", "application/pdf"].includes(file.mimetype);
    cb(null, ok);
  },
});

async function getMe(req, res) {
  if (!assertSupabase(res)) return;
  try {
    const data = await getVolunteerStatus(req.privyUserId);
    return res.json({ data });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

async function getMyWork(req, res) {
  if (!assertSupabase(res)) return;
  try {
    const r = await listMyVolunteerEngagements(req.privyUserId);
    if (!r.ok) return res.status(400).json({ error: r.error });
    return res.json({ data: { assigned: r.assigned, proposals: r.proposals } });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

async function postApply(req, res) {
  if (!assertSupabase(res)) return;
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: "ID document file is required (field name: id_document)." });
  }
  const { skills, role_description, phone, availability_notes } = req.body ?? {};
  try {
    const r = await applyVolunteer({
      privyUserId: req.privyUserId,
      skills,
      roleDescription: role_description,
      phone,
      availabilityNotes: availability_notes,
      idBuffer: file.buffer,
      mimeType: file.mimetype,
    });
    if (!r.ok) return res.status(400).json({ error: r.error });
    return res.status(201).json({ data: r.application });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

async function adminListApplications(req, res) {
  if (!assertSupabase(res)) return;
  try {
    const rows = await listVolunteerApplicationsForAdmin();
    return res.json({ data: rows });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

async function adminReviewApplication(req, res) {
  if (!assertSupabase(res)) return;
  const { status, admin_note } = req.body ?? {};
  try {
    const r = await reviewVolunteerApplication(req.params.id, { status, adminNote: admin_note });
    if (!r.ok) return res.status(400).json({ error: r.error });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

module.exports = {
  volunteerUpload: upload,
  getMe,
  getMyWork,
  postApply,
  adminListApplications,
  adminReviewApplication,
};
