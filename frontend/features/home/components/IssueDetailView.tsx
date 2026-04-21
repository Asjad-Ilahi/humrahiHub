"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  Check,
  ChevronLeft,
  Coins,
  Copy,
  Info,
  Loader2,
  MessageCircle,
  MapPin,
  Plus,
  Share2,
  Shield,
  User,
  Users,
  Vote,
  Camera,
  X,
  BadgeCheck,
  ClipboardList,
} from "lucide-react";
import { usePrivy } from "@privy-io/react-auth";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { getAddress, isAddress } from "viem";
import { appChain } from "@/lib/chain";
import {
  fetchPkrPerUsd,
  formatPkrFromAmount,
  pkrToUsdcHumanForDonation,
  usdCentsToPkrAmount,
} from "@/lib/fxPkr";
import { encodeUsdcTransfer, USDC_BASE_SEPOLIA } from "@/lib/usdcBaseSepolia";
import { readSmartWalletFromUserRecord } from "@/features/auth/lib/privyWallet";
import type { ApiIssueRow } from "../lib/mapApiIssue";
import { mapApiIssueRow } from "../lib/mapApiIssue";
import { privyUserIdsMatch } from "../lib/privyUserIdsMatch";
import type { Issue } from "../types";
import IssueCommunityChat from "./IssueCommunityChat";
import { useHomeShell } from "../context/HomeShellContext";
import { formatUsdFromCents } from "../lib/formatUsd";

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:5000";
const LIME = "#BEF264";
const TRACK = "#131313";

type DonationApi = { donor_display_name: string; usd_cents: number; created_at: string; tx_hash?: string };

type WorkProposalApi = {
  id: string;
  proposer_privy_user_id: string;
  pitch: string;
  milestones: { title: string; percent: number }[];
  status: string;
  created_at: string;
};

type VotingProposalRow = {
  id: string;
  proposer_privy_user_id: string;
  proposer_display_name?: string;
  pitch: string;
  milestones: { title: string; percent: number }[];
  status: string;
  created_at: string;
  vote_count: number;
  is_recommended: boolean;
};

type VotingSnapshot = {
  phase: string;
  proposal_voting_ends_at: string | null;
  recommended_proposal_id: string | null;
  viewer_donated: boolean;
  my_vote_proposal_id: string | null;
  proposals: VotingProposalRow[];
};

function phaseHeroLabel(phaseKey: string): string {
  if (phaseKey === "fundraising") return "Fundraising";
  if (phaseKey === "needs_initiation") return "Needs initiation";
  if (phaseKey === "accepting_proposals") return "Accepting proposals";
  if (phaseKey === "proposal_voting") return "Proposal voting";
  if (phaseKey === "in_progress") return "In progress";
  if (phaseKey === "completed") return "Completed";
  return phaseKey;
}

function formatReportedDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 45) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)} minutes ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} hours ago`;
  if (sec < 86400 * 7) return `${Math.floor(sec / 86400)} days ago`;
  return formatReportedDate(iso);
}

function formatVotingTimeRemaining(secondsLeft: number): string {
  if (secondsLeft <= 0) return "Time ended";
  const h = Math.floor(secondsLeft / 3600);
  const m = Math.floor((secondsLeft % 3600) / 60);
  if (h >= 48) return `${Math.floor(h / 24)}d remaining`;
  if (h >= 1) return `${h}hr ${m}m remaining`;
  if (m >= 1) return `${m}m remaining`;
  return `${secondsLeft}s remaining`;
}

function profileFieldStr(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

export default function IssueDetailView() {
  const params = useParams();
  const issueId = typeof params?.id === "string" ? params.id : "";
  const { user } = usePrivy();
  const { volunteerApproved, isWorkMode, setMode } = useHomeShell();
  const { client: smartWalletClient, getClientForChain } = useSmartWallets();

  const [rawRow, setRawRow] = useState<ApiIssueRow | null>(null);
  const [donations, setDonations] = useState<DonationApi[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pkrPerUsd, setPkrPerUsd] = useState<number | null>(null);
  const [followBusy, setFollowBusy] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  const [donatePkr, setDonatePkr] = useState("");
  const [donateBusy, setDonateBusy] = useState(false);
  const [donateMsg, setDonateMsg] = useState<string | null>(null);
  const [vaultCopied, setVaultCopied] = useState(false);
  const pkrInputRef = useRef<HTMLInputElement>(null);
  const [workProposals, setWorkProposals] = useState<WorkProposalApi[]>([]);
  const [votingSnapshot, setVotingSnapshot] = useState<VotingSnapshot | null>(null);
  const [voteBusyId, setVoteBusyId] = useState<string | null>(null);
  const [milestoneMsg, setMilestoneMsg] = useState<string | null>(null);
  const [proofBusy, setProofBusy] = useState(false);
  const [advanceBusy, setAdvanceBusy] = useState(false);
  const [proposalPitch, setProposalPitch] = useState("");
  const [proposalBusy, setProposalBusy] = useState(false);
  const [proposalMsg, setProposalMsg] = useState<string | null>(null);
  const [milestonesForm, setMilestonesForm] = useState([
    { title: "First milestone", percent: "30" },
    { title: "Second milestone", percent: "50" },
    { title: "Third milestone", percent: "20" },
  ]);
  const [expandedVoteProposalId, setExpandedVoteProposalId] = useState<string | null>(null);
  const [assignedWorkerLabel, setAssignedWorkerLabel] = useState<string | null>(null);
  const [profilePeekId, setProfilePeekId] = useState<string | null>(null);
  const [profilePeek, setProfilePeek] = useState<Record<string, unknown> | null>(null);
  const [profilePeekLoading, setProfilePeekLoading] = useState(false);

  const viewerPos = useMemo(() => null, []);
  const issue: Issue | null = useMemo(() => {
    if (!rawRow) return null;
    return mapApiIssueRow(rawRow, user?.id ?? null, viewerPos);
  }, [rawRow, user?.id, viewerPos]);

  const viewerHasProposalThisIssue = useMemo(
    () => workProposals.some((p) => privyUserIdsMatch(p.proposer_privy_user_id, user?.id)),
    [workProposals, user?.id]
  );

  const showActivityInWorkProposalsCard = Boolean(
    issue?.userHasDonated &&
      issue.phaseKey !== "proposal_voting" &&
      issue.phaseKey !== "in_progress"
  );

  const refresh = useCallback(async () => {
    if (!issueId) return;
    await Promise.resolve();
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`${backendUrl}/api/issues/${encodeURIComponent(issueId)}`, {
        headers: user?.id ? { "x-privy-user-id": user.id } : {},
      });
      const json = (await res.json()) as {
        data?: { issue: ApiIssueRow; donations?: DonationApi[] };
        error?: string;
      };
      if (!res.ok) {
        setLoadError(json.error ?? "Could not load this issue.");
        setRawRow(null);
        setDonations([]);
        setWorkProposals([]);
        return;
      }
      const row = json.data?.issue ?? null;
      setRawRow(row);
      setDonations(json.data?.donations ?? []);

      if (user?.id && row?.user_has_donated && row.phase === "proposal_voting") {
        try {
          const vr = await fetch(`${backendUrl}/api/issues/${encodeURIComponent(issueId)}/voting-state`, {
            headers: { "x-privy-user-id": user.id },
          });
          const vj = (await vr.json()) as { data?: VotingSnapshot };
          setVotingSnapshot(vr.ok && vj.data ? vj.data : null);
        } catch {
          setVotingSnapshot(null);
        }
      } else {
        setVotingSnapshot(null);
      }

      if (user?.id && row?.user_has_donated) {
        try {
          const pr = await fetch(`${backendUrl}/api/issues/${encodeURIComponent(issueId)}/work-proposals`, {
            headers: { "x-privy-user-id": user.id },
          });
          const pj = (await pr.json()) as { data?: WorkProposalApi[] };
          setWorkProposals(pr.ok ? pj.data ?? [] : []);
        } catch {
          setWorkProposals([]);
        }
      } else {
        setWorkProposals([]);
      }
    } catch {
      setLoadError("Could not reach the server.");
      setRawRow(null);
      setWorkProposals([]);
    } finally {
      setLoading(false);
    }
  }, [issueId, user]);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      void refresh();
    });
    return () => cancelAnimationFrame(id);
  }, [refresh]);

  useEffect(() => {
    let c = false;
    void (async () => {
      try {
        const r = await fetchPkrPerUsd();
        if (!c) setPkrPerUsd(r);
      } catch {
        if (!c) setPkrPerUsd(null);
      }
    })();
    return () => {
      c = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !issue?.id) return;
    if (new URLSearchParams(window.location.search).get("donate") === "1") {
      queueMicrotask(() => pkrInputRef.current?.focus());
    }
  }, [issue?.id]);

  const handleFollow = async () => {
    if (!user?.id || !issue) return;
    setFollowBusy(true);
    try {
      const path = issue.userFollowing ? "unfollow" : "follow";
      const res = await fetch(`${backendUrl}/api/issues/${encodeURIComponent(issue.id)}/${path}`, {
        method: "POST",
        headers: { "x-privy-user-id": user.id },
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setDonateMsg(json.error ?? "Follow action failed.");
        return;
      }
      await refresh();
    } finally {
      setFollowBusy(false);
    }
  };

  const [, setPhaseTick] = useState(0);
  useEffect(() => {
    if (!issue) return;
    const needsProposalTick =
      issue.phaseKey === "proposal_voting" || issue.phaseKey === "accepting_proposals";
    const needsReviewTick =
      issue.phaseKey === "in_progress" &&
      Boolean(issue.milestoneProofPublicUrl) &&
      Boolean(issue.milestoneReviewDeadline);
    if (!needsProposalTick && !needsReviewTick) return;
    const id = window.setInterval(() => setPhaseTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [issue?.id, issue?.phaseKey, issue?.milestoneProofPublicUrl, issue?.milestoneReviewDeadline]);

  /** When the milestone review window ends, refresh once so lifecycle can pay the next tranche from the vault. */
  useEffect(() => {
    if (!issue || issue.phaseKey !== "in_progress" || !issue.milestoneProofPublicUrl || !issue.milestoneReviewDeadline) {
      return;
    }
    const end = new Date(issue.milestoneReviewDeadline).getTime();
    if (!Number.isFinite(end)) return;
    const ms = Math.max(0, end - Date.now()) + 800;
    const tid = window.setTimeout(() => void refresh(), ms);
    return () => window.clearTimeout(tid);
  }, [issue?.id, issue?.phaseKey, issue?.milestoneProofPublicUrl, issue?.milestoneReviewDeadline, refresh]);

  useEffect(() => {
    const uid = issue?.assignedWorkerPrivyUserId?.trim();
    if (!uid || issue?.phaseKey !== "in_progress") {
      setAssignedWorkerLabel(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`${backendUrl}/api/profiles/${encodeURIComponent(uid)}`);
        const j = (await res.json()) as { data?: Record<string, unknown> | null };
        if (cancelled || !res.ok) return;
        const row = j.data;
        if (!row) {
          setAssignedWorkerLabel("Volunteer");
          return;
        }
        const fn = profileFieldStr(row.first_name);
        const ln = profileFieldStr(row.last_name);
        setAssignedWorkerLabel([fn, ln].filter((s) => s.length > 0).join(" ") || "Volunteer");
      } catch {
        if (!cancelled) setAssignedWorkerLabel("Volunteer");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [issue?.assignedWorkerPrivyUserId, issue?.phaseKey]);

  useEffect(() => {
    if (!profilePeekId) {
      setProfilePeek(null);
      setProfilePeekLoading(false);
      return;
    }
    let cancelled = false;
    setProfilePeekLoading(true);
    setProfilePeek(null);
    void (async () => {
      try {
        const res = await fetch(`${backendUrl}/api/profiles/${encodeURIComponent(profilePeekId)}`);
        const j = (await res.json()) as { data?: Record<string, unknown> | null };
        if (!cancelled && res.ok) setProfilePeek(j.data ?? null);
      } catch {
        if (!cancelled) setProfilePeek(null);
      } finally {
        if (!cancelled) setProfilePeekLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profilePeekId]);

  const submitProposalVote = async (proposalId: string) => {
    if (!user?.id || !issue) return;
    setVoteBusyId(proposalId);
    setMilestoneMsg(null);
    try {
      const res = await fetch(`${backendUrl}/api/issues/${encodeURIComponent(issue.id)}/votes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-privy-user-id": user.id,
        },
        body: JSON.stringify({ proposal_id: proposalId }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMilestoneMsg(j.error ?? "Could not record vote.");
        return;
      }
      await refresh();
    } catch {
      setMilestoneMsg("Network error.");
    } finally {
      setVoteBusyId(null);
    }
  };

  const submitMilestoneProofFile = async (file: File | null) => {
    if (!user?.id || !issue || !file) return;
    setProofBusy(true);
    setMilestoneMsg(null);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await fetch(`${backendUrl}/api/issues/${encodeURIComponent(issue.id)}/milestone-proof`, {
        method: "POST",
        headers: { "x-privy-user-id": user.id },
        body: fd,
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMilestoneMsg(j.error ?? "Upload failed.");
        return;
      }
      await refresh();
    } catch {
      setMilestoneMsg("Network error.");
    } finally {
      setProofBusy(false);
    }
  };

  const requestAdvanceMilestone = async () => {
    if (!user?.id || !issue) return;
    setAdvanceBusy(true);
    setMilestoneMsg(null);
    try {
      const res = await fetch(`${backendUrl}/api/issues/${encodeURIComponent(issue.id)}/advance-milestone`, {
        method: "POST",
        headers: { "x-privy-user-id": user.id },
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMilestoneMsg(j.error ?? "Could not advance.");
        return;
      }
      await refresh();
    } catch {
      setMilestoneMsg("Network error.");
    } finally {
      setAdvanceBusy(false);
    }
  };

  const treasury = issue?.smartWalletAddress?.trim() ?? "";
  const canDonateOnChain = Boolean(treasury && isAddress(treasury));
  const showDonate = Boolean(issue && issue.phaseKey === "fundraising" && canDonateOnChain);
  const fundraisingPhase = issue?.phaseKey === "fundraising";

  const handleDonate = useCallback(async () => {
    setDonateMsg(null);
    if (!issue || !user?.id) return;
    if (!pkrPerUsd || pkrPerUsd <= 0) {
      setDonateMsg("PKR rate is still loading. Try again in a moment.");
      return;
    }
    if (!canDonateOnChain) {
      setDonateMsg("Fund wallet address is not available yet.");
      return;
    }
    const raw = donatePkr.trim().replace(/,/g, "");
    const pkrNum = Number(raw);
    if (!Number.isFinite(pkrNum) || pkrNum <= 0) {
      setDonateMsg("Enter a valid PKR amount.");
      return;
    }
    let usdcHuman: string;
    try {
      usdcHuman = pkrToUsdcHumanForDonation(pkrNum, pkrPerUsd);
    } catch (e) {
      setDonateMsg(e instanceof Error ? e.message : "Invalid amount.");
      return;
    }
    let data: `0x${string}`;
    try {
      data = encodeUsdcTransfer(treasury as `0x${string}`, usdcHuman);
    } catch {
      setDonateMsg("Could not build the USDC transfer.");
      return;
    }

    const client = smartWalletClient ?? (await getClientForChain({ id: appChain.id }));
    if (!client) {
      setDonateMsg("Connect your smart wallet first.");
      return;
    }

    const donorAddr =
      readSmartWalletFromUserRecord(user) ||
      (client.account?.address as string | undefined) ||
      "";
    if (!donorAddr || !isAddress(donorAddr)) {
      setDonateMsg("Smart wallet address not available.");
      return;
    }

    setDonateBusy(true);
    try {
      const switcher = client as { switchChain?: (args: { id: number }) => Promise<void> };
      if (typeof switcher.switchChain === "function") {
        try {
          await switcher.switchChain({ id: appChain.id });
        } catch {
          /* already on chain */
        }
      }
      const hash = await client.sendTransaction({
        to: USDC_BASE_SEPOLIA,
        data,
        chain: appChain,
      });

      const rec = await fetch(`${backendUrl}/api/issues/${encodeURIComponent(issue.id)}/donate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-privy-user-id": user.id,
        },
        body: JSON.stringify({
          txHash: hash,
          donorAddress: getAddress(donorAddr),
        }),
      });
      const body = (await rec.json()) as {
        data?: { fund_raised_cents?: number; donation?: DonationApi };
        error?: string;
      };
      if (!rec.ok) {
        setDonateMsg(body.error ?? "Could not record the donation.");
        return;
      }
      if (body.data?.donation) {
        setDonations((prev) => {
          const d = body.data!.donation!;
          if (prev.some((x) => x.tx_hash && d.tx_hash && x.tx_hash === d.tx_hash)) return prev;
          return [d, ...prev];
        });
      }
      setDonateMsg("Thank you — your support was recorded.");
      setDonatePkr("");
      await refresh();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("humrahi:refresh-wallet-balance"));
      }
    } catch (e) {
      setDonateMsg(e instanceof Error ? e.message : "Transaction failed.");
    } finally {
      setDonateBusy(false);
    }
  }, [
    canDonateOnChain,
    donatePkr,
    getClientForChain,
    issue,
    pkrPerUsd,
    smartWalletClient,
    treasury,
    user,
    refresh,
  ]);

  const share = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (navigator.share) {
        await navigator.share({ title: issue?.title, url });
      } else {
        await navigator.clipboard.writeText(url);
        setDonateMsg("Link copied to clipboard.");
        setTimeout(() => setDonateMsg(null), 2500);
      }
    } catch {
      /* user cancelled share */
    }
  };

  if (!issueId) {
    return <p className="px-6 py-20 text-center text-sm text-text-secondary">Invalid issue link.</p>;
  }

  if (loading && !issue) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="size-10 animate-spin text-text-secondary" aria-hidden />
      </div>
    );
  }

  if (loadError || !issue || !rawRow) {
    return (
      <div className="mx-auto max-w-lg px-6 py-20 text-center">
        <p className="text-sm text-red-700">{loadError ?? "Issue not found."}</p>
        <Link
          href="/home"
          className="mt-6 inline-flex items-center gap-2 rounded-full border border-stroke px-5 py-2.5 text-sm font-semibold text-secondary transition-colors hover:bg-card"
        >
          <ArrowLeft className="size-4" />
          Back to projects
        </Link>
      </div>
    );
  }

  const pct = issue.goalCents > 0 ? Math.min(100, Math.round((issue.raisedCents / issue.goalCents) * 100)) : 0;
  const pkrRate = pkrPerUsd ?? 280;
  const raisedPkr = usdCentsToPkrAmount(issue.raisedCents, pkrRate);
  const goalPkr = usdCentsToPkrAmount(issue.goalCents, pkrRate);
  const stillPkr = Math.max(0, goalPkr - raisedPkr);
  const stillLabel = formatPkrFromAmount(stillPkr, { maximumFractionDigits: 0 });

  const activityRows = donations.map((d, i) => ({
    key: d.tx_hash || `${d.created_at}-${i}-${d.donor_display_name}`,
    name: d.donor_display_name || "Supporter",
    pkr: formatPkrFromAmount(usdCentsToPkrAmount(d.usd_cents, pkrRate), { maximumFractionDigits: 0 }),
    when: formatRelative(d.created_at),
  }));

  const vaultAddr = treasury && isAddress(treasury) ? getAddress(treasury) : "";

  const copyVault = async () => {
    if (!vaultAddr) return;
    try {
      await navigator.clipboard.writeText(vaultAddr);
      setVaultCopied(true);
      window.setTimeout(() => setVaultCopied(false), 2000);
    } catch {
      setDonateMsg("Could not copy address.");
    }
  };

  const proposalEndMs =
    issue.acceptingProposalsEndsAt != null ? new Date(issue.acceptingProposalsEndsAt).getTime() : NaN;
  const proposalSecondsLeft =
    issue.phaseKey === "accepting_proposals" && Number.isFinite(proposalEndMs)
      ? Math.max(0, Math.floor((proposalEndMs - Date.now()) / 1000))
      : null;
  const proposalCountdownLabel =
    proposalSecondsLeft != null
      ? `${Math.floor(proposalSecondsLeft / 60)}:${String(proposalSecondsLeft % 60).padStart(2, "0")} left in proposal window`
      : null;

  const votingEndMs =
    issue.proposalVotingEndsAt != null ? new Date(issue.proposalVotingEndsAt).getTime() : NaN;
  const votingSecondsLeft =
    issue.phaseKey === "proposal_voting" && Number.isFinite(votingEndMs)
      ? Math.max(0, Math.floor((votingEndMs - Date.now()) / 1000))
      : null;
  const votingCountdownLabel =
    votingSecondsLeft != null
      ? `${Math.floor(votingSecondsLeft / 60)}:${String(votingSecondsLeft % 60).padStart(2, "0")} left to vote`
      : null;

  const reviewEndMs =
    issue.milestoneReviewDeadline != null ? new Date(issue.milestoneReviewDeadline).getTime() : NaN;
  const reviewSecondsLeft =
    issue.phaseKey === "in_progress" &&
    Boolean(issue.milestoneProofPublicUrl) &&
    Number.isFinite(reviewEndMs)
      ? Math.max(0, Math.floor((reviewEndMs - Date.now()) / 1000))
      : null;
  const reviewCountdownLabel =
    reviewSecondsLeft != null
      ? `${Math.floor(reviewSecondsLeft / 60)}:${String(reviewSecondsLeft % 60).padStart(2, "0")} left in review window`
      : null;

  const votingTimeHuman =
    votingSecondsLeft != null ? formatVotingTimeRemaining(votingSecondsLeft) : null;
  const winningMilestonesList =
    issue.winningMilestones?.length === 3 ? issue.winningMilestones : [];
  const hasWinningPlan = winningMilestonesList.length === 3;
  const execPaid = issue.execPayoutsCompleted ?? 0;
  /** Tranche index 0..2 matches proposal milestones; no payout until proof for milestone 0. */
  const currentMilestoneIdx =
    issue.phaseKey === "in_progress" ? Math.min(execPaid, 2) : 0;
  const currentMilestone = hasWinningPlan
    ? (winningMilestonesList[currentMilestoneIdx] ?? winningMilestonesList[0])
    : { title: "Milestone", percent: 0 };
  const currentSliceCents =
    issue.raisedCents > 0 && hasWinningPlan && currentMilestone
      ? Math.floor((issue.raisedCents * (Number(currentMilestone.percent) || 0)) / 100)
      : 0;
  const milestoneOrdinalLabel = (["1st", "2nd", "3rd"] as const)[execPaid] ?? "Next";
  const milestoneStepStatus = (i: number) => {
    if (i < execPaid) return "done" as const;
    if (execPaid < 3 && i === execPaid) return "current" as const;
    return "upcoming" as const;
  };

  const renderRecentActivity = () => (
    <div className="mt-4 border-t border-neutral-200 bg-[#f7f7f7] px-4 py-4 md:px-5">
      <h3 className="text-sm font-bold text-secondary">Recent Activity</h3>
      {activityRows.length === 0 ? (
        <p className="mt-3 text-sm text-text-secondary">No contributions yet — be the first to donate.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {activityRows.map((row) => (
            <li
              key={row.key}
              className="flex items-center justify-between gap-3 rounded-xl border border-stroke/60 bg-white px-3 py-2.5"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#ececec] text-secondary">
                  <Coins className="size-3.5" aria-hidden />
                </span>
                <p className="min-w-0 text-sm font-medium text-secondary">
                  <span className="font-semibold">{row.name}</span>{" "}
                  <span className="text-text-secondary">contributed {row.pkr}</span>
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-[#ececec] px-2 py-0.5 text-[10px] font-semibold text-text-secondary">
                {row.when}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const recommendedProposals = votingSnapshot?.proposals.filter((p) => p.is_recommended) ?? [];
  const otherProposals = votingSnapshot?.proposals.filter((p) => !p.is_recommended) ?? [];

  const renderProposalVoteCard = (p: VotingProposalRow) => {
    if (!votingSnapshot) return null;
    const mine = votingSnapshot.my_vote_proposal_id === p.id;
    const votedElsewhere = Boolean(
      votingSnapshot.my_vote_proposal_id && votingSnapshot.my_vote_proposal_id !== p.id
    );
    const expanded = expandedVoteProposalId === p.id;
    const name = p.proposer_display_name?.trim() || "Volunteer";
    return (
      <li
        key={p.id}
        className="rounded-[14px] border border-neutral-200 bg-white px-4 py-4 text-secondary shadow-sm md:px-5"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-1 gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-black text-white">
              <User className="size-5 opacity-90" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-secondary">{name}</p>
              <p className="text-xs text-text-secondary">Volunteer proposal</p>
              <span className="mt-2 inline-flex rounded-full bg-[#ececec] px-2.5 py-1 text-[11px] font-semibold text-secondary">
                {p.vote_count} {p.vote_count === 1 ? "Vote" : "Votes"}
              </span>
              {expanded ? (
                <div className="mt-3 space-y-2">
                  <p className="whitespace-pre-wrap text-sm text-secondary">{p.pitch}</p>
                  <ol className="list-decimal space-y-0.5 pl-4 text-xs text-text-secondary">
                    {(p.milestones ?? []).map((m, i) => (
                      <li key={i}>
                        {m.title} — {m.percent}%
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
            </div>
          </div>
          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center lg:flex-col xl:flex-row">
            <button
              type="button"
              onClick={() => setExpandedVoteProposalId((id) => (id === p.id ? null : p.id))}
              className="inline-flex min-h-[40px] flex-1 items-center justify-center rounded-full px-4 text-sm font-semibold text-black transition-transform hover:-translate-y-0.5"
              style={{ backgroundColor: LIME }}
            >
              {expanded ? "Hide proposal" : "View Proposal"}
            </button>
            <button
              type="button"
              onClick={() => setProfilePeekId(p.proposer_privy_user_id)}
              className="inline-flex min-h-[40px] flex-1 items-center justify-center rounded-full bg-black px-4 text-sm font-semibold text-[#BEF264] transition-opacity hover:opacity-90"
            >
              View Profile
            </button>
            <div className="flex flex-1 justify-end lg:min-w-[9rem]">
              {mine ? (
                <span className="inline-flex min-h-[44px] w-full min-w-[8rem] items-center justify-center rounded-xl bg-black px-4 text-sm font-bold" style={{ color: LIME }}>
                  Voted
                </span>
              ) : votedElsewhere ? (
                <span className="inline-flex min-h-[44px] w-full min-w-[8rem] items-center justify-center rounded-xl bg-[#ececec] px-4 text-sm font-semibold text-secondary">
                  Already voted
                </span>
              ) : (
                <button
                  type="button"
                  disabled={Boolean(voteBusyId)}
                  onClick={() => void submitProposalVote(p.id)}
                  className="inline-flex min-h-[44px] w-full min-w-[8rem] items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-black transition-transform hover:-translate-y-0.5 disabled:opacity-50"
                  style={{ backgroundColor: LIME }}
                >
                  {voteBusyId === p.id ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Vote className="size-4 shrink-0" aria-hidden />}
                  Vote
                </button>
              )}
            </div>
          </div>
        </div>
      </li>
    );
  };

  const submitWorkProposal = async () => {
    setProposalMsg(null);
    if (!user?.id) return;
    if (!volunteerApproved) {
      setProposalMsg("Only approved volunteers can submit a work proposal. Apply from your profile menu.");
      return;
    }
    if (!isWorkMode) {
      setProposalMsg("Switch to Work / Volunteer in the header to submit a proposal.");
      return;
    }
    if (issue.phaseKey !== "accepting_proposals") {
      setProposalMsg("This issue is not accepting proposals right now.");
      return;
    }
    const pitch = proposalPitch.trim();
    if (!pitch) {
      setProposalMsg("Add a short pitch describing your plan.");
      return;
    }
    const ms = milestonesForm.map((m) => {
      const title = m.title.trim();
      const pct = Number.parseInt(m.percent, 10);
      return { title, percent: pct };
    });
    const sum = ms.reduce((a, m) => a + (Number.isFinite(m.percent) ? m.percent : 0), 0);
    if (ms.some((m) => !m.title || !Number.isFinite(m.percent) || m.percent < 1 || m.percent > 99)) {
      setProposalMsg("Each milestone needs a title and an integer percent between 1 and 99.");
      return;
    }
    if (sum !== 100) {
      setProposalMsg(`Milestone percents must sum to 100 (currently ${sum}).`);
      return;
    }
    setProposalBusy(true);
    try {
      const res = await fetch(`${backendUrl}/api/issues/${encodeURIComponent(issue.id)}/work-proposals`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-privy-user-id": user.id,
        },
        body: JSON.stringify({ pitch, milestones: ms }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        setProposalMsg(j.error ?? "Could not submit proposal.");
        return;
      }
      setProposalPitch("");
      await refresh();
    } catch {
      setProposalMsg("Network error.");
    } finally {
      setProposalBusy(false);
    }
  };

  return (
    <div className="animate-fade-slide-in pb-20 pt-0">
      <section className="relative left-1/2 max-w-[100vw] -translate-x-1/2 ">
        <div className="relative h-[min(56vw,340px)] min-h-[220px] md:h-[400px]">
          {issue.imageSrc ? (
            <Image
              src={issue.imageSrc}
              alt=""
              fill
              className="object-cover motion-safe:transition-transform motion-safe:duration-[800ms] motion-safe:ease-out hover:scale-[1.02]"
              sizes="100vw"
              priority
              unoptimized={issue.imageSrc.includes("supabase.co")}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-card text-sm text-text-secondary">No image</div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-white via-white/25 to-transparent" />

          <div className="absolute left-3 top-3 z-10 sm:left-5 sm:top-5">
            <Link
              href="/home"
              onClick={() => setMode("fundraising")}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/80 bg-white/95 px-3 py-2 text-xs font-semibold text-secondary  transition-transform hover:scale-[1.02] active:scale-[0.98]"
            >
              <ChevronLeft className="size-4" />
              Back
            </Link>
          </div>

          <div className="absolute right-3 top-3 z-10 flex flex-wrap justify-end gap-2 sm:right-5 sm:top-5">
            <span className="rounded-full border border-stroke bg-white/95 px-3 py-1.5 text-xs font-semibold text-secondary">
              {phaseHeroLabel(issue.phaseKey)}
            </span>
            <span
              className="rounded-full bg-black px-3 py-1.5 text-xs font-semibold "
              style={{ color: LIME }}
            >
              {issue.category}
            </span>
          </div>
        </div>
      </section>

      <div className="mx-auto mt-6 grid w-full max-w-[1200px] gap-8 px-3 md:mt-8 md:gap-10 md:px-5 lg:grid-cols-[1fr_min(100%,380px)] lg:items-start lg:gap-10">
        <div className="min-w-0 space-y-4 animate-fade-slide-in md:space-y-5">
          <header className="space-y-4">
            <h1 className="text-3xl font-bold leading-tight text-secondary md:text-4xl">{issue.title}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold text-white">
                <User className="size-3.5 shrink-0 opacity-90" aria-hidden />
                {issue.raisedBy?.trim() || "Reporter"}
              </span>
              {fundraisingPhase && user?.id ? (
                <button
                  type="button"
                  onClick={() => void handleFollow()}
                  disabled={followBusy}
                  className={`inline-flex items-center gap-1 rounded-full px-4 py-1.5 text-xs font-semibold transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 ${
                    issue.userFollowing ? "bg-secondary text-white" : "border border-stroke bg-[#ececec] text-secondary"
                  }`}
                >
                  {issue.userFollowing ? "Following" : "Follow"}
                  {!issue.userFollowing ? <span className="text-base font-bold leading-none">+</span> : null}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void share()}
                className="inline-flex size-10 items-center justify-center rounded-full border border-stroke bg-[#ececec] text-secondary transition-transform hover:scale-105 active:scale-95"
                aria-label="Share"
              >
                <Share2 className="size-4" />
              </button>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-text-secondary">
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-4 shrink-0" aria-hidden />
                {issue.location || "—"}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Users className="size-4 shrink-0" aria-hidden />
                {issue.supporters} Supporters
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="size-4 shrink-0" aria-hidden />
                Reported {formatReportedDate(issue.createdAt)}
              </span>
            </div>
          </header>

          <div className="rounded-[14px] bg-[#f3f3f3] px-4 py-3 md:px-5 md:py-3">
            <h2 className="text-base font-bold text-secondary">About this Issue</h2>
            <p className="mt-1.5 whitespace-pre-wrap text-sm leading-snug text-secondary">
              {issue.description.trim() || "No description provided."}
            </p>
          </div>

          {issue.phaseKey === "proposal_voting" && issue.userHasDonated ? (
            <div className="overflow-hidden rounded-2xl border border-stroke bg-white shadow-sm">
              <div className="border-b border-stroke bg-[#fafafa] px-4 py-4 md:px-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h2 className="text-lg font-bold tracking-tight text-secondary">Proposals</h2>
                  {votingTimeHuman ? (
                    <span className="text-xs font-semibold tabular-nums text-text-secondary">{votingTimeHuman}</span>
                  ) : votingCountdownLabel ? (
                    <span className="text-xs font-semibold tabular-nums text-text-secondary">{votingCountdownLabel}</span>
                  ) : null}
                </div>
                <p className="mt-2 text-xs leading-relaxed text-text-secondary">
                  You backed this project — vote for the volunteer plan you trust. When the window ends, the highest
                  vote wins.
                </p>
              </div>
              <div className="px-3 py-4 text-secondary md:px-4 md:py-5">
                {!votingSnapshot ? (
                  <p className="text-sm text-text-secondary">Loading voting…</p>
                ) : votingSnapshot.proposals.length === 0 ? (
                  <p className="text-sm text-text-secondary">No proposals to vote on.</p>
                ) : (
                  <div className="space-y-4">
                    {recommendedProposals.length > 0 ? (
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
                          System Recommended
                        </p>
                        <ul className="mt-2 space-y-3">{recommendedProposals.map((p) => renderProposalVoteCard(p))}</ul>
                      </div>
                    ) : null}
                    {otherProposals.length > 0 ? (
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
                          Other Proposals
                        </p>
                        <ul className="mt-2 space-y-3">{otherProposals.map((p) => renderProposalVoteCard(p))}</ul>
                      </div>
                    ) : null}
                  </div>
                )}
                {renderRecentActivity()}
              </div>
            </div>
          ) : null}

          {issue.phaseKey === "in_progress" ? (
            <div className="overflow-hidden rounded-2xl border border-stroke bg-white shadow-sm">
              <div className="border-b border-stroke bg-[#fafafa] px-4 py-4 md:px-6">
                <h2 className="text-lg font-bold tracking-tight text-secondary">Progress</h2>
                <p className="mt-1 text-xs text-text-secondary">
                  Payouts follow the accepted proposal. No funds are released until each milestone is completed and
                  proof passes the review window.
                </p>
              </div>
              <div className="px-4 py-5 text-secondary md:px-5 md:py-6">
                {issue.assignedWorkerPrivyUserId ? (
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stroke pb-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-black text-white">
                        <User className="size-5 opacity-90" aria-hidden />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-bold text-secondary">{assignedWorkerLabel ?? "…"}</p>
                        <p className="text-xs text-text-secondary">Assigned volunteer</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setProfilePeekId(issue.assignedWorkerPrivyUserId!)}
                        className="rounded-full bg-black px-4 py-2 text-xs font-semibold text-[#BEF264] transition-opacity hover:opacity-90"
                      >
                        View Profile
                      </button>
                      <span className="rounded-full bg-[#ececec] px-3 py-1 text-xs font-bold tabular-nums text-secondary">
                        {execPaid}/3 paid
                      </span>
                    </div>
                  </div>
                ) : null}

                {issue.vaultPayoutLastError ? (
                  <p className="mt-4 text-xs text-red-700">
                    On-chain payout note: {issue.vaultPayoutLastError} (The issue vault must hold USDC. Gas is paid
                    by the server relayer when configured; otherwise fund the vault with Base Sepolia ETH.)
                  </p>
                ) : null}

                {!hasWinningPlan ? (
                  <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-950">
                    Loading the accepted volunteer payment split… If this stays, refresh the page — the server
                    attaches milestones from the winning proposal automatically.
                  </p>
                ) : null}

                <div className="mt-8 flex items-center justify-center">
                  {(hasWinningPlan ? winningMilestonesList : [null, null, null]).map((_, i) => (
                    <div key={i} className="flex items-center">
                      {i > 0 ? (
                        <div
                          className={`min-w-[1.5rem] max-w-[5rem] flex-1 border-t-2 border-dashed md:max-w-[7rem] ${
                            execPaid >= i ? "border-[#BEF264]" : "border-neutral-300"
                          }`}
                          aria-hidden
                        />
                      ) : null}
                      <div
                        className={`flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                          milestoneStepStatus(i) === "done"
                            ? "bg-[#BEF264] text-black"
                            : milestoneStepStatus(i) === "current"
                              ? "border-2 border-dashed border-[#BEF264] bg-white text-secondary"
                              : "border-2 border-dashed border-neutral-400 text-secondary"
                        }`}
                      >
                        {i + 1}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6">
                  <p className="text-base font-bold text-secondary">{currentMilestone.title}</p>
                  <p className="mt-1 text-lg font-bold" style={{ color: LIME }}>
                    {hasWinningPlan ? formatUsdFromCents(currentSliceCents) : "—"}
                  </p>
                  <p className="mt-2 text-sm text-text-secondary">
                    {hasWinningPlan ? (
                      <>
                        Next tranche: <span className="font-semibold text-secondary">{currentMilestone.percent}%</span>{" "}
                        of funds raised ({currentMilestone.title}). Upload a photo when this slice of work is done; after
                        the review window, this amount is sent to the volunteer.
                      </>
                    ) : (
                      <>
                        Tranche amounts follow the <strong>accepted proposal</strong> (three milestones totaling 100%).
                        Refresh if amounts do not appear.
                      </>
                    )}
                  </p>
                </div>

                {issue.milestoneProofPublicUrl ? (
                  <div className="mt-4 space-y-2">
                    <p className="text-xs font-semibold text-text-secondary">Latest proof of work</p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={issue.milestoneProofPublicUrl}
                      alt="Milestone proof"
                      className="max-h-56 w-auto max-w-full rounded-[12px] border border-stroke object-contain"
                    />
                    {reviewCountdownLabel ? (
                      <p className="text-xs font-semibold tabular-nums text-secondary">{reviewCountdownLabel}</p>
                    ) : null}
                  </div>
                ) : null}

                {privyUserIdsMatch(user?.id, issue.assignedWorkerPrivyUserId) &&
                !issue.milestoneProofPublicUrl &&
                execPaid < 3 ? (
                  <div className="mt-4 flex flex-col gap-2">
                    {milestoneMsg ? (
                      <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                        {milestoneMsg}
                      </p>
                    ) : null}
                    <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-full bg-black px-4 py-2.5 text-sm font-semibold text-[#BEF264] transition-opacity hover:opacity-90">
                      <Camera className="size-4 shrink-0" aria-hidden />
                      <span>
                        {proofBusy ? "Uploading…" : `${milestoneOrdinalLabel} milestone done — upload photo`}
                      </span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png"
                        className="sr-only"
                        disabled={proofBusy}
                        onChange={(e) => {
                          const f = e.target.files?.[0] ?? null;
                          e.target.value = "";
                          void submitMilestoneProofFile(f);
                        }}
                      />
                    </label>
                  </div>
                ) : null}

                {(issue.userHasDonated || issue.isCreator) && issue.milestoneProofPublicUrl ? (
                  <div className="mt-4 space-y-2">
                    {reviewSecondsLeft != null && reviewSecondsLeft > 0 ? (
                      <p className="text-center text-xs text-text-secondary">
                        Review window still open ({reviewCountdownLabel}). You can release the next payment after it
                        ends, or the server will process it automatically.
                      </p>
                    ) : null}
                    <button
                      type="button"
                      disabled={advanceBusy || (reviewSecondsLeft != null && reviewSecondsLeft > 0)}
                      onClick={() => void requestAdvanceMilestone()}
                      className="inline-flex w-full min-h-[44px] items-center justify-center gap-2 rounded-full text-sm font-semibold text-black transition-transform hover:-translate-y-0.5 disabled:opacity-50"
                      style={{ backgroundColor: LIME }}
                    >
                      {advanceBusy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                      Move to next milestone
                    </button>
                  </div>
                ) : null}

                {renderRecentActivity()}
              </div>
            </div>
          ) : null}

          {milestoneMsg ? <p className="text-center text-sm text-red-700">{milestoneMsg}</p> : null}

          {!issue.userHasDonated ? (
            <div className="rounded-[14px] border border-stroke bg-white px-4 py-3 md:px-5 md:py-4">{renderRecentActivity()}</div>
          ) : null}

          {issue.userHasDonated ? (
            <div className="rounded-[14px] border border-stroke bg-white px-4 py-4 md:px-5 md:py-5">
              <h2 className="text-base font-bold text-secondary">Volunteer work proposals</h2>
              <p className="mt-1 text-xs leading-snug text-text-secondary">
                Only people who have donated to this issue can see submitted proposals. Each volunteer may submit{" "}
                <span className="font-semibold text-secondary">one</span> proposal. When the submission window ends,
                voting starts right away; open a row and use <span className="font-semibold text-secondary">View proposal</span>{" "}
                on the voting screen to see milestones.
              </p>
              {workProposals.length === 0 ? (
                <p className="mt-4 text-sm text-text-secondary">No proposals yet.</p>
              ) : (
                <ul className="mt-5 space-y-4">
                  {workProposals.map((p) => {
                    const isChosen =
                      p.status === "accepted" ||
                      (issue.winningProposalId != null && p.id === issue.winningProposalId);
                    const statusKey = String(p.status ?? "pending").toLowerCase();
                    const borderAccent =
                      statusKey === "accepted" || isChosen
                        ? "border-l-[3px] border-l-[#BEF264]"
                        : statusKey === "rejected"
                          ? "border-l-[3px] border-l-red-300"
                          : "border-l-[3px] border-l-transparent";
                    return (
                      <li
                        key={p.id}
                        className={`overflow-hidden rounded-2xl border border-stroke bg-white shadow-sm ${borderAccent}`}
                      >
                        <div className="flex gap-3 px-4 py-4 md:px-5">
                          <div
                            className={`flex size-11 shrink-0 items-center justify-center rounded-full ${
                              isChosen ? "bg-[#BEF264]/25 text-secondary" : "bg-[#ececec] text-text-secondary"
                            }`}
                          >
                            {isChosen ? (
                              <BadgeCheck className="size-5 text-secondary" aria-hidden />
                            ) : (
                              <ClipboardList className="size-5" aria-hidden />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                                  isChosen
                                    ? "bg-[#BEF264] text-black"
                                    : statusKey === "rejected"
                                      ? "bg-red-100 text-red-800"
                                      : "bg-[#ececec] text-secondary"
                                }`}
                              >
                                {isChosen ? "Accepted plan" : p.status}
                              </span>
                              <span className="text-xs text-text-secondary">{formatRelative(p.created_at)}</span>
                            </div>
                            <p className="mt-2 whitespace-pre-wrap text-sm font-medium leading-snug text-secondary">
                              {p.pitch}
                            </p>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              {volunteerApproved && isWorkMode && issue.phaseKey === "accepting_proposals" && user?.id ? (
                viewerHasProposalThisIssue ? (
                  <p className="mt-6 border-t border-stroke pt-5 text-sm font-medium text-text-secondary">
                    You already submitted your proposal for this issue. You can submit at most one per issue.
                  </p>
                ) : (
                <div className="mt-6 border-t border-stroke pt-5">
                  <h3 className="text-sm font-bold text-secondary">Submit your proposal</h3>
                  <label className="mt-3 block text-xs font-semibold text-text-secondary" htmlFor="prop-pitch">
                    Pitch
                  </label>
                  <textarea
                    id="prop-pitch"
                    value={proposalPitch}
                    onChange={(e) => setProposalPitch(e.target.value)}
                    rows={4}
                    placeholder="Short plan: how you will execute the work and why you are a fit."
                    className="mt-1 w-full rounded-[12px] border border-stroke bg-[#fafafa] px-3 py-2 text-sm text-secondary outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <p className="mt-4 text-xs font-semibold text-text-secondary">Three milestones (percents must sum to 100)</p>
                  <div className="mt-2 space-y-2">
                    {milestonesForm.map((m, idx) => (
                      <div key={idx} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <input
                          type="text"
                          value={m.title}
                          onChange={(e) => {
                            const next = [...milestonesForm];
                            next[idx] = { ...next[idx], title: e.target.value };
                            setMilestonesForm(next);
                          }}
                          className="min-w-0 flex-1 rounded-[12px] border border-stroke px-3 py-2 text-sm text-secondary"
                          placeholder={`Milestone ${idx + 1} title`}
                        />
                        <div className="flex items-center gap-2 sm:w-28">
                          <input
                            type="number"
                            min={1}
                            max={99}
                            value={m.percent}
                            onChange={(e) => {
                              const next = [...milestonesForm];
                              next[idx] = { ...next[idx], percent: e.target.value };
                              setMilestonesForm(next);
                            }}
                            className="w-full rounded-[12px] border border-stroke px-3 py-2 text-sm tabular-nums text-secondary"
                          />
                          <span className="text-xs text-text-secondary">%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  {proposalMsg ? <p className="mt-3 text-xs text-red-700">{proposalMsg}</p> : null}
                  <button
                    type="button"
                    disabled={proposalBusy}
                    onClick={() => void submitWorkProposal()}
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold text-secondary transition-transform hover:-translate-y-0.5 disabled:opacity-50"
                    style={{ backgroundColor: LIME }}
                  >
                    {proposalBusy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                    Submit proposal
                  </button>
                </div>
                )
              ) : volunteerApproved && !isWorkMode && issue.phaseKey === "accepting_proposals" && user?.id ? (
                <p className="mt-6 border-t border-stroke pt-5 text-sm leading-snug text-text-secondary">
                  You are an approved volunteer. Switch to the <span className="font-semibold text-secondary">Work / Volunteer</span>{" "}
                  tab in the header to write and send your milestone proposal for this issue.
                </p>
              ) : null}

              {showActivityInWorkProposalsCard ? renderRecentActivity() : null}
            </div>
          ) : null}

          {issue.phaseKey === "needs_initiation" && !issue.isCreator && user?.id && !issue.userHasInitiated ? (
            <button
              type="button"
              onClick={async () => {
                const res = await fetch(`${backendUrl}/api/issues/${encodeURIComponent(issue.id)}/initiate`, {
                  method: "POST",
                  headers: { "x-privy-user-id": user.id },
                });
                const j = (await res.json()) as { error?: string };
                if (!res.ok) setDonateMsg(j.error ?? "Could not support start.");
                else await refresh();
              }}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3.5 text-base font-semibold text-secondary transition-transform hover:-translate-y-0.5 active:scale-[0.99]"
              style={{ backgroundColor: LIME }}
            >
              <Plus className="size-5" />
              Support start
            </button>
          ) : null}
        </div>

        <aside className="lg:sticky lg:top-28 lg:self-start">
          <div className="space-y-3 animate-fade-slide-in md:space-y-4" style={{ animationDelay: "120ms" }}>
            {vaultAddr ? (
              <div className="rounded-[14px] border border-stroke bg-[#fafafa] p-3 md:p-4">
                <p className="text-[11px] font-semibold text-text-secondary">Project smart wallet (Base Sepolia)</p>
                <div className="mt-2 flex min-w-0 items-center gap-2">
                  <p className="min-w-0 flex-1 truncate font-mono text-[11px] text-secondary" title={vaultAddr}>
                    {vaultAddr}
                  </p>
                  <button
                    type="button"
                    onClick={() => void copyVault()}
                    className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border border-stroke bg-white px-3 py-2 text-xs font-semibold text-secondary transition-colors hover:bg-card"
                  >
                    {vaultCopied ? <Check className="size-3.5 text-emerald-600" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
                    {vaultCopied ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
            ) : null}

            <div className="rounded-[14px] border border-stroke bg-white p-4 md:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Shield className="size-5 shrink-0 text-secondary" aria-hidden />
                  <h2 className="text-base font-bold text-secondary">Funding Details</h2>
                </div>
                <p className="text-right text-sm font-semibold tabular-nums text-secondary">
                  {formatPkrFromAmount(raisedPkr, { maximumFractionDigits: 0 })} /{" "}
                  {formatPkrFromAmount(goalPkr, { maximumFractionDigits: 0 })}
                </p>
              </div>

              <div className="mt-4 h-3 w-full overflow-hidden rounded-full" style={{ backgroundColor: TRACK }}>
                <div
                  className="h-full rounded-full transition-[width] duration-700 ease-out"
                  style={{ width: `${pct}%`, backgroundColor: LIME }}
                />
              </div>

              {proposalCountdownLabel ? (
                <p className="mt-3 text-center text-xs font-semibold tabular-nums text-secondary">{proposalCountdownLabel}</p>
              ) : null}
              {votingCountdownLabel ? (
                <p className="mt-3 text-center text-xs font-semibold tabular-nums text-secondary">{votingCountdownLabel}</p>
              ) : null}

              {(issue.goalCents > 0 && issue.raisedCents >= issue.goalCents) ||
              ["accepting_proposals", "proposal_voting", "in_progress", "completed"].includes(issue.phaseKey) ? (
                <div className="mt-3 flex justify-center">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-stroke bg-[#ececec] px-3 py-1.5 text-xs font-semibold text-secondary">
                    <Check className="size-3.5 shrink-0 opacity-70" aria-hidden />
                    Donation completed
                  </span>
                </div>
              ) : null}

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-[14px] bg-[#f3f3f3] px-3 py-3 text-center">
                  <p className="text-[11px] font-medium text-text-secondary">Supporters</p>
                  <p className="mt-1 flex items-center justify-center gap-1 text-lg font-bold tabular-nums text-secondary">
                    <Users className="size-4 text-text-secondary" aria-hidden />
                    {issue.supporters}
                  </p>
                </div>
                <div className="rounded-[14px] bg-[#f3f3f3] px-3 py-3 text-center">
                  <p className="text-[11px] font-medium text-text-secondary">Still needed</p>
                  <p className="mt-1 text-lg font-bold tabular-nums text-secondary">{stillLabel}</p>
                </div>
              </div>

              {showDonate ? (
                <div className="mt-5 space-y-3">
                  <label className="block text-xs font-semibold text-text-secondary" htmlFor="donate-pkr">
                    Amount (PKR)
                  </label>
                  <input
                    id="donate-pkr"
                    ref={pkrInputRef}
                    type="text"
                    inputMode="decimal"
                    value={donatePkr}
                    onChange={(e) => setDonatePkr(e.target.value)}
                    placeholder="e.g. 5000"
                    className="w-full rounded-[14px] border border-stroke bg-[#fafafa] px-4 py-3 text-sm font-medium text-secondary outline-none transition-shadow focus:ring-2 focus:ring-primary/40"
                  />
                  <p className="text-[11px] text-text-secondary">
                    We convert PKR to USDC on Base Sepolia in the background, then send from your smart wallet to this
                    project&apos;s vault.
                  </p>
                  <button
                    type="button"
                    disabled={donateBusy}
                    onClick={() => void handleDonate()}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-[14px] py-3.5 text-base font-semibold text-secondary transition-transform hover:-translate-y-0.5 active:scale-[0.99] disabled:opacity-50"
                    style={{ backgroundColor: LIME }}
                  >
                    {donateBusy ? <Loader2 className="size-5 animate-spin" /> : null}
                    Donate
                    <Users className="size-4 opacity-80" aria-hidden />
                  </button>
                </div>
              ) : (
                <p className="mt-5 text-center text-sm text-text-secondary">
                  {issue.phaseKey === "needs_initiation"
                    ? "Fundraising opens after the community supports starting this project."
                    : issue.phaseKey === "fundraising"
                      ? "Connect a wallet to donate."
                      : "Fundraising is closed for this project — follow the phase on the left (voting, build, completion)."}
                </p>
              )}

              {donateMsg ? <p className="mt-3 text-center text-xs text-secondary">{donateMsg}</p> : null}

              <p className="mt-5 flex items-start gap-2 border-t border-stroke pt-4 text-[11px] leading-snug text-text-secondary">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                Donations are tracked on-chain on Base Sepolia for transparency. Testnet USDC only.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setChatOpen(true)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-stroke bg-[#ececec] py-3.5 text-sm font-semibold text-secondary transition-all hover:border-secondary/30 hover:bg-[#e2e2e2] active:scale-[0.99]"
            >
              <MessageCircle className="size-4 shrink-0" aria-hidden />
              <span className="text-secondary">Chat With Community</span>
            </button>
          </div>
        </aside>
      </div>

      {profilePeekId ? (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Volunteer profile"
        >
          <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border border-stroke bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-bold text-secondary">Profile</h2>
              <button
                type="button"
                onClick={() => setProfilePeekId(null)}
                className="rounded-full p-1 text-text-secondary transition-colors hover:bg-[#ececec]"
                aria-label="Close"
              >
                <X className="size-5" />
              </button>
            </div>
            {profilePeekLoading ? (
              <p className="mt-6 flex items-center gap-2 text-sm text-text-secondary">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Loading…
              </p>
            ) : profilePeek ? (
              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="text-xs font-semibold text-text-secondary">Name</dt>
                  <dd className="mt-1 font-medium text-secondary">
                    {[profileFieldStr(profilePeek.first_name), profileFieldStr(profilePeek.last_name)]
                      .filter(Boolean)
                      .join(" ") || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold text-text-secondary">City</dt>
                  <dd className="mt-1 font-medium text-secondary">{profileFieldStr(profilePeek.city) || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold text-text-secondary">Phone</dt>
                  <dd className="mt-1 font-medium text-secondary">{profileFieldStr(profilePeek.phone) || "—"}</dd>
                </div>
              </dl>
            ) : (
              <p className="mt-4 text-sm text-text-secondary">No public profile details.</p>
            )}
          </div>
        </div>
      ) : null}

      {user?.id ? (
        <IssueCommunityChat
          issueId={issue.id}
          open={chatOpen}
          onClose={() => setChatOpen(false)}
          canChat={Boolean(issue.userFollowing || issue.userHasDonated)}
          privyUserId={user.id}
        />
      ) : null}
    </div>
  );
}
