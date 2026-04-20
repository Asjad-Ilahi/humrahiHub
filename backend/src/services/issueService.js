const crypto = require("crypto");
const { supabase } = require("../config/supabase");
const { createIssueVaultCredentials } = require("../lib/issueVaultWallet");

const BUCKET = "storage";
const ISSUES_PREFIX = "issues";

const CATEGORIES = new Set(["Infrastructure", "Environment", "Education", "Community", "Safety"]);
const SEVERITIES = new Set(["low", "medium", "critical"]);

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

  const { data, error } = await supabase
    .from("issues")
    .select(
      "id, creator_privy_user_id, creator_display_name, title, description, image_storage_path, category, severity, city, village, street, latitude, longitude, distance_km, donation_target_cents, fund_raised_cents, phase, follower_count, initiation_threshold, smart_wallet_address, created_at, updated_at"
    )
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = data ?? [];
  const withCounts = await Promise.all(
    rows.map(async (row) => {
      const initiation_count = await countInitiations(row.id);
      const initiation_threshold = REQUIRED_INITIATIONS;
      const phase = await syncFundraisingPhaseIfMet(row.id, initiation_count, row.phase);
      return {
        ...row,
        phase,
        initiation_threshold,
        initiation_count,
        image_public_url: publicUrlForPath(row.image_storage_path),
        user_following: forPrivyUserId ? followingSet.has(row.id) : false,
        user_has_initiated: forPrivyUserId ? initiationVoteSet.has(row.id) : false,
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

  const order = ["needs_initiation", "fundraising", "in_progress", "completed"];
  const cur = order.indexOf(issue.phase);
  const nxt = order.indexOf(p);
  if (nxt !== cur + 1) {
    return { ok: false, error: "Invalid phase progression." };
  }

  const { data: updated, error: uErr } = await supabase.from("issues").update({ phase: p }).eq("id", issueId).select("*").single();
  if (uErr) return { ok: false, error: uErr.message };
  return { ok: true, issue: updated };
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
};
