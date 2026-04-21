const { supabase } = require("../config/supabase");
const { privyUserIdsMatch, privyUserIdDbLookupKeys } = require("../lib/privyUserId");
const { syncWorkProposalPhases } = require("./issueLifecycleSync");
const { userHasDonatedToIssue, syncFundraisingPhaseIfMet, countInitiations } = require("./issueService");

function validateMilestones(milestones) {
  if (!Array.isArray(milestones) || milestones.length !== 3) {
    return "Exactly 3 milestones are required.";
  }
  let sum = 0;
  for (let i = 0; i < 3; i += 1) {
    const title = String(milestones[i]?.title ?? "").trim();
    const pct = Number(milestones[i]?.percent);
    if (!title) return `Milestone ${i + 1} title is required.`;
    if (!Number.isFinite(pct) || pct < 1 || pct > 99) {
      return `Milestone ${i + 1} percent must be a whole number between 1 and 99.`;
    }
    if (!Number.isInteger(pct)) return `Milestone ${i + 1} percent must be an integer.`;
    sum += pct;
  }
  if (sum !== 100) return "Milestone percents must sum to 100.";
  return null;
}

async function isApprovedVolunteer(privyUserId) {
  const keys = privyUserIdDbLookupKeys(privyUserId);
  if (keys.length === 0) return false;
  const { data, error } = await supabase.from("volunteers").select("privy_user_id").in("privy_user_id", keys).limit(1);
  if (error?.code === "42P01") return false;
  return Array.isArray(data) && data.length > 0;
}

async function listWorkProposalsForViewer(issueId, viewerPrivyUserId) {
  if (!supabase) return { ok: false, error: "Supabase is not configured." };
  const iid = String(issueId ?? "").trim();
  const uid = String(viewerPrivyUserId ?? "").trim();
  if (!iid || !uid) return { ok: false, error: "Unauthorized." };

  const donated = await userHasDonatedToIssue(iid, uid);
  if (!donated) {
    return { ok: false, error: "Only people who donated to this issue can view work proposals.", code: "forbidden" };
  }

  const { data: issueRow, error: issErr } = await supabase.from("issues").select("*").eq("id", iid).maybeSingle();
  if (issErr) return { ok: false, error: issErr.message };
  if (!issueRow) return { ok: false, error: "Issue not found." };
  const initiation_count = await countInitiations(iid);
  let phase = await syncFundraisingPhaseIfMet(iid, initiation_count, issueRow.phase);
  const wp = await syncWorkProposalPhases(iid, { ...issueRow, phase });
  phase = wp.phase;
  if (!["accepting_proposals", "proposal_voting", "in_progress", "completed"].includes(phase)) {
    return { ok: false, error: "Proposals are not visible for this issue phase.", code: "forbidden" };
  }

  const { data, error } = await supabase
    .from("issue_work_proposals")
    .select("id, issue_id, proposer_privy_user_id, pitch, milestones, status, created_at, reviewed_at")
    .eq("issue_id", iid)
    .order("created_at", { ascending: false });
  if (error) {
    if (error.code === "42P01") {
      return {
        ok: false,
        error: "Work proposals table missing. Run backend/sql/volunteers_work_proposals.sql.",
      };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true, proposals: data ?? [] };
}

async function createWorkProposal(issueId, proposerPrivyUserId, { pitch, milestones }) {
  if (!supabase) return { ok: false, error: "Supabase is not configured." };
  const iid = String(issueId ?? "").trim();
  const uid = String(proposerPrivyUserId ?? "").trim();
  const p = String(pitch ?? "").trim();
  if (!iid || !uid) return { ok: false, error: "Invalid request." };
  if (!p || p.length > 4000) return { ok: false, error: "pitch is required (max 4000 characters)." };

  const mErr = validateMilestones(milestones);
  if (mErr) return { ok: false, error: mErr };

  if (!(await isApprovedVolunteer(uid))) {
    return { ok: false, error: "Only approved volunteers can submit work proposals." };
  }

  const uidKeys = privyUserIdDbLookupKeys(uid);
  const { data: profRows } = await supabase
    .from("user_profiles")
    .select("privy_user_id")
    .in("privy_user_id", uidKeys)
    .limit(1);
  if (!profRows?.length) return { ok: false, error: "Complete your profile first." };

  const { data: issue, error: gErr } = await supabase.from("issues").select("*").eq("id", iid).maybeSingle();
  if (gErr) return { ok: false, error: gErr.message };
  if (!issue) return { ok: false, error: "Issue not found." };

  const initiation_count = await countInitiations(iid);
  let phase = await syncFundraisingPhaseIfMet(iid, initiation_count, issue.phase);
  const wp = await syncWorkProposalPhases(iid, { ...issue, phase });
  phase = wp.phase;
  if (phase !== "accepting_proposals") {
    return { ok: false, error: "This issue is not accepting work proposals right now." };
  }

  const { count: existingCount, error: cntErr } = await supabase
    .from("issue_work_proposals")
    .select("*", { count: "exact", head: true })
    .eq("issue_id", iid)
    .in("proposer_privy_user_id", uidKeys);
  if (cntErr) return { ok: false, error: cntErr.message };
  if ((existingCount ?? 0) > 0) {
    return { ok: false, error: "You can only submit one proposal per issue." };
  }

  const { data: inserted, error: insErr } = await supabase
    .from("issue_work_proposals")
    .insert({
      issue_id: iid,
      proposer_privy_user_id: uid,
      pitch: p,
      milestones,
      status: "pending",
    })
    .select("id, pitch, milestones, status, created_at")
    .single();

  if (insErr) {
    if (insErr.code === "42P01") {
      return {
        ok: false,
        error: "Work proposals table missing. Run backend/sql/volunteers_work_proposals.sql.",
      };
    }
    return { ok: false, error: insErr.message };
  }

  const { data: postIssue } = await supabase.from("issues").select("*").eq("id", iid).maybeSingle();
  if (postIssue) {
    try {
      await syncWorkProposalPhases(iid, postIssue);
    } catch {
      /* periodic sync will advance phase */
    }
  }

  return { ok: true, proposal: inserted };
}

async function listWorkProposalsForAdmin() {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase
    .from("issue_work_proposals")
    .select("id, issue_id, proposer_privy_user_id, pitch, milestones, status, created_at, reviewed_at")
    .order("created_at", { ascending: false });
  if (error) {
    if (error.code === "42P01") return [];
    throw error;
  }
  return data ?? [];
}

async function reviewWorkProposal(proposalId, { status }) {
  if (!supabase) return { ok: false, error: "Supabase is not configured." };
  const id = String(proposalId ?? "").trim();
  const st = String(status ?? "").trim().toLowerCase();
  if (!id) return { ok: false, error: "Invalid proposal id." };
  if (!["accepted", "rejected"].includes(st)) return { ok: false, error: "status must be accepted or rejected." };

  const { data: row, error: gErr } = await supabase.from("issue_work_proposals").select("*").eq("id", id).maybeSingle();
  if (gErr) return { ok: false, error: gErr.message };
  if (!row) return { ok: false, error: "Proposal not found." };
  if (row.status !== "pending") return { ok: false, error: "Proposal is already reviewed." };

  const now = new Date().toISOString();
  const { error: uErr } = await supabase
    .from("issue_work_proposals")
    .update({ status: st, reviewed_at: now })
    .eq("id", id)
    .eq("status", "pending");
  if (uErr) return { ok: false, error: uErr.message };

  if (st === "accepted") {
    await supabase
      .from("issue_work_proposals")
      .update({ status: "rejected", reviewed_at: now })
      .eq("issue_id", row.issue_id)
      .eq("status", "pending")
      .neq("id", id);
  }

  return { ok: true };
}

function issueImagePublicUrl(storagePath) {
  if (!supabase || !storagePath) return null;
  const { data } = supabase.storage.from("storage").getPublicUrl(String(storagePath));
  return data.publicUrl;
}

/** Normalize DB phase strings for clients (e.g. "In progress" → "in_progress"). */
function normalizeIssuePhase(phase) {
  const s = String(phase ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  return s.length > 0 ? s : null;
}

/**
 * Volunteer-centric summary: issues where the viewer is the assigned worker, plus their submitted proposals.
 */
async function listMyVolunteerEngagements(privyUserId) {
  const uid = String(privyUserId ?? "").trim();
  if (!uid) return { ok: false, error: "Unauthorized." };
  if (!supabase) return { ok: false, error: "Supabase is not configured." };

  const { data: assigned, error: aErr } = await supabase
    .from("issues")
    .select("id, title, phase, image_storage_path, exec_payouts_completed, fund_raised_cents, donation_target_cents")
    .eq("assigned_worker_privy_user_id", uid)
    .order("updated_at", { ascending: false });

  if (aErr?.code === "42P01") {
    return { ok: true, assigned: [], proposals: [] };
  }
  if (aErr) return { ok: false, error: aErr.message };

  const { data: proposals, error: pErr } = await supabase
    .from("issue_work_proposals")
    .select("id, issue_id, status, created_at, pitch")
    .eq("proposer_privy_user_id", uid)
    .order("created_at", { ascending: false });

  if (pErr?.code === "42P01") {
    return {
      ok: true,
      assigned: (assigned ?? []).map((r) => ({
        issue_id: r.id,
        title: r.title,
        phase: normalizeIssuePhase(r.phase) ?? String(r.phase ?? ""),
        image_public_url: issueImagePublicUrl(r.image_storage_path),
        exec_payouts_completed: r.exec_payouts_completed,
        fund_raised_cents: r.fund_raised_cents,
        donation_target_cents: r.donation_target_cents,
      })),
      proposals: [],
    };
  }
  if (pErr) return { ok: false, error: pErr.message };

  const propRows = proposals ?? [];
  const propIssueIds = [...new Set(propRows.map((p) => p.issue_id))];
  const issueById = new Map();
  if (propIssueIds.length > 0) {
    const { data: iss, error: iErr } = await supabase
      .from("issues")
      .select("id, title, phase, image_storage_path, assigned_worker_privy_user_id")
      .in("id", propIssueIds);
    if (iErr) return { ok: false, error: iErr.message };
    (iss ?? []).forEach((r) => issueById.set(r.id, r));
  }

  return {
    ok: true,
    assigned: (assigned ?? []).map((r) => ({
      issue_id: r.id,
      title: r.title,
      phase: normalizeIssuePhase(r.phase) ?? String(r.phase ?? ""),
      image_public_url: issueImagePublicUrl(r.image_storage_path),
      exec_payouts_completed: r.exec_payouts_completed,
      fund_raised_cents: r.fund_raised_cents,
      donation_target_cents: r.donation_target_cents,
    })),
    proposals: propRows.map((p) => {
      const iss = issueById.get(p.issue_id);
      return {
        proposal_id: p.id,
        issue_id: p.issue_id,
        status: p.status,
        created_at: p.created_at,
        pitch: p.pitch,
        issue_title: iss?.title ?? null,
        issue_phase: iss ? normalizeIssuePhase(iss.phase) : null,
        issue_image_public_url: iss ? issueImagePublicUrl(iss.image_storage_path) : null,
        is_assigned_worker: iss ? privyUserIdsMatch(iss.assigned_worker_privy_user_id, uid) : false,
      };
    }),
  };
}

module.exports = {
  listWorkProposalsForViewer,
  createWorkProposal,
  listWorkProposalsForAdmin,
  reviewWorkProposal,
  listMyVolunteerEngagements,
};
