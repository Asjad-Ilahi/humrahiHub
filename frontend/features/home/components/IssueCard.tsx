"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { MapPin, Flame, Users, Loader2, Plus, Send, X, Vote } from "lucide-react";
import { useHomeShell } from "@/features/home/context/HomeShellContext";
import { formatPkrFromAmount, usdCentsToPkrAmount } from "@/lib/fxPkr";
import type { Criticality, Issue } from "../types";

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:5000";

const LIME = "#B1FF67";
const TRACK = "#2a2a2a";

const criticalityLabel: Record<Criticality, string> = {
  low: "Low critical",
  medium: "Medium",
  critical: "Critical",
};

function CriticalityBadge({ level }: { level: Criticality }) {
  const base =
    "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-secondary transition-transform duration-200";

  if (level === "critical") {
    return (
      <span className={`${base} bg-white`}>
        <Flame className="size-3.5 shrink-0 text-red-600" aria-hidden />
        <span className="font-semibold text-red-600">{criticalityLabel.critical}</span>
      </span>
    );
  }
  if (level === "medium") {
    return (
      <span className={`${base} bg-white text-orange-600`}>
        <span className="size-2 rounded-full bg-orange-500" aria-hidden />
        {criticalityLabel.medium}
      </span>
    );
  }
  return (
    <span className={`${base} bg-white text-emerald-800`}>
      <span className="size-2 rounded-full bg-emerald-500" aria-hidden />
      {criticalityLabel.low}
    </span>
  );
}

function formatUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
    cents / 100
  );
}

function formatGoalRaised(raisedCents: number, goalCents: number, pkrPerUsd: number | null): string {
  if (pkrPerUsd != null && pkrPerUsd > 0) {
    const r = formatPkrFromAmount(usdCentsToPkrAmount(raisedCents, pkrPerUsd));
    const g = formatPkrFromAmount(usdCentsToPkrAmount(goalCents, pkrPerUsd));
    return `${r} / ${g}`;
  }
  return `${formatUsd(raisedCents)} / ${formatUsd(goalCents)}`;
}

type Props = {
  issue: Issue;
  viewerPrivyId: string;
  /** PKR per 1 USD for display; null shows USD until rate loads. */
  pkrPerUsd: number | null;
  onFollowChange: (issueId: string, nextFollowing: boolean) => Promise<void>;
  onInitiate: (issueId: string) => Promise<void>;
};

function profileStr(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function formatStreetLine(profile: Record<string, unknown>): string {
  const num = profileStr(profile.street_number);
  const st = profileStr(profile.street);
  return [num, st].filter(Boolean).join(" ").trim();
}

function CreatorProfileFields({ profile }: { profile: Record<string, unknown> }) {
  const streetLine = formatStreetLine(profile);
  const rows = [
    ["Phone", profileStr(profile.phone)],
    ["Street address", streetLine],
    ["City", profileStr(profile.city)],
    ["Country", profileStr(profile.country)],
    ["Smart wallet", profileStr(profile.smart_wallet_address)],
  ].filter((r): r is [string, string] => r[1].length > 0);

  if (rows.length === 0) {
    return <p className="text-text-secondary">No extra profile details are available.</p>;
  }

  return (
    <>
      {rows.map(([label, s]) => (
        <div key={label} className="flex justify-between gap-4 border-b border-stroke/80 py-2 last:border-0">
          <dt className="shrink-0 text-text-secondary">{label}</dt>
          <dd className="min-w-0 max-w-[65%] break-words text-right font-medium text-secondary">{s}</dd>
        </div>
      ))}
    </>
  );
}

export default function IssueCard({ issue, viewerPrivyId, pkrPerUsd, onFollowChange, onInitiate }: Props) {
  const router = useRouter();
  const { isWorkMode, volunteerApproved } = useHomeShell();
  const pct =
    issue.goalCents > 0 ? Math.min(100, Math.round((issue.raisedCents / issue.goalCents) * 100)) : 0;
  const reporter = (issue.raisedBy ?? "").trim();
  const [initBusy, setInitBusy] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [creatorDialogOpen, setCreatorDialogOpen] = useState(false);
  const [creatorProfileLoading, setCreatorProfileLoading] = useState(false);
  const [creatorProfile, setCreatorProfile] = useState<Record<string, unknown> | null>(null);

  const goIssuePage = (e?: { stopPropagation: () => void }) => {
    e?.stopPropagation();
    router.push(`/home/issue/${issue.id}`);
  };

  const inInitiationPhase = issue.phaseKey === "needs_initiation";
  const showInitiate =
    inInitiationPhase && !issue.isCreator && Boolean(viewerPrivyId) && !issue.userHasInitiated;
  const showInitiationMeter = inInitiationPhase;
  const acceptingProposals = issue.phaseKey === "accepting_proposals";
  const proposalVoting = issue.phaseKey === "proposal_voting";
  const inProgress = issue.phaseKey === "in_progress";
  const completed = issue.phaseKey === "completed";
  const canSendProposal = acceptingProposals && isWorkMode && volunteerApproved && Boolean(viewerPrivyId);
  const fundraising = issue.phaseKey === "fundraising";
  const showDonate = fundraising;
  const showFollow = fundraising;

  useEffect(() => {
    if (!creatorDialogOpen || !issue.creatorPrivyUserId) return;
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setCreatorProfileLoading(true);
      setCreatorProfile(null);
      try {
        const res = await fetch(`${backendUrl}/api/profiles/${encodeURIComponent(issue.creatorPrivyUserId)}`);
        const body = (await res.json()) as { data?: Record<string, unknown> | null };
        if (!cancelled) setCreatorProfile(body.data ?? null);
      } catch {
        if (!cancelled) setCreatorProfile(null);
      } finally {
        if (!cancelled) setCreatorProfileLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [creatorDialogOpen, issue.creatorPrivyUserId]);

  const handleInitiate = async () => {
    setInitBusy(true);
    try {
      await onInitiate(issue.id);
    } finally {
      setInitBusy(false);
    }
  };

  const handleFollow = async () => {
    setFollowBusy(true);
    try {
      await onFollowChange(issue.id, !issue.userFollowing);
    } finally {
      setFollowBusy(false);
    }
  };

  return (
    <article
      className="group relative h-[480px] cursor-pointer overflow-hidden rounded-[32px] border border-stroke bg-white transition-transform duration-300 ease-out hover:-translate-y-1"
      onClick={() => goIssuePage()}
    >
      <div className="absolute inset-x-0 top-0 z-0 h-[220px]">
        {issue.imageSrc ? (
          <Image
            src={issue.imageSrc}
            alt=""
            fill
            className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
            sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
            unoptimized={issue.imageSrc.includes("supabase.co")}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-card text-sm text-text-secondary">No image</div>
        )}
      </div>

      <div className="absolute left-3 top-3 z-20 flex max-w-[calc(100%-6rem)] flex-wrap gap-2">
        <span
          className="rounded-full bg-black px-3 py-1 text-xs font-semibold backdrop-blur-sm transition-transform duration-300 group-hover:scale-[1.02]"
          style={{ color: LIME }}
        >
          {issue.category}
        </span>
      </div>

      <div className="absolute right-3 top-3 z-20 flex flex-wrap items-center justify-end gap-2">
        <CriticalityBadge level={issue.criticality} />
        <span className="inline-flex items-center gap-1 rounded-full border border-stroke bg-white px-2.5 py-1 text-xs font-semibold text-secondary">
          <Users className="size-3.5 text-[#707070]" aria-hidden />
          {issue.supporters}
        </span>
      </div>

      <div className="absolute inset-x-0 bottom-0 top-[168px] z-10 flex flex-col rounded-t-[32px] border-t border-stroke bg-white px-5 pb-4 pt-5">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <h3 className="text-lg font-bold leading-tight text-secondary md:text-xl">{issue.title}</h3>
          <div className="mt-3 flex items-center justify-between gap-2 text-sm text-[#707070]">
            <span className="inline-flex min-w-0 items-center gap-1">
              <MapPin className="size-4 shrink-0" aria-hidden />
              <span className="truncate">{issue.location}</span>
            </span>
            <span className="shrink-0 font-medium">
              {issue.distanceKm != null ? `${issue.distanceKm} km` : "—"}
            </span>
          </div>

          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-[#707070]">Phase</dt>
              <dd className="font-semibold text-secondary">{issue.phase}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[#707070]">Raised by</dt>
              <dd className="text-right">
                {reporter ? (
                  <button
                    type="button"
                    data-no-issue-nav
                    onClick={(e) => {
                      e.stopPropagation();
                      setCreatorDialogOpen(true);
                    }}
                    className="max-w-[min(100%,12rem)] truncate text-left font-medium text-secondary underline decoration-stroke underline-offset-2 transition-colors hover:text-text-secondary"
                  >
                    {reporter}
                  </button>
                ) : (
                  <span className="font-medium text-[#707070]">—</span>
                )}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[#707070]">Funds raised</dt>
              <dd className="text-right text-sm">
                <span className="font-bold text-secondary">
                  {formatGoalRaised(issue.raisedCents, issue.goalCents, pkrPerUsd)}
                </span>
              </dd>
            </div>
          </dl>

          {showInitiationMeter && (
            <p className="mt-2 text-xs text-text-secondary">
              <span className="text-[#707070]">Backers needed to open fundraising:</span>{" "}
              <span className="font-semibold text-secondary">
                {issue.initiationCount} / {issue.initiationThreshold}
              </span>
            </p>
          )}

          <div className="mt-3 h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: TRACK }}>
            <div
              className="h-full rounded-full transition-[width] duration-500 ease-out"
              style={{ width: `${pct}%`, backgroundColor: LIME }}
            />
          </div>
        </div>

          <div className="mt-auto flex shrink-0 flex-col gap-2 pt-4">
            {inInitiationPhase ? (
              <>
                {showInitiate ? (
                  <button
                    type="button"
                    data-no-issue-nav
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleInitiate();
                    }}
                    disabled={initBusy}
                    className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full bg-[#B1FF67] px-4 py-3 text-base font-semibold text-secondary transition-transform duration-300 hover:-translate-y-0.5 active:scale-[0.99] disabled:opacity-50"
                  >
                    {initBusy ? (
                      <>
                        <Loader2 className="size-5 animate-spin shrink-0" aria-hidden />
                        Saving…
                      </>
                    ) : (
                      <>
                        <Plus className="size-5 shrink-0 stroke-[2.5]" aria-hidden />
                        Support start
                      </>
                    )}
                  </button>
                ) : null}
                {!issue.isCreator && viewerPrivyId && issue.userHasInitiated ? (
                  <p className="py-2 text-center text-sm font-medium text-text-secondary">
                    You supported starting this fundraiser.
                  </p>
                ) : null}
                {issue.isCreator ? (
                  <p className="py-2 text-center text-xs text-text-secondary">
                    Waiting for one supporter to tap Support start so fundraising can open.
                  </p>
                ) : null}
                {!viewerPrivyId && !issue.isCreator ? (
                  <p className="py-2 text-center text-xs text-text-secondary">Sign in to support starting this project.</p>
                ) : null}
              </>
            ) : (
              <div className="flex flex-col gap-2">
                {acceptingProposals ? (
                  <div data-no-issue-nav onClick={(e) => e.stopPropagation()} className="w-full">
                    {canSendProposal ? (
                      <button
                        type="button"
                        onClick={(e) => goIssuePage(e)}
                        className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full bg-[#B1FF67] px-4 py-3 text-base font-semibold text-secondary transition-transform duration-300 hover:-translate-y-0.5 active:scale-[0.99]"
                      >
                        <Send className="size-5 shrink-0" strokeWidth={2} aria-hidden />
                        Send proposal
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled
                        title={
                          !viewerPrivyId
                            ? "Sign in to use volunteer tools."
                            : !volunteerApproved
                              ? "Approved volunteers only. Apply from your profile."
                              : "Switch to Work / Volunteer in the header to submit."
                        }
                        className="inline-flex min-h-[48px] w-full cursor-not-allowed items-center justify-center gap-2 rounded-full border border-stroke bg-[#ececec] px-4 py-3 text-base font-semibold text-text-secondary opacity-60"
                      >
                        <Send className="size-5 shrink-0 opacity-70" strokeWidth={2} aria-hidden />
                        Send proposal
                      </button>
                    )}
                  </div>
                ) : null}
                {proposalVoting && issue.userHasDonated ? (
                  <button
                    type="button"
                    onClick={(e) => goIssuePage(e)}
                    className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full bg-[#B1FF67] px-4 py-3 text-base font-semibold text-secondary transition-transform duration-300 hover:-translate-y-0.5 active:scale-[0.99]"
                  >
                    <Vote className="size-5 shrink-0" strokeWidth={2} aria-hidden />
                    Vote on proposals
                  </button>
                ) : null}
                {proposalVoting && viewerPrivyId && !issue.userHasDonated ? (
                  <p className="py-2 text-center text-xs text-text-secondary">Proposal voting — donors who supported this project can vote.</p>
                ) : null}
                {inProgress ? (
                  <button
                    type="button"
                    onClick={(e) => goIssuePage(e)}
                    className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full bg-[#B1FF67] px-4 py-3 text-base font-semibold text-secondary transition-transform duration-300 hover:-translate-y-0.5 active:scale-[0.99]"
                  >
                    View
                  </button>
                ) : null}
                {completed ? (
                  <button
                    type="button"
                    disabled
                    className="inline-flex min-h-[48px] w-full cursor-not-allowed items-center justify-center gap-2 rounded-full border border-stroke bg-[#ececec] px-4 py-3 text-base font-semibold text-text-secondary opacity-70"
                  >
                    Completed
                  </button>
                ) : null}
                {(showDonate || showFollow) && (
                  <div className="flex items-center gap-3">
                    {showDonate ? (
                      <button
                        type="button"
                        onClick={(e) => goIssuePage(e)}
                        className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-full bg-[#B1FF67] px-4 py-3 text-base font-semibold text-secondary transition-transform duration-300 hover:-translate-y-0.5 active:scale-[0.99]"
                      >
                        Donate
                        <Image src="/donate.svg" alt="" width={14} height={14} className="shrink-0" />
                      </button>
                    ) : null}
                    {showFollow ? (
                      <button
                        type="button"
                        data-no-issue-nav
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleFollow();
                        }}
                        disabled={followBusy}
                        className={`inline-flex min-h-[48px] shrink-0 items-center justify-center gap-1.5 rounded-full px-4 py-3 text-sm font-semibold transition-transform duration-300 hover:-translate-y-0.5 disabled:opacity-50 ${
                          issue.userFollowing ? "bg-secondary text-primary" : "bg-[#e8e8e8] text-secondary"
                        }`}
                      >
                        {issue.userFollowing ? "Following" : "Follow"}
                        {!issue.userFollowing ? <span className="text-lg font-bold leading-none">+</span> : null}
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
            )}
          </div>
      </div>

      {creatorDialogOpen ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/45 p-4"
          role="presentation"
          onClick={() => setCreatorDialogOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setCreatorDialogOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="creator-dialog-title"
            className="relative w-full max-w-md rounded-2xl border border-stroke bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setCreatorDialogOpen(false)}
              className="absolute right-4 top-4 rounded-lg p-1 text-text-secondary transition-colors hover:bg-card hover:text-secondary"
              aria-label="Close"
            >
              <X className="size-5" />
            </button>
            <h2 id="creator-dialog-title" className="pr-10 text-lg font-bold text-secondary">
              Reporter
            </h2>
            <p className="mt-1 text-sm font-semibold text-secondary">{reporter || "—"}</p>

            <div className="mt-5 space-y-3 text-sm">
              {creatorProfileLoading ? (
                <div className="flex items-center gap-2 text-text-secondary">
                  <Loader2 className="size-5 animate-spin shrink-0" aria-hidden />
                  Loading profile…
                </div>
              ) : creatorProfile ? (
                <CreatorProfileFields profile={creatorProfile} />
              ) : (
                <p className="text-text-secondary">No extra profile details are available.</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}
