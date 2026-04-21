"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, Filter, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { usePrivy } from "@privy-io/react-auth";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { isAddress } from "viem";
import { createAppChainPublicReadClient } from "@/lib/chain";
import {
  optimisticAddressFromSmartClient,
  readSmartWalletAddressForBalance,
  resolveSmartWalletClientForReads,
  smartWalletAddressFromUserRoot,
  stablePrivyWalletLinkedJson,
} from "@/features/auth/lib/privyWallet";
import { formatUsdFromCents } from "../lib/formatUsd";
import {
  DEFAULT_PKR_PER_USD,
  fetchPkrPerUsd,
  formatPkrFromAmount,
  usdCentsToPkrAmount,
} from "@/lib/fxPkr";
import { readUsdcBalance, formatUsdcUnits } from "@/lib/usdcBaseSepolia";
import { ALL_PHASES, countByCategory, filterAndSortIssues } from "../lib/filterIssues";
import type { ApiIssueRow } from "../lib/mapApiIssue";
import { mapApiIssueRow as mapRow } from "../lib/mapApiIssue";
import type { Criticality, Issue, IssueCategory, IssuePhaseKey, SortMode } from "../types";
import { resolveBestLatLngFromQuery } from "@/lib/geo";
import { useHomeShell } from "../context/HomeShellContext";
import DashboardHero from "./DashboardHero";
import IssueCard from "./IssueCard";

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:5000";

function parseProfileNames(data: unknown): { firstName: string | null; lastName: string | null } {
  if (!data || typeof data !== "object") return { firstName: null, lastName: null };
  const row = data as Record<string, unknown>;
  const fn = typeof row.first_name === "string" ? row.first_name.trim() : "";
  const ln = typeof row.last_name === "string" ? row.last_name.trim() : "";
  return {
    firstName: fn.length > 0 ? fn : null,
    lastName: ln.length > 0 ? ln : null,
  };
}

/** Prefer saved profile coordinates for distance (matches DB); avoids wrong IP-based geolocation. */
function parseProfileCoords(data: unknown): { lat: number; lng: number } | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  const la = Number(row.latitude);
  const lo = Number(row.longitude);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
  if (la < -90 || la > 90 || lo < -180 || lo > 180) return null;
  return { lat: la, lng: lo };
}

const CATEGORY_ORDER: Array<IssueCategory | "all"> = [
  "all",
  "Infrastructure",
  "Environment",
  "Education",
  "Community",
  "Safety",
];

const SORT_LABELS: Record<SortMode, string> = {
  recent: "Most recent",
  oldest: "Oldest first",
  mostFunded: "Most funded",
  leastFunded: "Least funded",
  nearest: "Nearest to you",
  farthest: "Farthest from you",
  goalHigh: "Highest goal",
  goalLow: "Lowest goal",
  titleAsc: "Title A–Z",
  titleDesc: "Title Z–A",
  mostSupporters: "Most supporters",
};

const PHASE_FILTER_LABELS: Record<IssuePhaseKey, string> = {
  needs_initiation: "Needs initiation",
  fundraising: "Fundraising",
  accepting_proposals: "Accepting proposals",
  proposal_voting: "Proposal voting",
  in_progress: "In progress",
  completed: "Completed",
};

const SORT_ORDER: SortMode[] = [
  "recent",
  "oldest",
  "nearest",
  "farthest",
  "mostFunded",
  "leastFunded",
  "goalHigh",
  "goalLow",
  "mostSupporters",
  "titleAsc",
  "titleDesc",
];

const PAGE_SIZE = 6;

export type HomeDashboardVariant = "default" | "work";

export default function HomeDashboard({ variant = "default" }: { variant?: HomeDashboardVariant }) {
  const { ready, authenticated, user } = usePrivy();
  const { volunteerApproved } = useHomeShell();
  const { client: smartWalletClient, getClientForChain } = useSmartWallets();

  const [profileFirstName, setProfileFirstName] = useState<string | null>(null);
  const [profileLastName, setProfileLastName] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [balanceLabel, setBalanceLabel] = useState("—");
  const [balanceSubline, setBalanceSubline] = useState("");
  const [balanceLoading, setBalanceLoading] = useState(true);
  /** On-chain USDC (human, 6 decimals); null = not loaded or error. */
  const [usdcOnChain, setUsdcOnChain] = useState<number | null>(null);

  const userRef = useRef(user);
  const smartWalletClientRef = useRef(smartWalletClient);
  const getClientForChainRef = useRef(getClientForChain);
  userRef.current = user;
  smartWalletClientRef.current = smartWalletClient;
  getClientForChainRef.current = getClientForChain;

  const [rawIssueRows, setRawIssueRows] = useState<ApiIssueRow[]>([]);
  const [issuesLoading, setIssuesLoading] = useState(true);
  const [issuesError, setIssuesError] = useState<string | null>(null);
  const [viewerPos, setViewerPos] = useState<{ lat: number; lng: number } | null>(null);
  const [pkrPerUsd, setPkrPerUsd] = useState<number | null>(null);
  const [balanceTick, setBalanceTick] = useState(0);
  const [walletNotice, setWalletNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rate = await fetchPkrPerUsd();
        if (!cancelled) setPkrPerUsd(rate);
      } catch {
        if (!cancelled) setPkrPerUsd(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onRefresh = () => setBalanceTick((t) => t + 1);
    window.addEventListener("humrahi:refresh-wallet-balance", onRefresh);
    return () => window.removeEventListener("humrahi:refresh-wallet-balance", onRefresh);
  }, []);

  const refreshIssues = useCallback(async () => {
    if (!user?.id) {
      setRawIssueRows([]);
      setIssuesLoading(false);
      return;
    }
    setIssuesLoading(true);
    setIssuesError(null);
    try {
      const res = await fetch(`${backendUrl}/api/issues`, {
        headers: { "x-privy-user-id": user.id },
      });
      const json = (await res.json()) as { data?: ApiIssueRow[]; error?: string };
      if (!res.ok) {
        setIssuesError(json.error ?? "Could not load issues.");
        setRawIssueRows([]);
        return;
      }
      setRawIssueRows(json.data ?? []);
    } catch {
      setIssuesError("Could not reach the API.");
      setRawIssueRows([]);
    } finally {
      setIssuesLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!ready || !authenticated || !user?.id) {
      setRawIssueRows([]);
      setIssuesLoading(false);
      return;
    }
    void refreshIssues();
  }, [ready, authenticated, user?.id, refreshIssues]);

  const issues = useMemo(
    () => rawIssueRows.map((r) => mapRow(r, user?.id ?? null, viewerPos)),
    [rawIssueRows, user?.id, viewerPos]
  );

  const issueStats = useMemo(() => {
    const totalRaisedCents = issues.reduce((acc, i) => acc + i.raisedCents, 0);
    const activeProjects = issues.length;
    const communitySupporters = issues.reduce((acc, i) => acc + i.supporters, 0);
    const totalRaised =
      pkrPerUsd != null
        ? formatPkrFromAmount(usdCentsToPkrAmount(totalRaisedCents, pkrPerUsd))
        : formatUsdFromCents(totalRaisedCents);
    return {
      totalRaised,
      activeProjects: String(activeProjects),
      communitySupporters: String(communitySupporters),
    };
  }, [issues, pkrPerUsd]);

  const handleFollowChange = useCallback(
    async (issueId: string, nextFollowing: boolean) => {
      if (!user?.id) return;
      const path = nextFollowing ? "follow" : "unfollow";
      const res = await fetch(`${backendUrl}/api/issues/${encodeURIComponent(issueId)}/${path}`, {
        method: "POST",
        headers: { "x-privy-user-id": user.id },
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setIssuesError(json.error ?? "Follow action failed.");
        return;
      }
      await refreshIssues();
    },
    [user?.id, refreshIssues]
  );

  const handleInitiate = useCallback(
    async (issueId: string) => {
      if (!user?.id) return;
      setIssuesError(null);
      const res = await fetch(`${backendUrl}/api/issues/${encodeURIComponent(issueId)}/initiate`, {
        method: "POST",
        headers: { "x-privy-user-id": user.id },
      });
      const json = (await res.json()) as {
        error?: string;
        data?: { phase?: string; initiation_count?: number; smart_wallet_address?: string | null };
      };
      if (!res.ok) {
        setIssuesError(json.error ?? "Initiate failed.");
        return;
      }
      if (json.data) {
        const d = json.data;
        setRawIssueRows((prev) =>
          prev.map((r) =>
            r.id === issueId
              ? {
                  ...r,
                  ...(typeof d.phase === "string" ? { phase: d.phase } : {}),
                  ...(typeof d.initiation_count === "number" ? { initiation_count: d.initiation_count } : {}),
                  ...(d.smart_wallet_address !== undefined ? { smart_wallet_address: d.smart_wallet_address } : {}),
                  user_has_initiated: true,
                }
              : r
          )
        );
      }
      await refreshIssues();
    },
    [user?.id, refreshIssues]
  );

  useEffect(() => {
    if (!ready || !authenticated || !user?.id) {
      setProfileLoading(false);
      setViewerPos(null);
      return;
    }
    let cancelled = false;
    setProfileLoading(true);
    (async () => {
      try {
        const res = await fetch(`${backendUrl}/api/profiles/${encodeURIComponent(user.id)}`);
        const body = (await res.json()) as { data?: unknown; error?: string };
        if (cancelled) return;
        if (!res.ok) {
          setProfileFirstName(null);
          setProfileLastName(null);
          const ll = await resolveBestLatLngFromQuery(null);
          if (!cancelled && ll) setViewerPos({ lat: ll.latitude, lng: ll.longitude });
          return;
        }
        const names = parseProfileNames(body.data);
        setProfileFirstName(names.firstName);
        setProfileLastName(names.lastName);
        const coords = parseProfileCoords(body.data);
        if (coords) {
          setViewerPos(coords);
        } else {
          const ll = await resolveBestLatLngFromQuery(null);
          if (!cancelled && ll) setViewerPos({ lat: ll.latitude, lng: ll.longitude });
        }
      } catch {
        if (!cancelled) {
          setProfileFirstName(null);
          setProfileLastName(null);
        }
        try {
          const ll = await resolveBestLatLngFromQuery(null);
          if (!cancelled && ll) setViewerPos({ lat: ll.latitude, lng: ll.longitude });
        } catch {
          if (!cancelled) setViewerPos(null);
        }
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, authenticated, user?.id]);

  const optimisticAddr = optimisticAddressFromSmartClient(smartWalletClient) ?? "";
  const linkedJson = stablePrivyWalletLinkedJson(user);
  const recordSwLower = smartWalletAddressFromUserRoot(user).toLowerCase();
  const walletReadKey = useMemo(
    () =>
      [
        user?.id ?? "",
        (user?.wallet?.address ?? "").toLowerCase(),
        linkedJson,
        recordSwLower,
        optimisticAddr.toLowerCase(),
      ].join("|"),
    [user?.id, user?.wallet?.address, linkedJson, recordSwLower, optimisticAddr]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("coinbase_onramp") !== "1") return;
    if (!ready || !authenticated || !user?.id) return;

    const url = new URL(window.location.href);
    url.searchParams.delete("coinbase_onramp");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);

    let cancelled = false;
    const privyUserId = user.id;
    void (async () => {
      const u = userRef.current;
      const sw = await resolveSmartWalletClientForReads(
        smartWalletClientRef.current,
        (args) => getClientForChainRef.current(args)
      );
      const addr = readSmartWalletAddressForBalance(u, sw);
      if (!addr || !isAddress(addr)) {
        if (!cancelled) setWalletNotice("Smart wallet not ready; could not sync Base Sepolia USDC.");
        return;
      }

      try {
        const res = await fetch(`${backendUrl}/api/coinbase/credit-sepolia-usdc`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-privy-user-id": privyUserId,
          },
          body: JSON.stringify({ destinationAddress: addr }),
        });
        const json = (await res.json()) as {
          data?: { creditedDrips?: number; throttled?: boolean };
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setWalletNotice(json.error ?? "Could not credit Base Sepolia USDC.");
          return;
        }
        if (json.data?.throttled) {
          setWalletNotice("Automatic testnet credit skipped (try again in about 90 seconds).");
          return;
        }
        const d = json.data?.creditedDrips ?? 0;
        if (d > 0) {
          setWalletNotice(
            `Added ${d} testnet USDC on Base Sepolia (CDP v2 faucet). PKR above reflects your smart wallet balance.`
          );
          setBalanceTick((t) => t + 1);
        } else {
          setWalletNotice(
            "Returned from Coinbase, but no testnet USDC was added (faucet limit or CDP error). Check backend logs and try again in a minute."
          );
        }
      } catch {
        if (!cancelled) setWalletNotice("Could not reach the server to credit testnet USDC.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, authenticated, user?.id]);

  useEffect(() => {
    if (!ready || !authenticated || !user?.id) {
      setBalanceLoading(false);
      setBalanceLabel("—");
      setBalanceSubline("");
      setUsdcOnChain(null);
      return;
    }
    let cancelled = false;
    setBalanceLoading(true);
    setUsdcOnChain(null);
    void (async () => {
      try {
        const u = userRef.current;
        const sw = await resolveSmartWalletClientForReads(
          smartWalletClientRef.current,
          (args) => getClientForChainRef.current(args)
        );
        const addr = readSmartWalletAddressForBalance(u, sw);
        if (!addr || !isAddress(addr)) {
          if (!cancelled) {
            setBalanceLabel("—");
            setBalanceSubline("Smart wallet address not ready yet — try again in a moment.");
            setUsdcOnChain(null);
            setBalanceLoading(false);
          }
          return;
        }
        const client = createAppChainPublicReadClient();
        const usdcUnits = await readUsdcBalance(client, addr as `0x${string}`);
        if (cancelled) return;
        const usdc = Number(formatUsdcUnits(usdcUnits));
        if (!Number.isFinite(usdc)) {
          if (!cancelled) {
            setBalanceLabel("—");
            setBalanceSubline("Could not parse USDC balance.");
            setUsdcOnChain(null);
          }
          return;
        }
        const usdcStr = usdc.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
        if (!cancelled) {
          setUsdcOnChain(usdc);
          setBalanceSubline(
            `${usdcStr} USDC on Base Sepolia · smart wallet ${addr.slice(0, 6)}…${addr.slice(-4)}`
          );
        }
      } catch (e) {
        if (!cancelled) {
          setBalanceLabel("—");
          setUsdcOnChain(null);
          const hint = e instanceof Error ? e.message : String(e);
          setBalanceSubline(
            hint
              ? `Could not reach Base Sepolia RPC: ${hint.slice(0, 140)}`
              : "Could not reach Base Sepolia RPC. The app will retry via its proxy and public Base RPC."
          );
        }
      } finally {
        if (!cancelled) setBalanceLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, authenticated, user?.id, walletReadKey, balanceTick]);

  useEffect(() => {
    if (usdcOnChain == null || !Number.isFinite(usdcOnChain)) {
      return;
    }
    const applyRate = (rate: number) => {
      const pkrRaw = usdcOnChain * rate;
      const pkrRounded = Math.round(pkrRaw);
      const pkrDisplay = usdcOnChain > 0 && pkrRounded === 0 ? 1 : pkrRounded;
      const next = formatPkrFromAmount(pkrDisplay, { maximumFractionDigits: 0 });
      setBalanceLabel((prev) => (prev === next ? prev : next));
    };

    let cancelled = false;
    const immediate =
      pkrPerUsd != null && Number.isFinite(pkrPerUsd) && pkrPerUsd > 0 ? pkrPerUsd : null;
    if (immediate != null) {
      applyRate(immediate);
      return () => {
        cancelled = true;
      };
    }

    applyRate(DEFAULT_PKR_PER_USD);
    void (async () => {
      let rate: number | null = null;
      try {
        rate = await fetchPkrPerUsd();
      } catch {
        rate = DEFAULT_PKR_PER_USD;
      }
      if (rate == null || !Number.isFinite(rate) || rate <= 0) {
        rate = DEFAULT_PKR_PER_USD;
      }
      if (!cancelled) applyRate(rate);
    })();
    return () => {
      cancelled = true;
    };
  }, [usdcOnChain, pkrPerUsd]);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<IssueCategory | "all">("all");
  const [sort, setSort] = useState<SortMode>("recent");
  const [criticalities, setCriticalities] = useState<Set<Criticality>>(
    () => new Set(["low", "medium", "critical"])
  );
  const [phases, setPhases] = useState<Set<IssuePhaseKey>>(() =>
    variant === "work"
      ? new Set<IssuePhaseKey>(["accepting_proposals", "proposal_voting"])
      : new Set<IssuePhaseKey>(ALL_PHASES)
  );
  const [radiusKm, setRadiusKm] = useState(2);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [page, setPage] = useState(1);
  const filterWrapRef = useRef<HTMLDivElement>(null);
  const sortWrapRef = useRef<HTMLDivElement>(null);

  const counts = useMemo(() => countByCategory(issues), [issues]);

  useEffect(() => {
    if (!filterOpen && !sortOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (filterOpen && filterWrapRef.current && !filterWrapRef.current.contains(t)) setFilterOpen(false);
      if (sortOpen && sortWrapRef.current && !sortWrapRef.current.contains(t)) setSortOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [filterOpen, sortOpen]);

  const filterOpts = useMemo(
    () => ({
      search,
      category,
      criticalities,
      phases,
      sort,
      radiusKm,
      viewerPos,
    }),
    [search, category, criticalities, phases, sort, radiusKm, viewerPos]
  );

  const { filtered, distanceFilterRelaxed } = useMemo(() => {
    const strict = filterAndSortIssues(issues, filterOpts);
    if (strict.length > 0 || issues.length === 0) {
      return { filtered: strict, distanceFilterRelaxed: false };
    }
    const relaxed = filterAndSortIssues(issues, { ...filterOpts, radiusKm: 1_000_000 });
    if (relaxed.length > 0) {
      return { filtered: relaxed, distanceFilterRelaxed: true };
    }
    return { filtered: strict, distanceFilterRelaxed: false };
  }, [issues, filterOpts]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);

  const safePage = Math.min(page, totalPages);
  const pageSlice = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, safePage]);

  const toggleCriticality = (c: Criticality) => {
    setCriticalities((prev) => {
      const next = new Set(prev);
      if (next.has(c)) {
        if (next.size <= 1) return prev;
        next.delete(c);
      } else {
        next.add(c);
      }
      return next;
    });
    setPage(1);
  };

  const togglePhase = (p: IssuePhaseKey) => {
    setPhases((prev) => {
      const next = new Set(prev);
      if (next.has(p)) {
        if (next.size <= 1) return prev;
        next.delete(p);
      } else {
        next.add(p);
      }
      return next;
    });
    setPage(1);
  };

  const setCategoryAndReset = (c: IssueCategory | "all") => {
    setCategory(c);
    setPage(1);
  };

  const setSearchAndReset = (v: string) => {
    setSearch(v);
    setPage(1);
  };

  const setSortAndReset = (v: SortMode) => {
    setSort(v);
    setPage(1);
  };

  const setRadiusKmAndReset = (v: number) => {
    setRadiusKm(v);
    setPage(1);
  };

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-10 overflow-x-hidden px-5 pb-20 pt-8 md:px-10">
      <DashboardHero
        firstName={profileFirstName}
        lastName={profileLastName}
        profileLoading={profileLoading}
        stats={{
          totalRaised: issueStats.totalRaised,
          activeProjects: issueStats.activeProjects,
          communitySupporters: issueStats.communitySupporters,
          balance: balanceLabel,
          balanceLoading: balanceLoading,
          balanceSubline,
        }}
        trailing={
          variant === "work" && volunteerApproved ? (
            <Link
              href="/home/work/my-proposals"
              className="inline-flex w-full items-center justify-center rounded-full border border-stroke bg-[#B1FF67] px-4 py-2.5 text-sm font-semibold text-secondary shadow-sm transition-transform hover:-translate-y-0.5 sm:w-auto"
            >
              View your accepted proposals
            </Link>
          ) : undefined
        }
      />

      {walletNotice && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">{walletNotice}</p>
      )}

      {variant === "work" ? (
        <div className="rounded-xl border border-stroke bg-card px-4 py-4 text-sm text-secondary md:px-5">
          <p className="font-semibold text-secondary">Volunteer work board</p>
          <p className="mt-1.5 leading-relaxed text-text-secondary">
            These listings are in the <span className="font-semibold text-secondary">accepting proposals</span> phase
            (a short window after a project meets its fundraising goal). Filters and cards match the home dashboard; the
            distance slider defaults to 2 km like home.
          </p>
          {!volunteerApproved ? (
            <p className="mt-3 text-xs text-text-secondary">
              Become an approved volunteer to submit milestone-based work proposals on each issue page.{" "}
              <a href="/home/volunteer" className="font-semibold text-secondary underline underline-offset-2">
                Apply here
              </a>
              .
            </p>
          ) : null}
        </div>
      ) : null}

      {issuesError && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{issuesError}</p>
      )}

      {distanceFilterRelaxed && filtered.length > 0 ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          No projects within {radiusKm} km with your current filters. Showing farther projects that still match
          search, category, criticality, and phase.
        </p>
      ) : null}

      <section className="space-y-5">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-text-secondary" aria-hidden />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearchAndReset(e.target.value)}
              placeholder="Search projects or locations..."
              className="w-full rounded-[12px] border border-stroke bg-white py-3.5 pl-12 pr-4 text-sm text-secondary outline-none transition-shadow duration-200 placeholder:text-text-secondary focus:border-secondary/30 focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div className="flex min-w-0 shrink-0 items-center justify-end gap-2 sm:justify-start">
            <div className="relative" ref={filterWrapRef}>
              <button
                type="button"
                onClick={() => {
                  setSortOpen(false);
                  setFilterOpen((v) => !v);
                }}
                className={`flex size-11 items-center justify-center rounded-[12px] border transition-all duration-200 ${
                  filterOpen ? "border-secondary bg-card" : "border-stroke bg-white hover:border-secondary/30"
                }`}
                aria-expanded={filterOpen}
                aria-label="Filters: criticality, distance, phase"
              >
                <Filter className="size-5 text-secondary" />
              </button>
              <div
                className={`absolute right-0 z-40 mt-2 w-[min(calc(100vw-2rem),280px)] origin-top-right rounded-[14px] border border-stroke bg-white shadow-xl transition-all duration-200 ease-out md:left-0 md:right-auto ${
                  filterOpen
                    ? "pointer-events-auto max-h-[min(80vh,520px)] scale-100 overflow-y-auto p-3 opacity-100"
                    : "pointer-events-none max-h-0 overflow-hidden border-0 p-0 opacity-0 shadow-none"
                }`}
              >
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Distance</p>
                    <p className="mt-1 text-[11px] leading-snug text-text-secondary">
                      Starts at 2 km. Slide up to 5 km to include farther projects. If nothing matches, distance widens
                      once automatically.
                    </p>
                    <div className="mt-2 flex items-center gap-3">
                      <input
                        type="range"
                        min={2}
                        max={5}
                        step={0.5}
                        value={radiusKm}
                        onChange={(e) => setRadiusKmAndReset(Number(e.target.value))}
                        className="min-w-0 flex-1 accent-secondary"
                        aria-label="Maximum distance in kilometers"
                      />
                      <span className="w-14 shrink-0 text-right text-sm font-semibold tabular-nums text-secondary">
                        {radiusKm} km
                      </span>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Criticality</p>
                    <ul className="mt-2 space-y-2">
                      {(
                        [
                          ["low", "Low critical"],
                          ["medium", "Medium"],
                          ["critical", "Critical"],
                        ] as const
                      ).map(([key, label]) => (
                        <li key={key}>
                          <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-card">
                            <input
                              type="checkbox"
                              checked={criticalities.has(key)}
                              onChange={() => toggleCriticality(key)}
                              className="size-4 rounded border-stroke accent-secondary"
                            />
                            <span className="text-secondary">{label}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Phase</p>
                    <ul className="mt-2 space-y-2">
                      {ALL_PHASES.map((key) => (
                        <li key={key}>
                          <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-card">
                            <input
                              type="checkbox"
                              checked={phases.has(key)}
                              onChange={() => togglePhase(key)}
                              className="size-4 rounded border-stroke accent-secondary"
                            />
                            <span className="text-secondary">{PHASE_FILTER_LABELS[key]}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            <div className="relative min-w-0 max-w-[min(100%,200px)] shrink-0" ref={sortWrapRef}>
              <button
                type="button"
                onClick={() => {
                  setFilterOpen(false);
                  setSortOpen((v) => !v);
                }}
                className={`flex h-11 w-full max-w-full min-w-[11rem] items-center justify-between gap-2 rounded-[12px] border px-3 text-left text-sm font-medium transition-all duration-200 ${
                  sortOpen ? "border-secondary bg-card text-secondary" : "border-stroke bg-white text-secondary hover:border-secondary/30"
                }`}
                aria-expanded={sortOpen}
                aria-haspopup="listbox"
                aria-label="Sort projects"
              >
                <span className="min-w-0 truncate">{SORT_LABELS[sort]}</span>
                <ChevronDown className="size-4 shrink-0 text-text-secondary" aria-hidden />
              </button>
              <div
                className={`absolute right-0 z-40 mt-2 w-[min(calc(100vw-2rem),280px)] rounded-[14px] border border-stroke bg-white shadow-xl transition-all duration-200 ease-out sm:left-0 sm:right-auto ${
                  sortOpen
                    ? "pointer-events-auto max-h-[min(70vh,420px)] scale-100 overflow-y-auto py-1 opacity-100"
                    : "pointer-events-none max-h-0 overflow-hidden border-0 py-0 opacity-0 shadow-none"
                }`}
                role="listbox"
                aria-label="Sort options"
              >
                {SORT_ORDER.map((k) => {
                  const active = sort === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => {
                        setSortAndReset(k);
                        setSortOpen(false);
                      }}
                      className={`flex w-full items-center px-3 py-2.5 text-left text-sm transition-colors hover:bg-card ${
                        active ? "bg-card font-semibold text-secondary" : "text-secondary"
                      }`}
                    >
                      {SORT_LABELS[k]}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {CATEGORY_ORDER.map((cat) => {
            const count = cat === "all" ? issues.length : counts[cat];
            const label = cat === "all" ? `All (${count})` : `${cat} (${count})`;
            const active = category === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryAndReset(cat)}
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition-all duration-200 ${
                  active
                    ? "border-secondary bg-secondary text-primary"
                    : "border-stroke bg-white text-secondary hover:border-secondary/40"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </section>

      {issuesLoading ? (
        <p className="py-12 text-center text-sm text-text-secondary">Loading issues…</p>
      ) : filtered.length === 0 ? (
        <p className="rounded-[16px] border border-dashed border-stroke bg-card/50 py-16 text-center text-sm text-text-secondary">
          {issues.length === 0
            ? "No issues yet. Use Report Issue to add the first one."
            : "No projects match your search, category, criticality, or phase filters. Try adjusting the filter panel."}
        </p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {pageSlice.map((issue, idx) => (
            <div
              key={issue.id}
              className="animate-fade-slide-in"
              style={{ animationDelay: `${idx * 70}ms` }}
            >
              <IssueCard
                issue={issue}
                viewerPrivyId={user?.id ?? ""}
                pkrPerUsd={pkrPerUsd}
                onFollowChange={handleFollowChange}
                onInitiate={handleInitiate}
              />
            </div>
          ))}
        </div>
      )}

      {filtered.length > 0 && totalPages > 1 && (
        <nav
          className="flex items-center justify-center gap-2 pt-4"
          aria-label="Pagination"
        >
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage <= 1}
            className="flex size-10 items-center justify-center rounded-full border border-stroke text-secondary transition-all duration-200 hover:bg-card disabled:opacity-40"
            aria-label="Previous page"
          >
            <ChevronLeft className="size-5" />
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setPage(n)}
              className={`flex size-10 items-center justify-center rounded-full text-sm font-semibold transition-all duration-200 ${
                n === safePage ? "bg-secondary text-primary" : "border border-stroke text-secondary hover:bg-card"
              }`}
            >
              {n}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage >= totalPages}
            className="flex size-10 items-center justify-center rounded-full border border-stroke text-secondary transition-all duration-200 hover:bg-card disabled:opacity-40"
            aria-label="Next page"
          >
            <ChevronRight className="size-5" />
          </button>
        </nav>
      )}
    </div>
  );
}
