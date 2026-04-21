const { supabase } = require("../config/supabase");
const { syncWorkProposalPhases } = require("./issueLifecycleSync");
const { syncFundraisingPhaseIfMet, countInitiations, userHasDonatedToIssue } = require("./issueService");

async function loadIssueSynced(issueId) {
  const { data: issue, error } = await supabase.from("issues").select("*").eq("id", issueId).maybeSingle();
  if (error) throw error;
  if (!issue) return null;
  const initiation_count = await countInitiations(issueId);
  let phase = await syncFundraisingPhaseIfMet(issueId, initiation_count, issue.phase);
  const wp = await syncWorkProposalPhases(issueId, { ...issue, phase });
  phase = wp.phase;
  const merged = {
    ...issue,
    phase,
    accepting_proposals_ends_at: wp.accepting_proposals_ends_at ?? issue.accepting_proposals_ends_at ?? null,
    proposal_voting_ends_at: wp.proposal_voting_ends_at ?? issue.proposal_voting_ends_at ?? null,
  };
  return merged;
}

async function castProposalVote(issueId, voterPrivyUserId, proposalIdRaw) {
  if (!supabase) return { ok: false, error: "Supabase is not configured." };
  const iid = String(issueId ?? "").trim();
  const uid = String(voterPrivyUserId ?? "").trim();
  const proposalId = String(proposalIdRaw ?? "").trim();
  if (!iid || !uid || !proposalId) return { ok: false, error: "Invalid request." };

  const donated = await userHasDonatedToIssue(iid, uid);
  if (!donated) return { ok: false, error: "Only donors can vote on proposals.", code: "forbidden" };

  const issue = await loadIssueSynced(iid);
  if (!issue) return { ok: false, error: "Issue not found." };
  if (issue.phase !== "proposal_voting") {
    return { ok: false, error: "Voting is not open for this issue right now." };
  }
  const vEnd = issue.proposal_voting_ends_at ? new Date(issue.proposal_voting_ends_at).getTime() : NaN;
  if (Number.isFinite(vEnd) && Date.now() > vEnd) {
    return { ok: false, error: "The voting window has closed." };
  }

  const { data: prop, error: pErr } = await supabase
    .from("issue_work_proposals")
    .select("id, issue_id, status")
    .eq("id", proposalId)
    .maybeSingle();
  if (pErr) return { ok: false, error: pErr.message };
  if (!prop || prop.issue_id !== iid) return { ok: false, error: "Proposal not found on this issue." };
  if (prop.status !== "pending") return { ok: false, error: "That proposal is no longer votable." };

  await supabase.from("issue_proposal_votes").delete().eq("issue_id", iid).eq("voter_privy_user_id", uid);

  const { error: insErr } = await supabase.from("issue_proposal_votes").insert({
    issue_id: iid,
    proposal_id: proposalId,
    voter_privy_user_id: uid,
  });
  if (insErr) {
    if (insErr.code === "42P01") {
      return { ok: false, error: "Votes table missing. Run backend/sql/issue_voting_execution.sql in Supabase." };
    }
    return { ok: false, error: insErr.message };
  }

  return { ok: true };
}

async function getVotingState(issueId, viewerPrivyUserId) {
  if (!supabase) return { ok: false, error: "Supabase is not configured." };
  const iid = String(issueId ?? "").trim();
  if (!iid) return { ok: false, error: "Invalid issue id." };

  const issue = await loadIssueSynced(iid);
  if (!issue) return { ok: false, error: "Issue not found." };

  let viewerDonated = false;
  let myVoteProposalId = null;
  if (viewerPrivyUserId) {
    viewerDonated = await userHasDonatedToIssue(iid, viewerPrivyUserId);
    if (viewerDonated) {
      const { data: mv } = await supabase
        .from("issue_proposal_votes")
        .select("proposal_id")
        .eq("issue_id", iid)
        .eq("voter_privy_user_id", viewerPrivyUserId)
        .maybeSingle();
      myVoteProposalId = mv?.proposal_id ?? null;
    }
  }

  const { data: proposals, error: prErr } = await supabase
    .from("issue_work_proposals")
    .select("id, proposer_privy_user_id, pitch, milestones, status, created_at")
    .eq("issue_id", iid)
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (prErr) return { ok: false, error: prErr.message };

  const proposerIds = [...new Set((proposals ?? []).map((p) => String(p.proposer_privy_user_id ?? "").trim()))].filter(
    Boolean
  );
  const nameBy = new Map();
  if (proposerIds.length > 0) {
    const { data: profs } = await supabase
      .from("user_profiles")
      .select("privy_user_id, first_name, last_name")
      .in("privy_user_id", proposerIds);
    for (const pr of profs ?? []) {
      const fn = String(pr.first_name ?? "").trim();
      const ln = String(pr.last_name ?? "").trim();
      const label = [fn, ln].filter((s) => s.length > 0).join(" ").trim();
      nameBy.set(pr.privy_user_id, label.length > 0 ? label : "Volunteer");
    }
  }

  const { data: votes, error: vErr } = await supabase.from("issue_proposal_votes").select("proposal_id").eq("issue_id", iid);
  if (vErr && vErr.code !== "42P01") return { ok: false, error: vErr.message };
  const counts = new Map();
  for (const v of votes ?? []) {
    counts.set(v.proposal_id, (counts.get(v.proposal_id) ?? 0) + 1);
  }

  const enriched = (proposals ?? []).map((p) => ({
    ...p,
    vote_count: counts.get(p.id) ?? 0,
    is_recommended: issue.recommended_proposal_id === p.id,
    proposer_display_name: nameBy.get(String(p.proposer_privy_user_id ?? "").trim()) ?? "Volunteer",
  }));

  return {
    ok: true,
    phase: issue.phase,
    proposal_voting_ends_at: issue.proposal_voting_ends_at ?? null,
    accepting_proposals_ends_at: issue.accepting_proposals_ends_at ?? null,
    recommended_proposal_id: issue.recommended_proposal_id ?? null,
    viewer_donated: viewerDonated,
    my_vote_proposal_id: myVoteProposalId,
    proposals: enriched,
  };
}

module.exports = { castProposalVote, getVotingState, loadIssueSynced };
