import type { Criticality, Issue, IssueCategory, IssuePhaseKey } from "../types";
import { haversineKm } from "./haversineKm";

export type WinningMilestone = { title: string; percent: number };

/** Strict parse — no default 33/34/33; invalid JSON stays null so UI can prompt refresh. */
export function parseWinningMilestonesJson(raw: unknown): WinningMilestone[] | null {
  if (!Array.isArray(raw) || raw.length !== 3) return null;
  const out: WinningMilestone[] = [];
  for (let i = 0; i < 3; i += 1) {
    const m = raw[i] as Record<string, unknown>;
    const pct = Math.round(Number(m?.percent));
    const title = String(m?.title ?? `Milestone ${i + 1}`).trim() || `Milestone ${i + 1}`;
    if (!Number.isFinite(pct) || pct < 1 || pct > 99) return null;
    out.push({ title, percent: pct });
  }
  const sum = out.reduce((acc, x) => acc + x.percent, 0);
  if (sum !== 100) return null;
  return out;
}

const phaseLabels: Record<IssuePhaseKey, string> = {
  needs_initiation: "Needs initiation",
  fundraising: "Fund raising",
  accepting_proposals: "Accepting proposals",
  proposal_voting: "Proposal voting",
  in_progress: "In progress",
  completed: "Completed",
};

export type ApiIssueRow = {
  id: string;
  creator_privy_user_id: string;
  creator_display_name: string | null;
  title: string;
  description?: string | null;
  image_storage_path?: string;
  image_public_url: string | null;
  category: string;
  severity: string;
  /** Legacy single line (optional if DB migrated to city/village/street only) */
  location?: string | null;
  city?: string | null;
  village?: string | null;
  street?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  distance_km: number | string | null;
  donation_target_cents: number;
  fund_raised_cents: number;
  phase: string;
  accepting_proposals_ends_at?: string | null;
  proposal_voting_ends_at?: string | null;
  winning_proposal_id?: string | null;
  assigned_worker_privy_user_id?: string | null;
  exec_payouts_completed?: number;
  vault_payout_last_error?: string | null;
  winning_milestones_json?: unknown;
  milestone_proof_public_url?: string | null;
  milestone_review_deadline?: string | null;
  user_has_donated?: boolean;
  follower_count: number;
  initiation_threshold: number;
  initiation_count?: number;
  smart_wallet_address: string | null;
  created_at: string;
  user_following?: boolean;
  user_has_initiated?: boolean;
};

const PHASE_KEYS: IssuePhaseKey[] = [
  "needs_initiation",
  "fundraising",
  "accepting_proposals",
  "proposal_voting",
  "in_progress",
  "completed",
];

/** Accepts snake_case from DB and occasional humanized strings so `phaseKey` matches the UI label. */
function canonicalizePhaseRaw(raw: string): string {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (s === "fund_raising") return "fundraising";
  return s;
}

/** Hackathon: only one community “support start” vote unlocks fundraising (matches backend). */
const INITIATION_THRESHOLD_CAP = 1;

function formatLocationLine(city: string, village: string, street: string): string {
  return [street, village, city]
    .map((s) => String(s).trim())
    .filter((s) => s.length > 0)
    .join(", ");
}

export function mapApiIssueRow(
  row: ApiIssueRow,
  viewerPrivyId: string | null,
  viewerPos: { lat: number; lng: number } | null
): Issue {
  const rawPhase = String(row.phase ?? "needs_initiation");
  const normalizedPhase = canonicalizePhaseRaw(rawPhase);
  let phaseKey = PHASE_KEYS.includes(normalizedPhase as IssuePhaseKey)
    ? (normalizedPhase as IssuePhaseKey)
    : "needs_initiation";
  const initiationCount = Number(row.initiation_count) || 0;
  const initiationThreshold = Math.min(
    INITIATION_THRESHOLD_CAP,
    Math.max(1, Number(row.initiation_threshold) || 1)
  );
  /** DB phase can lag behind votes; treat met threshold as fundraising for UI and actions. */
  if (phaseKey === "needs_initiation" && initiationCount >= initiationThreshold) {
    phaseKey = "fundraising";
  }
  const rawMilestones = row.winning_milestones_json;
  const winningMilestones = parseWinningMilestonesJson(rawMilestones);

  const label = phaseLabels[phaseKey] ?? rawPhase;
  const sev = String(row.severity ?? "low").toLowerCase() as Criticality;

  const city = row.city != null ? String(row.city) : "";
  const village = row.village != null ? String(row.village) : "";
  const street = row.street != null ? String(row.street) : "";
  const locationLine =
    city.length > 0 || village.length > 0 || street.length > 0
      ? formatLocationLine(city, village, street)
      : String(row.location ?? "").trim();

  const lat = Number(row.latitude);
  const lng = Number(row.longitude);
  let distanceKm: number | null = null;
  if (
    viewerPos &&
    Number.isFinite(viewerPos.lat) &&
    Number.isFinite(viewerPos.lng) &&
    Number.isFinite(lat) &&
    Number.isFinite(lng)
  ) {
    distanceKm = haversineKm(viewerPos.lat, viewerPos.lng, lat, lng);
  }

  return {
    id: row.id,
    title: row.title,
    description: String(row.description ?? "").trim(),
    location: locationLine,
    city,
    village,
    street,
    latitude: Number.isFinite(lat) ? lat : null,
    longitude: Number.isFinite(lng) ? lng : null,
    distanceKm,
    category: row.category as IssueCategory,
    criticality: sev === "medium" || sev === "critical" || sev === "low" ? sev : "low",
    phaseKey,
    acceptingProposalsEndsAt:
      row.accepting_proposals_ends_at != null ? String(row.accepting_proposals_ends_at) : null,
    proposalVotingEndsAt:
      row.proposal_voting_ends_at != null ? String(row.proposal_voting_ends_at) : null,
    winningProposalId: row.winning_proposal_id != null ? String(row.winning_proposal_id) : null,
    userHasDonated: Boolean(row.user_has_donated),
    assignedWorkerPrivyUserId: row.assigned_worker_privy_user_id != null ? String(row.assigned_worker_privy_user_id) : null,
    execPayoutsCompleted: Number(row.exec_payouts_completed) || 0,
    vaultPayoutLastError: row.vault_payout_last_error != null ? String(row.vault_payout_last_error) : null,
    winningMilestones,
    milestoneProofPublicUrl: row.milestone_proof_public_url != null ? String(row.milestone_proof_public_url) : null,
    milestoneReviewDeadline:
      row.milestone_review_deadline != null ? String(row.milestone_review_deadline) : null,
    phaseLabel: label,
    phase: label,
    raisedBy: row.creator_display_name?.trim() || null,
    raisedCents: Number(row.fund_raised_cents) || 0,
    goalCents: Number(row.donation_target_cents) || 0,
    supporters: Number(row.follower_count) || 0,
    imageSrc: row.image_public_url ?? "",
    createdAt: row.created_at,
    creatorPrivyUserId: row.creator_privy_user_id,
    initiationCount,
    initiationThreshold,
    smartWalletAddress: row.smart_wallet_address ?? null,
    userFollowing: Boolean(row.user_following),
    userHasInitiated: Boolean(row.user_has_initiated),
    isCreator: Boolean(viewerPrivyId && viewerPrivyId === row.creator_privy_user_id),
  };
}
