import type { Criticality, Issue, IssueCategory, IssuePhaseKey } from "../types";
import { haversineKm } from "./haversineKm";

const phaseLabels: Record<IssuePhaseKey, string> = {
  needs_initiation: "Needs initiation",
  fundraising: "Fund raising",
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
  follower_count: number;
  initiation_threshold: number;
  initiation_count?: number;
  smart_wallet_address: string | null;
  created_at: string;
  user_following?: boolean;
  user_has_initiated?: boolean;
};

const PHASE_KEYS: IssuePhaseKey[] = ["needs_initiation", "fundraising", "in_progress", "completed"];

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
  let phaseKey = PHASE_KEYS.includes(rawPhase as IssuePhaseKey) ? (rawPhase as IssuePhaseKey) : "needs_initiation";
  const initiationCount = Number(row.initiation_count) || 0;
  const initiationThreshold = Math.min(
    INITIATION_THRESHOLD_CAP,
    Math.max(1, Number(row.initiation_threshold) || 1)
  );
  /** DB phase can lag behind votes; treat met threshold as fundraising for UI and actions. */
  if (phaseKey === "needs_initiation" && initiationCount >= initiationThreshold) {
    phaseKey = "fundraising";
  }
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
