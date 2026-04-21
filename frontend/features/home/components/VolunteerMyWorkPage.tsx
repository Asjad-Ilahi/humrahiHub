"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { Briefcase, ChevronLeft, ClipboardList, FolderArchive, Loader2, Sparkles } from "lucide-react";

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:5000";
const LIME = "#BEF264";

type AssignedRow = {
  issue_id: string;
  title: string;
  phase: string;
  image_public_url: string | null;
  exec_payouts_completed: number;
  fund_raised_cents: number;
  donation_target_cents: number;
};

type ProposalRow = {
  proposal_id: string;
  issue_id: string;
  status: string;
  created_at: string;
  pitch: string;
  issue_title: string | null;
  issue_phase: string | null;
  issue_image_public_url: string | null;
  is_assigned_worker: boolean;
};

function normPhase(phase: string | null | undefined): string {
  return String(phase ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function phaseLabel(phase: string): string {
  const p = normPhase(phase);
  const map: Record<string, string> = {
    needs_initiation: "Needs initiation",
    fundraising: "Fundraising",
    accepting_proposals: "Accepting proposals",
    proposal_voting: "Proposal voting",
    in_progress: "In progress",
    completed: "Completed",
  };
  return map[p] ?? phase;
}

type WorkTabId = "active" | "underway" | "archive";

export default function VolunteerMyWorkPage() {
  const { user, ready, authenticated } = usePrivy();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [assigned, setAssigned] = useState<AssignedRow[]>([]);
  const [proposals, setProposals] = useState<ProposalRow[]>([]);
  const [tab, setTab] = useState<WorkTabId>("active");

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`${backendUrl}/api/volunteers/my-work`, {
        headers: { "x-privy-user-id": user.id },
      });
      const j = (await res.json()) as {
        data?: { assigned?: AssignedRow[]; proposals?: ProposalRow[] };
        error?: string;
      };
      if (!res.ok) {
        setErr(j.error ?? "Could not load your work.");
        setAssigned([]);
        setProposals([]);
        return;
      }
      setAssigned(j.data?.assigned ?? []);
      setProposals(j.data?.proposals ?? []);
    } catch {
      setErr("Network error.");
      setAssigned([]);
      setProposals([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!ready || !authenticated || !user?.id) return;
    void load();
  }, [ready, authenticated, user?.id, load]);

  const { activeAssigned, doneAssigned, proposalUnderway, proposalOther } = useMemo(() => {
      const byIssue = new Map(assigned.map((a) => [a.issue_id, a]));
      const supplemental: AssignedRow[] = [];
      for (const p of proposals) {
        if (!p.is_assigned_worker) continue;
        const ph = normPhase(p.issue_phase);
        if (ph !== "in_progress" && ph !== "completed") continue;
        if (byIssue.has(p.issue_id)) continue;
        supplemental.push({
          issue_id: p.issue_id,
          title: p.issue_title ?? "Issue",
          phase: ph === "completed" ? "completed" : "in_progress",
          image_public_url: p.issue_image_public_url,
          exec_payouts_completed: 0,
          fund_raised_cents: 0,
          donation_target_cents: 0,
        });
        byIssue.set(p.issue_id, supplemental[supplemental.length - 1]);
      }
      const merged = [...assigned];
      for (const s of supplemental) {
        if (!merged.some((a) => a.issue_id === s.issue_id)) merged.push(s);
      }

      const ids = new Set(merged.map((a) => a.issue_id));

      const active = merged.filter((a) => normPhase(a.phase) === "in_progress");
      const done = merged.filter((a) => normPhase(a.phase) === "completed");

      const underway = proposals.filter(
        (p) =>
          !p.is_assigned_worker &&
          !ids.has(p.issue_id) &&
          p.issue_phase &&
          ["accepting_proposals", "proposal_voting"].includes(normPhase(String(p.issue_phase)))
      );

      /** Lost / historical proposals — never the winning row for an issue you are executing. */
      const other = proposals.filter((p) => {
        if (underway.includes(p)) return false;
        if (ids.has(p.issue_id) && p.is_assigned_worker) return false;
        if (p.is_assigned_worker && ["in_progress", "completed"].includes(normPhase(p.issue_phase))) return false;
        return true;
      });

      return {
        activeAssigned: active,
        doneAssigned: done,
        proposalUnderway: underway,
        proposalOther: other,
      };
    }, [assigned, proposals]);

  const tabCounts = useMemo(
    () => ({
      active: activeAssigned.length,
      underway: proposalUnderway.length,
      archive: doneAssigned.length + proposalOther.length,
    }),
    [activeAssigned.length, proposalUnderway.length, doneAssigned.length, proposalOther.length]
  );

  if (!ready) {
    return <div className="px-6 py-20 text-center text-sm text-text-secondary">Loading…</div>;
  }

  if (!authenticated) {
    return <div className="px-6 py-20 text-center text-sm text-text-secondary">Sign in to view your proposals.</div>;
  }

  const tabs: { id: WorkTabId; label: string; hint: string; icon: typeof Sparkles }[] = [
    { id: "active", label: "Active execution", hint: "Selected after voting — milestones & proof", icon: Sparkles },
    { id: "underway", label: "Proposals underway", hint: "In review or community vote", icon: ClipboardList },
    { id: "archive", label: "Completed & other", hint: "Done work & older records", icon: FolderArchive },
  ];

  return (
    <main className="min-h-screen bg-[#f4f4f5] px-4 pb-28 pt-6 sm:px-6 md:px-10">
      <div className="mx-auto max-w-[980px]">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link
              href="/home/work"
              className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3.5 py-2 text-sm font-semibold text-secondary shadow-sm transition-colors hover:border-neutral-300 hover:bg-neutral-50"
            >
              <ChevronLeft className="size-4" aria-hidden />
              Work board
            </Link>
            <h1 className="mt-5 text-2xl font-extrabold tracking-tight text-secondary md:text-3xl">
              Your proposals &amp; assignments
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-text-secondary">
              Track issues where you are the assigned volunteer, plans still in voting, and your history.
            </p>
          </div>
          <div className="hidden shrink-0 rounded-2xl border border-stroke bg-white p-4 shadow-sm sm:block">
            <Briefcase className="size-10 text-secondary opacity-80" style={{ color: LIME }} aria-hidden />
          </div>
        </div>

        {loading ? (
          <p className="flex items-center gap-2 rounded-xl border border-stroke bg-white px-4 py-4 text-sm text-text-secondary shadow-sm">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Loading your work…
          </p>
        ) : null}
        {err ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-sm">{err}</p>
        ) : null}

        <div className="overflow-hidden rounded-2xl border border-stroke bg-white shadow-md">
          <div
            className="flex gap-1 overflow-x-auto border-b border-stroke bg-[#fafafa] p-1.5 sm:p-2"
            role="tablist"
            aria-label="Work sections"
          >
            {tabs.map((t) => {
              const Icon = t.icon;
              const selected = tab === t.id;
              const count = tabCounts[t.id];
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setTab(t.id)}
                  className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-2 py-3 text-center transition-all sm:flex-row sm:justify-center sm:gap-2 sm:px-4 ${
                    selected
                      ? "bg-secondary text-white shadow-md"
                      : "text-secondary hover:bg-white/80"
                  }`}
                >
                  <Icon className={`size-4 shrink-0 sm:size-5 ${selected ? "opacity-95" : "opacity-60"}`} aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-[11px] font-bold leading-tight sm:text-sm">{t.label}</span>
                    <span
                      className={`mt-0.5 hidden text-[10px] font-medium sm:block ${selected ? "text-white/80" : "text-text-secondary"}`}
                    >
                      {t.hint}
                    </span>
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums ${
                      selected ? "bg-white/20 text-white" : "bg-[#ececec] text-secondary"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="p-5 md:p-8" role="tabpanel">
            {tab === "active" ? (
              <div className="space-y-4">
                <p className="text-sm leading-relaxed text-text-secondary">
                  Open an issue to upload milestone photos. Payouts follow the accepted plan after each review window.
                </p>
                {activeAssigned.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-stroke bg-[#fafafa] px-6 py-14 text-center">
                    <Sparkles className="mx-auto size-10 text-text-secondary/40" aria-hidden />
                    <p className="mt-3 text-sm font-semibold text-secondary">Nothing in active execution</p>
                    <p className="mt-1 text-xs text-text-secondary">When you win a vote, the issue will appear here.</p>
                  </div>
                ) : (
                  <ul className="grid gap-4 sm:grid-cols-2">
                    {activeAssigned.map((a) => (
                      <li key={a.issue_id}>
                        <Link
                          href={`/home/issue/${encodeURIComponent(a.issue_id)}`}
                          className="group flex gap-4 rounded-2xl border border-stroke bg-white p-4 shadow-sm transition-all hover:border-neutral-300 hover:shadow-md"
                        >
                          <div className="relative size-[5.5rem] shrink-0 overflow-hidden rounded-xl bg-neutral-100 ring-1 ring-black/5">
                            {a.image_public_url ? (
                              <Image
                                src={a.image_public_url}
                                alt=""
                                fill
                                className="object-cover transition-transform group-hover:scale-[1.03]"
                                sizes="88px"
                                unoptimized={a.image_public_url.includes("supabase.co")}
                              />
                            ) : (
                              <span className="flex h-full items-center justify-center text-[10px] text-text-secondary">
                                No image
                              </span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-bold leading-snug text-secondary line-clamp-2">{a.title}</p>
                            <span
                              className="mt-2 inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                              style={{ backgroundColor: `${LIME}33`, color: "#111" }}
                            >
                              {phaseLabel(a.phase)}
                            </span>
                            <p className="mt-2 text-xs text-text-secondary">
                              Tranches paid: <span className="font-semibold text-secondary">{a.exec_payouts_completed}</span> / 3
                            </p>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}

            {tab === "underway" ? (
              <div className="space-y-4">
                <p className="text-sm leading-relaxed text-text-secondary">
                  Submitted plans still in the proposal or voting window on issues where you are not yet assigned.
                </p>
                {proposalUnderway.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-stroke bg-[#fafafa] px-6 py-14 text-center">
                    <ClipboardList className="mx-auto size-10 text-text-secondary/40" aria-hidden />
                    <p className="mt-3 text-sm font-semibold text-secondary">No proposals underway</p>
                    <p className="mt-1 text-xs text-text-secondary">Submit from the issue page when the window opens.</p>
                  </div>
                ) : (
                  <ul className="grid gap-4 sm:grid-cols-2">
                    {proposalUnderway.map((p) => (
                      <li key={p.proposal_id}>
                        <Link
                          href={`/home/issue/${encodeURIComponent(p.issue_id)}`}
                          className="group block rounded-2xl border border-stroke bg-white p-4 shadow-sm transition-all hover:border-neutral-300 hover:shadow-md"
                        >
                          <div className="flex gap-3">
                            <div className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-neutral-100 ring-1 ring-black/5">
                              {p.issue_image_public_url ? (
                                <Image
                                  src={p.issue_image_public_url}
                                  alt=""
                                  fill
                                  className="object-cover transition-transform group-hover:scale-[1.03]"
                                  sizes="80px"
                                  unoptimized={p.issue_image_public_url.includes("supabase.co")}
                                />
                              ) : null}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-bold leading-snug text-secondary line-clamp-2">{p.issue_title ?? "Issue"}</p>
                              <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
                                {p.status} · {p.issue_phase ? phaseLabel(String(p.issue_phase)) : "—"}
                              </p>
                            </div>
                          </div>
                          <p className="mt-3 line-clamp-3 border-t border-stroke/80 pt-3 text-sm leading-snug text-secondary">
                            {p.pitch}
                          </p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}

            {tab === "archive" ? (
              <div className="space-y-6">
                <p className="text-sm leading-relaxed text-text-secondary">
                  Finished projects you executed, plus older or rejected proposal records.
                </p>
                {doneAssigned.length === 0 && proposalOther.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-stroke bg-[#fafafa] px-6 py-14 text-center">
                    <FolderArchive className="mx-auto size-10 text-text-secondary/40" aria-hidden />
                    <p className="mt-3 text-sm font-semibold text-secondary">Archive is empty</p>
                    <p className="mt-1 text-xs text-text-secondary">Completed assignments and past proposals show here.</p>
                  </div>
                ) : (
                  <div className="space-y-8">
                    {doneAssigned.length > 0 ? (
                      <div>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-text-secondary">Completed assignments</h3>
                        <ul className="mt-3 grid gap-4 sm:grid-cols-2">
                          {doneAssigned.map((a) => (
                            <li key={`done-${a.issue_id}`}>
                              <Link
                                href={`/home/issue/${encodeURIComponent(a.issue_id)}`}
                                className="flex gap-4 rounded-2xl border border-stroke bg-[#fafafa] p-4 opacity-95 shadow-sm transition-all hover:border-neutral-300 hover:shadow-md"
                              >
                                <div className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-neutral-200/80">
                                  {a.image_public_url ? (
                                    <Image
                                      src={a.image_public_url}
                                      alt=""
                                      fill
                                      className="object-cover"
                                      sizes="80px"
                                      unoptimized={a.image_public_url.includes("supabase.co")}
                                    />
                                  ) : null}
                                </div>
                                <div className="min-w-0">
                                  <p className="font-bold leading-snug text-secondary line-clamp-2">{a.title}</p>
                                  <p className="mt-2 text-xs font-bold text-emerald-800">Completed</p>
                                </div>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {proposalOther.length > 0 ? (
                      <div>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-text-secondary">Other proposals</h3>
                        <ul className="mt-3 grid gap-4 sm:grid-cols-2">
                          {proposalOther.map((p) => (
                            <li key={`o-${p.proposal_id}`}>
                              <Link
                                href={`/home/issue/${encodeURIComponent(p.issue_id)}`}
                                className="block rounded-2xl border border-stroke bg-[#fafafa] p-4 shadow-sm transition-all hover:border-neutral-300 hover:shadow-md"
                              >
                                <p className="font-bold text-secondary">{p.issue_title ?? "Issue"}</p>
                                <p className="mt-1.5 text-xs font-medium text-text-secondary">
                                  {p.status}
                                  {p.issue_phase ? ` · ${phaseLabel(String(p.issue_phase))}` : ""}
                                </p>
                                <p className="mt-2 line-clamp-2 text-sm text-secondary">{p.pitch}</p>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}
