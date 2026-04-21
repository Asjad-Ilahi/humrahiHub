const { supabase } = require("../config/supabase");
const {
  listWorkProposalsForViewer,
  createWorkProposal,
  listWorkProposalsForAdmin,
  reviewWorkProposal,
} = require("../services/workProposalService");

function assertSupabase(res) {
  if (!supabase) {
    res.status(500).json({
      error: "Supabase admin client is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env.",
    });
    return false;
  }
  return true;
}

async function getIssueWorkProposals(req, res) {
  if (!assertSupabase(res)) return;
  try {
    const r = await listWorkProposalsForViewer(req.params.issueId, req.privyUserId);
    if (!r.ok) {
      if (r.code === "forbidden") return res.status(403).json({ error: r.error });
      return res.status(400).json({ error: r.error });
    }
    return res.json({ data: r.proposals });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

async function postIssueWorkProposal(req, res) {
  if (!assertSupabase(res)) return;
  const { pitch, milestones } = req.body ?? {};
  try {
    const r = await createWorkProposal(req.params.issueId, req.privyUserId, { pitch, milestones });
    if (!r.ok) return res.status(400).json({ error: r.error });
    return res.status(201).json({ data: r.proposal });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

async function adminListWorkProposals(req, res) {
  if (!assertSupabase(res)) return;
  try {
    const rows = await listWorkProposalsForAdmin();
    return res.json({ data: rows });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

async function adminReviewWorkProposal(req, res) {
  if (!assertSupabase(res)) return;
  const { status } = req.body ?? {};
  try {
    const r = await reviewWorkProposal(req.params.id, { status });
    if (!r.ok) return res.status(400).json({ error: r.error });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

module.exports = {
  getIssueWorkProposals,
  postIssueWorkProposal,
  adminListWorkProposals,
  adminReviewWorkProposal,
};
