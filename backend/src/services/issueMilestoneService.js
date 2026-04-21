const { supabase } = require("../config/supabase");
const { applyMilestoneAdvance, reloadIssue, REVIEW_WINDOW_MS, syncWorkProposalPhases } = require("./issueLifecycleSync");
const { userHasDonatedToIssue } = require("./issueService");
const { privyUserIdsMatch } = require("../lib/privyUserId");

function normDbPhase(phase) {
  return String(phase ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

const BUCKET = "storage";
const ISSUES_PREFIX = "issues";

function publicUrlForPath(storagePath) {
  if (!supabase) return null;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

function extFromMime(mime) {
  const m = String(mime).toLowerCase();
  if (m === "image/jpeg" || m === "image/jpg") return "jpg";
  if (m === "image/png") return "png";
  return null;
}

async function submitMilestoneProof(issueId, workerPrivyUserId, imageBuffer, mimeType) {
  if (!supabase) return { ok: false, error: "Supabase is not configured." };
  const iid = String(issueId ?? "").trim();
  const uid = String(workerPrivyUserId ?? "").trim();
  if (!iid || !uid) return { ok: false, error: "Unauthorized." };
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) return { ok: false, error: "Image is required." };
  if (imageBuffer.length > 2 * 1024 * 1024) return { ok: false, error: "Image must be 2MB or smaller." };
  const ext = extFromMime(mimeType);
  if (!ext) return { ok: false, error: "Image must be PNG or JPEG." };

  const { data: issue, error: gErr } = await supabase.from("issues").select("*").eq("id", iid).maybeSingle();
  if (gErr) return { ok: false, error: gErr.message };
  if (!issue) return { ok: false, error: "Issue not found." };
  if (normDbPhase(issue.phase) !== "in_progress") {
    return { ok: false, error: "This issue is not in the work phase." };
  }
  if (!privyUserIdsMatch(issue.assigned_worker_privy_user_id, uid)) {
    return { ok: false, error: "Only the assigned volunteer can upload milestone proof." };
  }

  const exec = Number(issue.exec_payouts_completed) || 0;
  /** exec 0..2: upload proof for the next tranche (no payout before the first proof). */
  if (exec < 0 || exec >= 3) {
    return { ok: false, error: "Milestone proof is not expected at this stage." };
  }
  if (String(issue.milestone_proof_storage_path ?? "").trim()) {
    return { ok: false, error: "Proof already uploaded — wait for fundraisers to advance the milestone." };
  }

  const crypto = require("crypto");
  const path = `${ISSUES_PREFIX}/${iid}/milestone-proof-${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, imageBuffer, {
    contentType: mimeType,
    upsert: false,
  });
  if (upErr) return { ok: false, error: upErr.message || "Storage upload failed." };

  const deadline = new Date(Date.now() + REVIEW_WINDOW_MS).toISOString();
  const { error: uErr } = await supabase
    .from("issues")
    .update({
      milestone_proof_storage_path: path,
      milestone_review_deadline: deadline,
    })
    .eq("id", iid);
  if (uErr) {
    await supabase.storage.from(BUCKET).remove([path]);
    return { ok: false, error: uErr.message };
  }

  try {
    const fresh = await reloadIssue(iid);
    if (fresh) await syncWorkProposalPhases(iid, fresh);
  } catch {
    /* best-effort: periodic sync will still run */
  }

  return { ok: true, proof_public_url: publicUrlForPath(path), milestone_review_deadline: deadline };
}

async function donorAdvanceMilestone(issueId, viewerPrivyUserId) {
  if (!supabase) return { ok: false, error: "Supabase is not configured." };
  const iid = String(issueId ?? "").trim();
  const uid = String(viewerPrivyUserId ?? "").trim();
  if (!iid || !uid) return { ok: false, error: "Unauthorized." };

  const issue = await reloadIssue(iid);
  if (!issue) return { ok: false, error: "Issue not found." };
  if (normDbPhase(issue.phase) !== "in_progress") return { ok: false, error: "This issue is not in the work phase." };

  const isCreator = privyUserIdsMatch(issue.creator_privy_user_id, uid);
  const okDonor = await userHasDonatedToIssue(iid, uid);
  if (!isCreator && !okDonor) {
    return { ok: false, error: "Only the issue creator (fundraiser) or a donor can advance milestones.", code: "forbidden" };
  }

  if (!String(issue.milestone_proof_storage_path ?? "").trim()) {
    return { ok: false, error: "The volunteer has not uploaded proof yet." };
  }

  const deadlineMs = issue.milestone_review_deadline ? new Date(issue.milestone_review_deadline).getTime() : NaN;
  if (!Number.isFinite(deadlineMs)) {
    return { ok: false, error: "Review window is not active yet." };
  }
  if (Date.now() < deadlineMs) {
    return {
      ok: false,
      error: "The review period has not ended yet. Wait until the countdown finishes (or rely on automatic payout).",
    };
  }

  await applyMilestoneAdvance(iid, issue, {});
  return { ok: true };
}

module.exports = { submitMilestoneProof, donorAdvanceMilestone };
