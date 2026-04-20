export type IssueCategory = "Infrastructure" | "Environment" | "Education" | "Community" | "Safety";

export type Criticality = "low" | "medium" | "critical";

export type IssuePhaseKey = "needs_initiation" | "fundraising" | "in_progress" | "completed";

export type Issue = {
  id: string;
  title: string;
  /** Longer context from the reporter */
  description: string;
  /** Single-line summary for cards and search */
  location: string;
  city: string;
  village: string;
  street: string;
  latitude: number | null;
  longitude: number | null;
  /** Distance from current viewer (km), null until browser location is known */
  distanceKm: number | null;
  category: IssueCategory;
  criticality: Criticality;
  /** Machine phase */
  phaseKey: IssuePhaseKey;
  /** Human-readable phase (same as `phase` for cards) */
  phaseLabel: string;
  /** Display string used on cards (kept for compatibility with filters) */
  phase: string;
  raisedBy?: string | null;
  raisedCents: number;
  goalCents: number;
  supporters: number;
  imageSrc: string;
  createdAt: string;
  creatorPrivyUserId: string;
  initiationCount: number;
  initiationThreshold: number;
  smartWalletAddress?: string | null;
  userFollowing: boolean;
  /** Viewer already cast an initiation vote for this issue */
  userHasInitiated: boolean;
  isCreator: boolean;
};

export type SortMode =
  | "recent"
  | "oldest"
  | "mostFunded"
  | "leastFunded"
  | "nearest"
  | "farthest"
  | "goalHigh"
  | "goalLow"
  | "titleAsc"
  | "titleDesc"
  | "mostSupporters";
