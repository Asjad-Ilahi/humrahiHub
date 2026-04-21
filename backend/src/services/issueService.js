const crypto = require("crypto");
const { supabase } = require("../config/supabase");
const { createIssueVaultCredentials } = require("../lib/issueVaultWallet");
const { privyUserIdDbLookupKeys } = require("../lib/privyUserId");
const { syncWorkProposalPhases, ensureWinningMilestonesOnRow } = require("./issueLifecycleSync");

const BUCKET = "storage";
const ISSUES_PREFIX = "issues";

const CATEGORIES = new Set(["Infrastructure", "Environment", "Education", "Community", "Safety"]);
const SEVERITIES = new Set(["low", "medium", "critical"]);

const ISSUE_SELECT_FIELDS =
  "id, creator_privy_user_id, creator_display_name, title, description, image_storage_path, category, severity, city, village, street, latitude, longitude, distance_km, donation_target_cents, fund_raised_cents, phase, accepting_proposals_ends_at, proposal_voting_ends_at, recommended_proposal_id, winning_proposal_id, assigned_worker_privy_user_id, winning_milestones_json, exec_payouts_completed, milestone_proof_storage_path, milestone_review_deadline, milestone_payout_tx_hashes, vault_payout_last_error, follower_count, initiation_threshold, smart_wallet_address, created_at, updated_at";

/**
 * Community initiations required before fundraising (new rows + API display + phase transition).
 * Hardcoded to 1 for hackathon testing; raise later or wire to env when you need higher thresholds.
 */
const REQUIRED_INITIATIONS = 1;

function publicUrlForPath(storagePath) {
  if (!supabase) return null;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

function locationLineFromIssueRow(row) {
  const city = row.city != null ? String(row.city).trim() : "";
  const village = row.village != null ? String(row.village).trim() : "";
  const street = row.street != null ? String(row.street).trim() : "";
  if (city || village || street) {
    return [street, village, city].filter((s) => s.length > 0).join(", ");
  }
  return String(row.location ?? "").trim();
}

function toProfileIssueSummary(row) {
  return {
    id: row.id,
    title: row.title,
    phase: row.phase,
    category: row.category,
    severity: row.severity,
    image_public_url: publicUrlForPath(row.image_storage_path),
    location: locationLineFromIssueRow(row),
    created_at: row.created_at,
  };
}

async function listMyFollowedIssueSummaries(forPrivyUserId) {
  if (!supabase) return [];
  const uid = String(forPrivyUserId ?? "").trim();
  if (!uid) return [];
  const { data: follows, error } = await supabase.from("issue_follows").select("issue_id").eq("privy_user_id", uid);
  if (error) {
    if (error.code === "42P01") return [];
    throw error;
  }
  const ids = [...new Set((follows ?? []).map((f) => f.issue_id))];
  if (ids.length === 0) return [];
  const { data: rows, error: e2 } = await supabase
    .from("issues")
    .select(ISSUE_SELECT_FIELDS)
    .in("id", ids)
    .order("created_at", { ascending: false });
  if (e2) throw e2;
  return (rows ?? []).map(toProfileIssueSummary);
}

async function listMyReportedIssueSummaries(forPrivyUserId) {
  if (!supabase) return [];
  const uid = String(forPrivyUserId ?? "").trim();
  if (!uid) return [];
  const { data: rows, error } = await supabase
    .from("issues")
    .select(ISSUE_SELECT_FIELDS)
    .eq("creator_privy_user_id", uid)
    .order("created_at", { ascending: false });
  if (error) {
    if (error.code === "42P01") return [];
    throw error;
  }
  return (rows ?? []).map(toProfileIssueSummary);
}

async function getCreatorDisplayName(privyUserId) {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("first_name, last_name")
    .eq("privy_user_id", privyUserId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const parts = [data.first_name, data.last_name]
    .filter(Boolean)
    .map((s) => String(s).trim())
    .filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}

async function countInitiations(issueId) {
  const { count, error } = await supabase
    .from("issue_initiation_votes")
    .select("*", { count: "exact", head: true })
    .eq("issue_id", issueId);
  if (error) throw error;
  return count ?? 0;
}

async function promoteIssueToFundraising(issueId) {
  const { data, error } = await supabase
    .from("issues")
    .update({ phase: "fundraising" })
    .eq("id", issueId)
    .eq("phase", "needs_initiation")
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * If votes already meet the threshold but `issues.phase` was never updated (stuck rows), promote now.
 * Runs on every list so the dashboard self-heals without a manual SQL fix.
 */
async function syncFundraisingPhaseIfMet(issueId, initiationCount, storedPhase) {
  if (storedPhase !== "needs_initiation") return storedPhase;
  if (initiationCount < REQUIRED_INITIATIONS) return storedPhase;

  let promoted = await promoteIssueToFundraising(issueId);
  if (promoted?.phase === "fundraising") return "fundraising";

  const { data: current } = await supabase.from("issues").select("phase").eq("id", issueId).maybeSingle();
  if (current?.phase === "fundraising") return "fundraising";

  if (current?.phase === "needs_initiation") {
    promoted = await promoteIssueToFundraising(issueId);
    if (promoted?.phase === "fundraising") return "fundraising";
    const { data: forced, error: fErr } = await supabase
      .from("issues")
      .update({ phase: "fundraising" })
      .eq("id", issueId)
      .select("phase")
      .maybeSingle();
    if (!fErr && forced?.phase === "fundraising") return "fundraising";
  }

  const { data: reread } = await supabase.from("issues").select("phase").eq("id", issueId).maybeSingle();
  return reread?.phase ?? storedPhase;
}

async function userHasDonatedToIssue(issueId, privyUserId) {
  if (!supabase || !privyUserId) return false;
  const keys = privyUserIdDbLookupKeys(privyUserId);
  const { count, error } = await supabase
    .from("issue_donations")
    .select("*", { count: "exact", head: true })
    .eq("issue_id", issueId)
    .in("privy_user_id", keys);
  if (error) {
    if (error.code === "42P01") return false;
    throw error;
  }
  return (count ?? 0) > 0;
}

async function listIssues(forPrivyUserId) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const followingSet = new Set();
  const initiationVoteSet = new Set();
  if (forPrivyUserId) {
    const { data: follows, error: fErr } = await supabase
      .from("issue_follows")
      .select("issue_id")
      .eq("privy_user_id", forPrivyUserId);
    if (fErr) throw fErr;
    (follows ?? []).forEach((f) => followingSet.add(f.issue_id));

    const { data: myInits, error: iErr } = await supabase
      .from("issue_initiation_votes")
      .select("issue_id")
      .eq("privy_user_id", forPrivyUserId);
    if (iErr) throw iErr;
    (myInits ?? []).forEach((r) => initiationVoteSet.add(r.issue_id));
  }

  const { data, error } = await supabase.from("issues").select(ISSUE_SELECT_FIELDS).order("created_at", { ascending: false });
  if (error) throw error;
  const rows = data ?? [];
  let donatedSet = new Set();
  if (forPrivyUserId && rows.length > 0) {
    const ids = rows.map((r) => r.id);
    const { data: drows, error: dErr } = await supabase
      .from("issue_donations")
      .select("issue_id")
      .eq("privy_user_id", forPrivyUserId)
      .in("issue_id", ids);
    if (!dErr) (drows ?? []).forEach((d) => donatedSet.add(d.issue_id));
  }
  const withCounts = await Promise.all(
    rows.map(async (row) => {
      const initiation_count = await countInitiations(row.id);
      const initiation_threshold = REQUIRED_INITIATIONS;
      let phase = await syncFundraisingPhaseIfMet(row.id, initiation_count, row.phase);
      const merged = { ...row, phase };
      const wp = await syncWorkProposalPhases(row.id, merged);
      phase = wp.phase;
      const accepting_proposals_ends_at = wp.accepting_proposals_ends_at ?? row.accepting_proposals_ends_at ?? null;
      const proposal_voting_ends_at = wp.proposal_voting_ends_at ?? row.proposal_voting_ends_at ?? null;
      const { data: reread } = await supabase.from("issues").select(ISSUE_SELECT_FIELDS).eq("id", row.id).maybeSingle();
      const latest = reread ?? row;
      return {
        ...latest,
        phase,
        accepting_proposals_ends_at,
        proposal_voting_ends_at,
        initiation_threshold,
        initiation_count,
        image_public_url: publicUrlForPath(latest.image_storage_path),
        user_following: forPrivyUserId ? followingSet.has(row.id) : false,
        user_has_initiated: forPrivyUserId ? initiationVoteSet.has(row.id) : false,
        user_has_donated: forPrivyUserId ? donatedSet.has(row.id) : false,
      };
    })
  );
  return withCounts;
}

function extFromMime(mime) {
  const m = String(mime).toLowerCase();
  if (m === "image/jpeg" || m === "image/jpg") return "jpg";
  if (m === "image/png") return "png";
  return null;
}

const DESCRIPTION_MAX = 8000;

async function createIssue({
  creatorPrivyUserId,
  title,
  description,
  category,
  severity,
  city,
  village,
  street,
  latitude,
  longitude,
  donationTargetCents,
  imageBuffer,
  mimeType,
}) {
  if (!supabase) return { ok: false, error: "Supabase is not configured." };
  const t = String(title ?? "").trim();
  const desc = String(description ?? "").trim();
  const cat = String(category ?? "").trim();
  const sev = String(severity ?? "").trim().toLowerCase();
  const c = String(city ?? "").trim();
  const v = String(village ?? "").trim();
  const st = String(street ?? "").trim();
  const lat = Number(latitude);
  const lng = Number(longitude);
  const target = Number(donationTargetCents);

  if (!t) return { ok: false, error: "title is required." };
  if (desc.length > DESCRIPTION_MAX) {
    return { ok: false, error: `description must be at most ${DESCRIPTION_MAX} characters.` };
  }
  if (!c || !v || !st) return { ok: false, error: "city, village, and street are required." };
  if (!CATEGORIES.has(cat)) return { ok: false, error: "Invalid category." };
  if (!SEVERITIES.has(sev)) return { ok: false, error: "Invalid severity (low | medium | critical)." };
  if (!Number.isFinite(target) || target < 1) return { ok: false, error: "donation_target_cents must be a positive integer." };
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, error: "latitude and longitude must be valid numbers (recorded at submit time)." };
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { ok: false, error: "latitude or longitude is out of range." };
  }
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) return { ok: false, error: "Image is required." };
  if (imageBuffer.length > 2 * 1024 * 1024) return { ok: false, error: "Image must be 2MB or smaller." };
  const ext = extFromMime(mimeType);
  if (!ext) return { ok: false, error: "Image must be PNG or JPEG." };

  const creatorName = await getCreatorDisplayName(creatorPrivyUserId);
  if (!creatorName) {
    return { ok: false, error: "Save your profile (first and last name) before creating an issue." };
  }

  let vault;
  try {
    vault = createIssueVaultCredentials();
  } catch (e) {
    return { ok: false, error: e.message || "Could not create issue fund wallet (check ISSUE_SIGNER_SECRET in backend/.env)." };
  }

  const id = crypto.randomUUID();
  const path = `${ISSUES_PREFIX}/${id}.${ext}`;

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, imageBuffer, {
    contentType: mimeType,
    upsert: false,
  });
  if (upErr) {
    return { ok: false, error: upErr.message || "Storage upload failed." };
  }

  const row = {
    id,
    creator_privy_user_id: creatorPrivyUserId,
    creator_display_name: creatorName,
    title: t,
    description: desc,
    image_storage_path: path,
    category: cat,
    severity: sev,
    city: c,
    village: v,
    street: st,
    latitude: lat,
    longitude: lng,
    distance_km: 0,
    donation_target_cents: Math.floor(target),
    fund_raised_cents: 0,
    phase: "needs_initiation",
    follower_count: 0,
    initiation_threshold: REQUIRED_INITIATIONS,
    smart_wallet_address: vault.smart_wallet_address,
    signer_encrypted_payload: vault.signer_encrypted_payload,
  };

  const { data: inserted, error: insErr } = await supabase.from("issues").insert(row).select("*").single();
  if (insErr) {
    await supabase.storage.from(BUCKET).remove([path]);
    return { ok: false, error: insErr.message };
  }

  return {
    ok: true,
    issue: {
      ...inserted,
      initiation_count: 0,
      image_public_url: publicUrlForPath(path),
    },
  };
}

async function addInitiationVote(issueIdRaw, voterPrivyUserId) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const issueId = String(issueIdRaw ?? "").trim();
  if (!issueId) return { ok: false, error: "Invalid issue id." };

  const { data: issue, error: gErr } = await supabase.from("issues").select("*").eq("id", issueId).maybeSingle();
  if (gErr) throw gErr;
  if (!issue) return { ok: false, error: "Issue not found." };
  if (issue.phase !== "needs_initiation") {
    return { ok: false, error: "This issue is no longer accepting initiation votes." };
  }
  if (issue.creator_privy_user_id === voterPrivyUserId) {
    return { ok: false, error: "The creator cannot initiate their own issue." };
  }

  const countBefore = await countInitiations(issueId);

  const { error: insErr } = await supabase.from("issue_initiation_votes").insert({
    issue_id: issueId,
    privy_user_id: voterPrivyUserId,
  });
  if (insErr) {
    if (insErr.code === "23505") {
      return { ok: false, error: "You have already initiated this issue." };
    }
    return { ok: false, error: insErr.message };
  }

  /** After insert, count can lag briefly on read replicas — at least one new vote exists. */
  let count = await countInitiations(issueId);
  if (count < countBefore + 1) {
    count = countBefore + 1;
  }

  const threshold = REQUIRED_INITIATIONS;

  if (count >= threshold) {
    let advanced = await promoteIssueToFundraising(issueId);
    if (!advanced) {
      const { data: current, error: curErr } = await supabase.from("issues").select("*").eq("id", issueId).maybeSingle();
      if (curErr) throw curErr;
      if (current?.phase === "fundraising") {
        advanced = current;
      } else if (current?.phase === "needs_initiation") {
        advanced = await promoteIssueToFundraising(issueId);
        if (!advanced) {
          const { data: forced, error: fErr } = await supabase
            .from("issues")
            .update({ phase: "fundraising" })
            .eq("id", issueId)
            .select("*")
            .maybeSingle();
          if (fErr) throw fErr;
          advanced = forced;
        }
      }
    }
    if (advanced) {
      return {
        ok: true,
        initiation_count: count,
        phase: advanced.phase,
        smart_wallet_address: advanced.smart_wallet_address,
      };
    }
  }

  const { data: fresh, error: freshErr } = await supabase
    .from("issues")
    .select("phase, smart_wallet_address")
    .eq("id", issueId)
    .maybeSingle();
  if (freshErr) throw freshErr;
  return {
    ok: true,
    initiation_count: count,
    phase: fresh?.phase ?? issue.phase,
    smart_wallet_address: fresh?.smart_wallet_address ?? null,
  };
}

async function setFollow(issueId, privyUserId, follow) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data: issue } = await supabase.from("issues").select("id").eq("id", issueId).maybeSingle();
  if (!issue) return { ok: false, error: "Issue not found." };

  if (follow) {
    const { error } = await supabase.from("issue_follows").insert({ issue_id: issueId, privy_user_id: privyUserId });
    if (error) {
      if (error.code === "23505") return { ok: true, following: true };
      return { ok: false, error: error.message };
    }
  } else {
    const { error } = await supabase
      .from("issue_follows")
      .delete()
      .eq("issue_id", issueId)
      .eq("privy_user_id", privyUserId);
    if (error) return { ok: false, error: error.message };
  }

  const { count } = await supabase
    .from("issue_follows")
    .select("*", { count: "exact", head: true })
    .eq("issue_id", issueId);
  await supabase.from("issues").update({ follower_count: count ?? 0 }).eq("id", issueId);

  return { ok: true, following: follow, follower_count: count ?? 0 };
}

async function isFollowing(issueId, privyUserId) {
  const { data, error } = await supabase
    .from("issue_follows")
    .select("issue_id")
    .eq("issue_id", issueId)
    .eq("privy_user_id", privyUserId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function updateDonationTarget(issueId, editorPrivyUserId, donationTargetCents) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const target = Number(donationTargetCents);
  if (!Number.isFinite(target) || target < 1) return { ok: false, error: "Invalid donation_target_cents." };

  const { data: issue, error } = await supabase.from("issues").select("*").eq("id", issueId).maybeSingle();
  if (error) throw error;
  if (!issue) return { ok: false, error: "Issue not found." };
  if (issue.creator_privy_user_id !== editorPrivyUserId) {
    return { ok: false, error: "Only the creator can edit the donation target." };
  }
  if (issue.phase !== "needs_initiation") {
    return { ok: false, error: "Donation target can only be edited during Needs initiation." };
  }
  const votes = await countInitiations(issueId);
  if (votes > 0) {
    return { ok: false, error: "Donation target is locked after the first initiation vote." };
  }
  if (target < issue.fund_raised_cents) {
    return { ok: false, error: "Target cannot be less than funds already raised." };
  }

  const { data: updated, error: uErr } = await supabase
    .from("issues")
    .update({ donation_target_cents: Math.floor(target) })
    .eq("id", issueId)
    .select("*")
    .single();
  if (uErr) return { ok: false, error: uErr.message };
  return { ok: true, issue: updated };
}

async function updatePhase(issueId, editorPrivyUserId, nextPhase) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const p = String(nextPhase ?? "").trim();
  const allowed = new Set(["in_progress", "completed"]);
  if (!allowed.has(p)) return { ok: false, error: "Invalid phase transition." };

  const { data: issue, error } = await supabase.from("issues").select("*").eq("id", issueId).maybeSingle();
  if (error) throw error;
  if (!issue) return { ok: false, error: "Issue not found." };
  if (issue.creator_privy_user_id !== editorPrivyUserId) {
    return { ok: false, error: "Only the creator can change phase." };
  }
  if (issue.phase === "needs_initiation") {
    return { ok: false, error: "Phase advances automatically after the initiation threshold is met." };
  }

  const order = [
    "needs_initiation",
    "fundraising",
    "accepting_proposals",
    "proposal_voting",
    "in_progress",
    "completed",
  ];
  const cur = order.indexOf(issue.phase);
  const nxt = order.indexOf(p);
  if (nxt !== cur + 1) {
    return { ok: false, error: "Invalid phase progression." };
  }

  const { data: updated, error: uErr } = await supabase.from("issues").update({ phase: p }).eq("id", issueId).select("*").single();
  if (uErr) return { ok: false, error: uErr.message };
  return { ok: true, issue: updated };
}

async function listRecentDonations(issueId, max = 25) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase
    .from("issue_donations")
    .select("donor_display_name, usd_cents, created_at, tx_hash")
    .eq("issue_id", issueId)
    .order("created_at", { ascending: false })
    .limit(max);
  if (error) {
    if (error.code === "42P01") return [];
    throw error;
  }
  return data ?? [];
}

async function getIssueById(issueIdRaw, forPrivyUserId) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const issueId = String(issueIdRaw ?? "").trim();
  if (!issueId) return { ok: false, error: "Invalid issue id." };

  const { data: row, error } = await supabase.from("issues").select(ISSUE_SELECT_FIELDS).eq("id", issueId).maybeSingle();
  if (error) throw error;
  if (!row) return { ok: false, error: "Issue not found." };

  const initiation_count = await countInitiations(issueId);
  const initiation_threshold = REQUIRED_INITIATIONS;
  let phase = await syncFundraisingPhaseIfMet(issueId, initiation_count, row.phase);
  const mergedRow = { ...row, phase };
  const wp = await syncWorkProposalPhases(issueId, mergedRow);
  phase = wp.phase;
  const accepting_proposals_ends_at = wp.accepting_proposals_ends_at ?? row.accepting_proposals_ends_at ?? null;
  const proposal_voting_ends_at = wp.proposal_voting_ends_at ?? row.proposal_voting_ends_at ?? null;

  const { data: latestRow } = await supabase.from("issues").select(ISSUE_SELECT_FIELDS).eq("id", issueId).maybeSingle();
  let base = latestRow ?? row;
  try {
    const ph = String(base.phase ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_");
    if (ph === "in_progress" && base.winning_proposal_id) {
      const ensured = await ensureWinningMilestonesOnRow(base);
      if (ensured.ok && ensured.row) base = ensured.row;
    }
  } catch {
    /* non-fatal: UI can still load */
  }

  let user_following = false;
  let user_has_initiated = false;
  let user_has_donated = false;
  if (forPrivyUserId) {
    user_following = await isFollowing(issueId, forPrivyUserId);
    const { data: iv } = await supabase
      .from("issue_initiation_votes")
      .select("issue_id")
      .eq("issue_id", issueId)
      .eq("privy_user_id", forPrivyUserId)
      .maybeSingle();
    user_has_initiated = Boolean(iv);
    try {
      user_has_donated = await userHasDonatedToIssue(issueId, forPrivyUserId);
    } catch {
      user_has_donated = false;
    }
  }

  let donations = [];
  try {
    donations = await listRecentDonations(issueId, 30);
  } catch (e) {
    if (String(e?.message || "").includes("issue_donations") || e?.code === "42P01") {
      donations = [];
    } else {
      throw e;
    }
  }

  return {
    ok: true,
    row: {
      ...base,
      phase,
      accepting_proposals_ends_at,
      proposal_voting_ends_at,
      initiation_count,
      initiation_threshold,
      image_public_url: publicUrlForPath(base.image_storage_path),
      user_following,
      user_has_initiated,
      user_has_donated,
      milestone_proof_public_url: base.milestone_proof_storage_path
        ? publicUrlForPath(base.milestone_proof_storage_path)
        : null,
    },
    donations,
  };
}

async function insertIssueChatMessage({ issueId, privyUserId, body }) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const t = String(body ?? "").trim();
  if (!t || t.length > 2000) return null;
  const name = (await getCreatorDisplayName(privyUserId)) || "Community member";
  const { data, error } = await supabase
    .from("issue_chat_messages")
    .insert({
      issue_id: issueId,
      privy_user_id: privyUserId,
      sender_display_name: name,
      body: t,
    })
    .select("id, body, sender_display_name, created_at, privy_user_id")
    .single();
  if (error) throw error;
  return data;
}

async function listIssueChatMessages(issueId, limit = 120) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase
    .from("issue_chat_messages")
    .select("id, privy_user_id, sender_display_name, body, created_at")
    .eq("issue_id", issueId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (error.code === "42P01") return [];
    throw error;
  }
  return (data ?? []).reverse();
}

async function recordDonationFromTx({ issueId, privyUserId, donorAddress, txHash }) {
  const { getAddress } = require("viem");
  const { fetchUsdcTransferToVault } = require("../lib/verifyBaseSepoliaUsdcTransfer");
  if (!supabase) return { ok: false, error: "Supabase is not configured." };

  const id = String(issueId ?? "").trim();
  const hash = String(txHash ?? "").trim();
  if (!id || !hash) return { ok: false, error: "issueId and txHash are required." };

  const { data: issue, error: gErr } = await supabase.from("issues").select("*").eq("id", id).maybeSingle();
  if (gErr) throw gErr;
  if (!issue) return { ok: false, error: "Issue not found." };

  const initiation_count = await countInitiations(id);
  let effectivePhase = await syncFundraisingPhaseIfMet(id, initiation_count, issue.phase);
  const mergedIssue = { ...issue, phase: effectivePhase };
  const wp = await syncWorkProposalPhases(id, mergedIssue);
  effectivePhase = wp.phase;
  if (effectivePhase !== "fundraising") {
    return {
      ok: false,
      error: "Donations are only accepted while the project is in the fundraising phase.",
    };
  }

  const vault = String(issue.smart_wallet_address ?? "").trim();
  if (!vault) return { ok: false, error: "Project fund wallet is not available yet." };

  let donor;
  try {
    donor = getAddress(donorAddress);
  } catch {
    return { ok: false, error: "Invalid donor wallet address." };
  }

  const { data: prof } = await supabase
    .from("user_profiles")
    .select("smart_wallet_address")
    .eq("privy_user_id", privyUserId)
    .maybeSingle();
  if (prof?.smart_wallet_address) {
    try {
      if (getAddress(prof.smart_wallet_address) !== donor) {
        return {
          ok: false,
          error: "The sending wallet must match the smart wallet address saved on your profile.",
        };
      }
    } catch {
      return { ok: false, error: "Invalid smart_wallet_address on your profile." };
    }
  }

  let transfer;
  try {
    transfer = await fetchUsdcTransferToVault(/** @type {`0x${string}`} */ (hash), vault);
  } catch (e) {
    return { ok: false, error: e?.message || "Could not read this transaction on Base Sepolia." };
  }
  if (!transfer) {
    return {
      ok: false,
      error: "No successful USDC transfer to this project’s wallet was found on Base Sepolia for that transaction.",
    };
  }
  if (transfer.from !== donor) {
    return { ok: false, error: "On-chain transfer sender does not match donorAddress." };
  }

  const usdCents = Number(transfer.value / 10000n);
  if (!Number.isFinite(usdCents) || usdCents < 1) {
    return { ok: false, error: "Donation amount is too small to record (under $0.01)." };
  }

  const target = Number(issue.donation_target_cents);
  const raised = Number(issue.fund_raised_cents);
  const remaining = Math.max(0, target - raised);
  if (usdCents > remaining) {
    return {
      ok: false,
      error: `This transfer (${(usdCents / 100).toFixed(2)} USD) exceeds the remaining funding goal (${(remaining / 100).toFixed(2)} USD).`,
    };
  }

  const donorDisplayName = (await getCreatorDisplayName(privyUserId)) || "Supporter";

  const { data: ins, error: insErr } = await supabase
    .from("issue_donations")
    .insert({
      issue_id: id,
      privy_user_id: privyUserId,
      donor_display_name: donorDisplayName,
      usd_cents: usdCents,
      tx_hash: hash,
    })
    .select("id, donor_display_name, usd_cents, created_at, tx_hash")
    .single();

  if (insErr) {
    if (insErr.code === "23505") return { ok: false, error: "This transaction was already recorded." };
    if (insErr.code === "42P01") {
      return {
        ok: false,
        error: "Donations table missing. Run backend/sql/issue_donations_and_chat.sql in the Supabase SQL editor.",
      };
    }
    return { ok: false, error: insErr.message };
  }

  const newRaised = raised + usdCents;
  const { error: upErr } = await supabase.from("issues").update({ fund_raised_cents: newRaised }).eq("id", id);
  if (upErr) return { ok: false, error: upErr.message };

  const { data: freshIssue } = await supabase.from("issues").select("*").eq("id", id).maybeSingle();
  if (freshIssue) {
    const ic = await countInitiations(id);
    let ph = await syncFundraisingPhaseIfMet(id, ic, freshIssue.phase);
    await syncWorkProposalPhases(id, { ...freshIssue, phase: ph });
  }

  await setFollow(id, privyUserId, true);

  return {
    ok: true,
    fund_raised_cents: newRaised,
    donation_id: ins?.id,
    donation: ins
      ? {
          donor_display_name: ins.donor_display_name,
          usd_cents: ins.usd_cents,
          created_at: ins.created_at,
          tx_hash: ins.tx_hash,
        }
      : null,
  };
}

module.exports = {
  listIssues,
  createIssue,
  addInitiationVote,
  setFollow,
  isFollowing,
  updateDonationTarget,
  updatePhase,
  countInitiations,
  getIssueById,
  listRecentDonations,
  listIssueChatMessages,
  insertIssueChatMessage,
  recordDonationFromTx,
  userHasDonatedToIssue,
  listMyFollowedIssueSummaries,
  listMyReportedIssueSummaries,
  syncWorkProposalPhases,
  syncFundraisingPhaseIfMet,
};
