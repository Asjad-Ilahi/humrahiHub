const { supabase } = require("../config/supabase");
const { sendUsdcFromIssueVault } = require("../lib/issueVaultUsdcPayout");
const { privyUserIdDbLookupKeys } = require("../lib/privyUserId");

/** 0 = submission window ends immediately so voting can start as soon as there is a pending proposal. */
const SUBMISSION_WINDOW_MS = 0;
const VOTING_WINDOW_MS = 2 * 60 * 1000;
const REVIEW_WINDOW_MS = 2 * 60 * 1000;
/** When no proposals yet and submission is instant, extend the window so we do not spin updates every tick. */
const ACCEPTING_EMPTY_EXTENSION_MS = 60 * 1000;

function isoPlus(ms) {
  return new Date(Date.now() + ms).toISOString();
}

function acceptingProposalsInitialEndsAt() {
  if (SUBMISSION_WINDOW_MS <= 0) return new Date(Date.now() - 2000).toISOString();
  return isoPlus(SUBMISSION_WINDOW_MS);
}

async function countPendingProposals(issueId) {
  const { count, error } = await supabase
    .from("issue_work_proposals")
    .select("*", { count: "exact", head: true })
    .eq("issue_id", issueId)
    .eq("status", "pending");
  if (error) {
    if (error.code === "42P01") return 0;
    throw error;
  }
  return count ?? 0;
}

async function listPendingProposalIds(issueId) {
  const { data, error } = await supabase
    .from("issue_work_proposals")
    .select("id, created_at")
    .eq("issue_id", issueId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) {
    if (error.code === "42P01") return [];
    throw error;
  }
  return data ?? [];
}

async function tallyVotes(issueId) {
  const { data, error } = await supabase.from("issue_proposal_votes").select("proposal_id").eq("issue_id", issueId);
  if (error) {
    if (error.code === "42P01") return new Map();
    throw error;
  }
  const m = new Map();
  for (const r of data ?? []) {
    const id = r.proposal_id;
    m.set(id, (m.get(id) ?? 0) + 1);
  }
  return m;
}

function pickWinnerProposalIds(sortedProposalIds, voteMap) {
  let best = sortedProposalIds[0];
  let bestVotes = -1;
  for (const id of sortedProposalIds) {
    const c = voteMap.get(id) ?? 0;
    if (c > bestVotes || (c === bestVotes && String(id) < String(best))) {
      best = id;
      bestVotes = c;
    }
  }
  return best;
}

function milestoneAmountCents(fundRaisedCents, milestones, index) {
  const m = milestones?.[index];
  const pct = Number(m?.percent);
  const raised = Math.floor(Number(fundRaisedCents) || 0);
  if (!Number.isFinite(pct) || pct < 1 || !Number.isFinite(raised) || raised < 1) return 0;
  return Math.floor((raised * pct) / 100);
}

function winningMilestonesOk(milestones) {
  if (!Array.isArray(milestones) || milestones.length !== 3) return false;
  let sum = 0;
  for (let i = 0; i < 3; i += 1) {
    const p = Math.round(Number(milestones[i]?.percent));
    if (!Number.isFinite(p) || p < 1 || p > 99) return false;
    sum += p;
  }
  return sum === 100;
}

/**
 * Persist `winning_milestones_json` from the winning proposal when the issue row is missing or corrupt.
 * @returns {Promise<{ ok: boolean, row: object, error?: string }>}
 */
async function ensureWinningMilestonesOnRow(issueRow) {
  if (!supabase) return { ok: false, row: issueRow, error: "Supabase is not configured." };
  const issueId = issueRow.id;
  let m = issueRow.winning_milestones_json;
  if (winningMilestonesOk(m)) return { ok: true, row: issueRow };
  const wid = issueRow.winning_proposal_id;
  if (!wid) return { ok: false, row: issueRow, error: "Missing winning proposal; cannot load payment split." };
  const { data, error } = await supabase.from("issue_work_proposals").select("milestones").eq("id", wid).maybeSingle();
  if (error) return { ok: false, row: issueRow, error: error.message };
  m = data?.milestones;
  if (!winningMilestonesOk(m)) {
    return {
      ok: false,
      row: issueRow,
      error: "Winning proposal milestones missing or invalid (need 3 milestones, percents summing to 100).",
    };
  }
  const { error: uErr } = await supabase.from("issues").update({ winning_milestones_json: m }).eq("id", issueId);
  if (uErr) return { ok: false, row: issueRow, error: uErr.message };
  return { ok: true, row: { ...issueRow, winning_milestones_json: m } };
}

async function appendTxHash(issueId, txHash) {
  const { data: cur, error: rErr } = await supabase
    .from("issues")
    .select("milestone_payout_tx_hashes")
    .eq("id", issueId)
    .maybeSingle();
  if (rErr) return false;
  const arr = Array.isArray(cur?.milestone_payout_tx_hashes) ? [...cur.milestone_payout_tx_hashes] : [];
  arr.push(txHash);
  const { error } = await supabase.from("issues").update({ milestone_payout_tx_hashes: arr }).eq("id", issueId);
  return !error;
}

/**
 * Pay milestone slice index 0..2 from vault to assigned worker.
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function payMilestoneTranche(issueRow, milestoneIndex) {
  const ensured = await ensureWinningMilestonesOnRow(issueRow);
  if (!ensured.ok) return { ok: false, error: ensured.error };
  const row = ensured.row;
  const milestones = row.winning_milestones_json;
  if (!Array.isArray(milestones) || milestoneIndex < 0 || milestoneIndex > 2) {
    return { ok: false, error: "Invalid milestone configuration." };
  }
  const uid = String(row.assigned_worker_privy_user_id ?? "").trim();
  if (!uid) return { ok: false, error: "No assigned worker." };
  const keys = privyUserIdDbLookupKeys(uid);
  const { data: profRows, error: pErr } = await supabase
    .from("user_profiles")
    .select("smart_wallet_address, privy_user_id")
    .in("privy_user_id", keys)
    .limit(1);
  if (pErr) return { ok: false, error: pErr.message };
  const prof = Array.isArray(profRows) ? profRows[0] : null;
  const to = String(prof?.smart_wallet_address ?? "").trim();
  if (!to) {
    return {
      ok: false,
      error:
        "Worker has no smart_wallet_address on profile. Complete onboarding with a wallet so payouts can be sent.",
    };
  }

  const cents = milestoneAmountCents(row.fund_raised_cents, milestones, milestoneIndex);
  if (cents < 1) return { ok: false, error: "Computed milestone payout is under $0.01." };

  const payload = row.signer_encrypted_payload;
  const vault = row.smart_wallet_address;
  if (!payload || !vault) return { ok: false, error: "Vault signer is not configured for this issue." };

  const r = await sendUsdcFromIssueVault({
    signerEncryptedPayload: payload,
    vaultAddress: vault,
    toAddress: to,
    usdCents: cents,
  });
  if (!r.ok) return { ok: false, error: r.error };
  await appendTxHash(row.id, r.txHash);
  return { ok: true };
}

async function reloadIssue(issueId) {
  const { data, error } = await supabase.from("issues").select("*").eq("id", issueId).maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * After fundraising goal is met: submission window, then voting, then winner + first payout.
 * Also retries first payout and auto-advances milestone review deadlines.
 */
async function syncWorkProposalPhases(issueId, row) {
  if (!supabase) return { phase: row.phase, accepting_proposals_ends_at: row.accepting_proposals_ends_at ?? null, proposal_voting_ends_at: row.proposal_voting_ends_at ?? null };

  let phase = String(row.phase ?? "needs_initiation");
  let acceptingEnds = row.accepting_proposals_ends_at ?? null;
  let votingEnds = row.proposal_voting_ends_at ?? null;
  const raised = Number(row.fund_raised_cents) || 0;
  const goal = Number(row.donation_target_cents) || 0;

  if (phase === "fundraising" && goal > 0 && raised >= goal) {
    const ends = acceptingProposalsInitialEndsAt();
    const { data, error } = await supabase
      .from("issues")
      .update({ phase: "accepting_proposals", accepting_proposals_ends_at: ends })
      .eq("id", issueId)
      .eq("phase", "fundraising")
      .select("phase, accepting_proposals_ends_at, proposal_voting_ends_at")
      .maybeSingle();
    if (!error && data?.phase === "accepting_proposals") {
      return {
        phase: data.phase,
        accepting_proposals_ends_at: data.accepting_proposals_ends_at ?? ends,
        proposal_voting_ends_at: data.proposal_voting_ends_at ?? null,
      };
    }
    const cur = await reloadIssue(issueId);
    if (cur) {
      phase = String(cur.phase);
      acceptingEnds = cur.accepting_proposals_ends_at ?? acceptingEnds;
      votingEnds = cur.proposal_voting_ends_at ?? votingEnds;
    }
  }

  if (phase === "accepting_proposals" && acceptingEnds) {
    const endMs = new Date(acceptingEnds).getTime();
    if (Number.isFinite(endMs) && Date.now() >= endMs) {
      const pending = await listPendingProposalIds(issueId);
      if (pending.length === 0) {
        const extendBy = SUBMISSION_WINDOW_MS <= 0 ? ACCEPTING_EMPTY_EXTENSION_MS : SUBMISSION_WINDOW_MS;
        const nextEnds = isoPlus(extendBy);
        await supabase.from("issues").update({ accepting_proposals_ends_at: nextEnds }).eq("id", issueId).eq("phase", "accepting_proposals");
        const cur = await reloadIssue(issueId);
        if (cur) {
          return {
            phase: cur.phase,
            accepting_proposals_ends_at: cur.accepting_proposals_ends_at,
            proposal_voting_ends_at: cur.proposal_voting_ends_at ?? null,
          };
        }
      } else {
        const vEnd = isoPlus(VOTING_WINDOW_MS);
        const rec = pending[0]?.id ?? null;
        const { data, error } = await supabase
          .from("issues")
          .update({
            phase: "proposal_voting",
            proposal_voting_ends_at: vEnd,
            recommended_proposal_id: rec,
          })
          .eq("id", issueId)
          .eq("phase", "accepting_proposals")
          .select("phase, accepting_proposals_ends_at, proposal_voting_ends_at")
          .maybeSingle();
        if (!error && data?.phase === "proposal_voting") {
          return {
            phase: data.phase,
            accepting_proposals_ends_at: data.accepting_proposals_ends_at ?? acceptingEnds,
            proposal_voting_ends_at: data.proposal_voting_ends_at ?? vEnd,
          };
        }
        const cur = await reloadIssue(issueId);
        if (cur) {
          phase = String(cur.phase);
          acceptingEnds = cur.accepting_proposals_ends_at ?? acceptingEnds;
          votingEnds = cur.proposal_voting_ends_at ?? votingEnds;
        }
      }
    }
  }

  if (phase === "proposal_voting" && votingEnds) {
    const vMs = new Date(votingEnds).getTime();
    if (Number.isFinite(vMs) && Date.now() > vMs) {
      const pending = await listPendingProposalIds(issueId);
      if (pending.length === 0) {
        const extendBy = SUBMISSION_WINDOW_MS <= 0 ? ACCEPTING_EMPTY_EXTENSION_MS : SUBMISSION_WINDOW_MS;
        const nextEnds = isoPlus(extendBy);
        await supabase
          .from("issues")
          .update({
            phase: "accepting_proposals",
            accepting_proposals_ends_at: nextEnds,
            proposal_voting_ends_at: null,
            recommended_proposal_id: null,
          })
          .eq("id", issueId)
          .eq("phase", "proposal_voting");
        const cur = await reloadIssue(issueId);
        if (cur) {
          return {
            phase: cur.phase,
            accepting_proposals_ends_at: cur.accepting_proposals_ends_at,
            proposal_voting_ends_at: cur.proposal_voting_ends_at ?? null,
          };
        }
      } else {
        const ids = pending.map((p) => p.id);
        const votes = await tallyVotes(issueId);
        const winnerId = pickWinnerProposalIds(ids, votes);
        const { data: win, error: wErr } = await supabase
          .from("issue_work_proposals")
          .select("id, proposer_privy_user_id, milestones")
          .eq("id", winnerId)
          .maybeSingle();
        if (wErr || !win) {
          return { phase, accepting_proposals_ends_at: acceptingEnds, proposal_voting_ends_at: votingEnds };
        }
        const { data: up, error: uErr } = await supabase
          .from("issues")
          .update({
            phase: "in_progress",
            winning_proposal_id: win.id,
            assigned_worker_privy_user_id: win.proposer_privy_user_id,
            winning_milestones_json: win.milestones,
            proposal_voting_ends_at: null,
            exec_payouts_completed: 0,
            milestone_proof_storage_path: null,
            milestone_review_deadline: null,
            vault_payout_last_error: null,
          })
          .eq("id", issueId)
          .eq("phase", "proposal_voting")
          .select("*")
          .maybeSingle();
        if (!uErr && up) {
          /** No payout until the volunteer completes the first milestone and proof passes review. */
          const now = new Date().toISOString();
          await supabase
            .from("issue_work_proposals")
            .update({ status: "accepted", reviewed_at: now })
            .eq("id", win.id)
            .eq("status", "pending");
          await supabase
            .from("issue_work_proposals")
            .update({ status: "rejected", reviewed_at: now })
            .eq("issue_id", issueId)
            .eq("status", "pending")
            .neq("id", win.id);

          const cur = await reloadIssue(issueId);
          if (cur) {
            return {
              phase: cur.phase,
              accepting_proposals_ends_at: cur.accepting_proposals_ends_at ?? null,
              proposal_voting_ends_at: cur.proposal_voting_ends_at ?? null,
            };
          }
        }
      }
    }
  }

  if (phase === "in_progress") {
    const cur = await reloadIssue(issueId);
    if (cur && String(cur.phase) === "in_progress") {
      await syncInProgressMilestones(issueId, cur);
      const after = await reloadIssue(issueId);
      if (after) {
        return {
          phase: after.phase,
          accepting_proposals_ends_at: after.accepting_proposals_ends_at ?? null,
          proposal_voting_ends_at: after.proposal_voting_ends_at ?? null,
        };
      }
    }
  }

  return {
    phase,
    accepting_proposals_ends_at: acceptingEnds,
    proposal_voting_ends_at: votingEnds,
  };
}

/**
 * After milestone proof + review window, pay the next tranche (or complete the issue).
 */
async function syncInProgressMilestones(issueId, row) {
  const exec = Number(row.exec_payouts_completed) || 0;

  const deadline = row.milestone_review_deadline ? new Date(row.milestone_review_deadline).getTime() : NaN;
  const hasProof = Boolean(String(row.milestone_proof_storage_path ?? "").trim());
  if (!hasProof || !Number.isFinite(deadline) || Date.now() <= deadline) return;
  if (exec < 0 || exec > 3) return;

  const fresh = await reloadIssue(issueId);
  if (!fresh) return;
  await applyMilestoneAdvance(issueId, fresh, {});
}

/**
 * Shared advance: pays next tranche or completes project.
 * @param {object} fresh full issue row
 */
async function applyMilestoneAdvance(issueId, fresh, _opts) {
  const exec = Number(fresh.exec_payouts_completed) || 0;
  const hasProof = Boolean(String(fresh.milestone_proof_storage_path ?? "").trim());
  if (!hasProof) return;

  if (exec < 3) {
    const payIdx = exec;
    const pay = await payMilestoneTranche(fresh, payIdx);
    if (!pay.ok) {
      await supabase.from("issues").update({ vault_payout_last_error: pay.error ?? "Payout failed" }).eq("id", issueId);
      return;
    }
    const nextExec = exec + 1;
    const patch = {
      exec_payouts_completed: nextExec,
      milestone_proof_storage_path: null,
      milestone_review_deadline: null,
      vault_payout_last_error: null,
    };
    /** Three tranches (matching proposal milestones) fully released — close the issue. */
    if (nextExec >= 3) {
      patch.phase = "completed";
    }
    await supabase.from("issues").update(patch).eq("id", issueId);
    return;
  }

  if (exec === 3) {
    await supabase
      .from("issues")
      .update({
        phase: "completed",
        milestone_proof_storage_path: null,
        milestone_review_deadline: null,
        vault_payout_last_error: null,
      })
      .eq("id", issueId);
  }
}

/**
 * Periodically advance voting windows and milestone review payouts.
 * Safe to call on an interval; each issue is re-read from the DB before syncing.
 */
async function syncAllActiveIssues() {
  if (!supabase) return;
  const { data, error } = await supabase
    .from("issues")
    .select("id")
    .in("phase", ["fundraising", "accepting_proposals", "proposal_voting", "in_progress"]);
  if (error || !data?.length) return;
  for (const r of data) {
    try {
      const fresh = await reloadIssue(r.id);
      if (fresh) await syncWorkProposalPhases(r.id, fresh);
    } catch {
      /* ignore per-issue errors so one bad row does not stop the batch */
    }
  }
}

module.exports = {
  syncWorkProposalPhases,
  syncAllActiveIssues,
  REVIEW_WINDOW_MS,
  applyMilestoneAdvance,
  reloadIssue,
  ensureWinningMilestonesOnRow,
};
