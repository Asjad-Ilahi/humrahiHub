import type { Criticality, Issue, IssueCategory, IssuePhaseKey, SortMode } from "../types";

const ALL_PHASES: IssuePhaseKey[] = ["needs_initiation", "fundraising", "in_progress", "completed"];

function matchesSearch(issue: Issue, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return (
    issue.title.toLowerCase().includes(s) ||
    issue.description.toLowerCase().includes(s) ||
    issue.location.toLowerCase().includes(s) ||
    issue.city.toLowerCase().includes(s) ||
    issue.village.toLowerCase().includes(s) ||
    issue.street.toLowerCase().includes(s) ||
    issue.category.toLowerCase().includes(s) ||
    issue.phase.toLowerCase().includes(s) ||
    issue.phaseLabel.toLowerCase().includes(s) ||
    (issue.raisedBy ?? "").toLowerCase().includes(s)
  );
}

function passesRadius(issue: Issue, viewerPos: { lat: number; lng: number } | null, radiusKm: number): boolean {
  if (!viewerPos) return true;
  /** Unknown distance (bad coords) should not hide the card; IP vs real address can also exceed small radii. */
  if (issue.distanceKm == null) return true;
  return issue.distanceKm <= radiusKm;
}

function passesPhaseFilter(issue: Issue, phases: Set<IssuePhaseKey>): boolean {
  if (phases.size === 0 || phases.size >= ALL_PHASES.length) return true;
  return phases.has(issue.phaseKey);
}

function sortIssues(list: Issue[], sort: SortMode): void {
  const distNearest = (a: Issue, b: Issue) => {
    const da = a.distanceKm ?? Number.POSITIVE_INFINITY;
    const db = b.distanceKm ?? Number.POSITIVE_INFINITY;
    return da - db;
  };
  const distFarthest = (a: Issue, b: Issue) => {
    const da = a.distanceKm ?? Number.NEGATIVE_INFINITY;
    const db = b.distanceKm ?? Number.NEGATIVE_INFINITY;
    return db - da;
  };

  if (sort === "recent") {
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } else if (sort === "oldest") {
    list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  } else if (sort === "mostFunded") {
    list.sort((a, b) => b.raisedCents - a.raisedCents);
  } else if (sort === "leastFunded") {
    list.sort((a, b) => a.raisedCents - b.raisedCents);
  } else if (sort === "nearest") {
    list.sort(distNearest);
  } else if (sort === "farthest") {
    list.sort(distFarthest);
  } else if (sort === "goalHigh") {
    list.sort((a, b) => b.goalCents - a.goalCents);
  } else if (sort === "goalLow") {
    list.sort((a, b) => a.goalCents - b.goalCents);
  } else if (sort === "titleAsc") {
    list.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
  } else if (sort === "titleDesc") {
    list.sort((a, b) => b.title.localeCompare(a.title, undefined, { sensitivity: "base" }));
  } else if (sort === "mostSupporters") {
    list.sort((a, b) => b.supporters - a.supporters);
  }
}

export function filterAndSortIssues(
  issues: Issue[],
  opts: {
    search: string;
    category: IssueCategory | "all";
    criticalities: Set<Criticality>;
    phases: Set<IssuePhaseKey>;
    sort: SortMode;
    radiusKm: number;
    viewerPos: { lat: number; lng: number } | null;
  }
): Issue[] {
  let out = issues.filter((i) => matchesSearch(i, opts.search));
  if (opts.category !== "all") {
    out = out.filter((i) => i.category === opts.category);
  }
  if (opts.criticalities.size > 0 && opts.criticalities.size < 3) {
    out = out.filter((i) => opts.criticalities.has(i.criticality));
  }
  out = out.filter((i) => passesPhaseFilter(i, opts.phases));
  out = out.filter((i) => passesRadius(i, opts.viewerPos, opts.radiusKm));

  const sorted = [...out];
  sortIssues(sorted, opts.sort);
  return sorted;
}

export function countByCategory(issues: Issue[]): Record<IssueCategory, number> {
  const init: Record<IssueCategory, number> = {
    Infrastructure: 0,
    Environment: 0,
    Education: 0,
    Community: 0,
    Safety: 0,
  };
  for (const i of issues) {
    const c = i.category;
    if (c in init) init[c as IssueCategory] += 1;
  }
  return init;
}

export { ALL_PHASES };
