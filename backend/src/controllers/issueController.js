const multer = require("multer");
const { supabase } = require("../config/supabase");
const {
  listIssues,
  createIssue,
  addInitiationVote,
  setFollow,
  isFollowing,
  updateDonationTarget,
  updatePhase,
  getIssueById,
  listIssueChatMessages,
  recordDonationFromTx,
  userHasDonatedToIssue,
  listMyFollowedIssueSummaries,
  listMyReportedIssueSummaries,
} = require("../services/issueService");
const { castProposalVote, getVotingState: loadVotingState } = require("../services/proposalVoteService");
const { submitMilestoneProof, donorAdvanceMilestone } = require("../services/issueMilestoneService");

function assertSupabase(res) {
  if (!supabase) {
    res.status(503).json({
      error:
        "Supabase admin client is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env.",
    });
    return false;
  }
  return true;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const ok = ["image/jpeg", "image/jpg", "image/png"].includes(file.mimetype);
    cb(null, ok);
  },
});

async function getIssues(req, res) {
  if (!assertSupabase(res)) return;
  try {
    const forUser = String(req.headers["x-privy-user-id"] ?? "").trim() || null;
    const rows = await listIssues(forUser);
    return res.json({ data: rows });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

async function getMyIssueActivity(req, res) {
  if (!assertSupabase(res)) return;
  try {
    const uid = req.privyUserId;
    const [followed, reported] = await Promise.all([
      listMyFollowedIssueSummaries(uid),
      listMyReportedIssueSummaries(uid),
    ]);
    return res.json({ data: { followed, reported } });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

async function getIssue(req, res) {
  if (!assertSupabase(res)) return;
  try {
    const forUser = String(req.headers["x-privy-user-id"] ?? "").trim() || null;
    const r = await getIssueById(req.params.issueId, forUser);
    if (!r.ok) return res.status(404).json({ error: r.error });
    return res.json({ data: { issue: r.row, donations: r.donations } });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

async function getVotingState(req, res) {
  if (!assertSupabase(res)) return;
  try {
    const viewer = String(req.headers["x-privy-user-id"] ?? "").trim() || null;
    const r = await loadVotingState(req.params.issueId, viewer);
    if (!r.ok) return res.status(400).json({ error: r.error });
    return res.json({ data: r });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

async function postProposalVote(req, res) {
  if (!assertSupabase(res)) return;
  const { proposal_id: proposalId } = req.body ?? {};
  try {
    const r = await castProposalVote(req.params.issueId, req.privyUserId, proposalId);
    if (!r.ok) {
      const st = r.code === "forbidden" ? 403 : 400;
      return res.status(st).json({ error: r.error });
    }
    return res.json({ data: { ok: true } });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

async function postMilestoneProof(req, res) {
  if (!assertSupabase(res)) return;
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: "Image file is required (field name: image)." });
  }
  try {
    const r = await submitMilestoneProof(req.params.issueId, req.privyUserId, file.buffer, file.mimetype);
    if (!r.ok) return res.status(400).json({ error: r.error });
    return res.json({ data: r });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

async function postAdvanceMilestone(req, res) {
  if (!assertSupabase(res)) return;
  try {
    const r = await donorAdvanceMilestone(req.params.issueId, req.privyUserId);
    if (!r.ok) {
      const st = r.code === "forbidden" ? 403 : 400;
      return res.status(st).json({ error: r.error });
    }
    return res.json({ data: { ok: true } });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

async function postDonate(req, res) {
  if (!assertSupabase(res)) return;
  const { txHash, donorAddress } = req.body ?? {};
  try {
    const r = await recordDonationFromTx({
      issueId: req.params.issueId,
      privyUserId: req.privyUserId,
      donorAddress,
      txHash,
    });
    if (!r.ok) return res.status(400).json({ error: r.error });
    return res.json({ data: r });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

async function postChatToken(req, res) {
  if (!assertSupabase(res)) return;
  try {
    const donated = await userHasDonatedToIssue(req.params.issueId, req.privyUserId);
    const following = await isFollowing(req.params.issueId, req.privyUserId);
    if (!donated && !following) {
      return res.status(403).json({ error: "Follow this issue or donate to use community chat." });
    }
    const { createIssueChatToken } = require("../realtime/issueChatTokens");
    const token = createIssueChatToken(req.params.issueId, req.privyUserId);
    return res.json({ data: { token } });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

async function getChatMessages(req, res) {
  if (!assertSupabase(res)) return;
  try {
    const donated = await userHasDonatedToIssue(req.params.issueId, req.privyUserId);
    const following = await isFollowing(req.params.issueId, req.privyUserId);
    if (!donated && !following) {
      return res.status(403).json({ error: "Follow this issue or donate to read messages." });
    }
    const rows = await listIssueChatMessages(req.params.issueId);
    return res.json({ data: rows });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

async function postIssue(req, res) {
  if (!assertSupabase(res)) return;
  const creatorPrivyUserId = req.privyUserId;
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: "Image file is required (field name: image)." });
  }
  const {
    title,
    description,
    category,
    severity,
    city,
    village,
    street,
    latitude: latRaw,
    longitude: lngRaw,
    donation_target_cents: targetRaw,
  } = req.body;

  try {
    const result = await createIssue({
      creatorPrivyUserId,
      title,
      description,
      category,
      severity,
      city,
      village,
      street,
      latitude: latRaw,
      longitude: lngRaw,
      donationTargetCents: targetRaw,
      imageBuffer: file.buffer,
      mimeType: file.mimetype,
    });
    if (!result.ok) {
      return res.status(400).json({ error: result.error });
    }
    return res.status(201).json({ data: result.issue });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

async function postInitiate(req, res) {
  if (!assertSupabase(res)) return;
  const voter = req.privyUserId;
  const { issueId } = req.params;
  try {
    const result = await addInitiationVote(issueId, voter);
    if (!result.ok) {
      return res.status(400).json({ error: result.error });
    }
    return res.json({
      data: {
        initiation_count: result.initiation_count,
        phase: result.phase,
        smart_wallet_address: result.smart_wallet_address ?? null,
      },
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

async function postFollow(req, res) {
  if (!assertSupabase(res)) return;
  try {
    const r = await setFollow(req.params.issueId, req.privyUserId, true);
    if (!r.ok) return res.status(400).json({ error: r.error });
    return res.json({ data: { following: true, follower_count: r.follower_count } });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

async function postUnfollow(req, res) {
  if (!assertSupabase(res)) return;
  try {
    const r = await setFollow(req.params.issueId, req.privyUserId, false);
    if (!r.ok) return res.status(400).json({ error: r.error });
    return res.json({ data: { following: false, follower_count: r.follower_count } });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

async function getFollowing(req, res) {
  if (!assertSupabase(res)) return;
  try {
    const following = await isFollowing(req.params.issueId, req.privyUserId);
    return res.json({ data: { following } });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

async function patchIssueTarget(req, res) {
  if (!assertSupabase(res)) return;
  const { donation_target_cents: cents } = req.body ?? {};
  if (cents === undefined || cents === null) {
    return res.status(400).json({ error: "Body must include donation_target_cents." });
  }
  try {
    const r = await updateDonationTarget(req.params.issueId, req.privyUserId, cents);
    if (!r.ok) return res.status(400).json({ error: r.error });
    return res.json({ data: r.issue });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

async function patchIssuePhase(req, res) {
  if (!assertSupabase(res)) return;
  const { phase } = req.body ?? {};
  try {
    const r = await updatePhase(req.params.issueId, req.privyUserId, phase);
    if (!r.ok) return res.status(400).json({ error: r.error });
    return res.json({ data: r.issue });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

module.exports = {
  getIssues,
  getMyIssueActivity,
  getIssue,
  getVotingState,
  postProposalVote,
  postMilestoneProof,
  postAdvanceMilestone,
  postIssue,
  postInitiate,
  postFollow,
  postUnfollow,
  getFollowing,
  postDonate,
  postChatToken,
  getChatMessages,
  patchIssueTarget,
  patchIssuePhase,
  upload,
};
