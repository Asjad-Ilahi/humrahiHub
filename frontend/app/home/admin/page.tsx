"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { ArrowLeft, Loader2, ShieldCheck } from "lucide-react";

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:5000";

type VolunteerApp = {
  id: string;
  privy_user_id: string;
  skills: string;
  role_description: string;
  phone: string | null;
  availability_notes: string | null;
  status: string;
  created_at: string;
  id_document_public_url?: string | null;
};

type WorkProposal = {
  id: string;
  issue_id: string;
  proposer_privy_user_id: string;
  pitch: string;
  milestones: { title: string; percent: number }[];
  status: string;
  created_at: string;
};

export default function AdminReviewPage() {
  const router = useRouter();
  const { ready, authenticated } = usePrivy();
  const [token, setToken] = useState("");
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [tokenLoading, setTokenLoading] = useState(true);
  const [volunteers, setVolunteers] = useState<VolunteerApp[]>([]);
  const [proposals, setProposals] = useState<WorkProposal[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && !authenticated) router.replace("/login");
  }, [ready, authenticated, router]);

  useEffect(() => {
    let cancelled = false;
    setTokenLoading(true);
    setTokenError(null);
    void (async () => {
      try {
        const res = await fetch("/api/admin/review-token", { cache: "no-store" });
        const json = (await res.json()) as { token?: string; error?: string };
        if (cancelled) return;
        if (!res.ok) {
          setToken("");
          setTokenError(json.error ?? "Could not load admin session.");
          return;
        }
        const t = String(json.token ?? "").trim();
        if (!t) {
          setToken("");
          setTokenError("Server returned an empty token.");
          return;
        }
        setToken(t);
      } catch {
        if (!cancelled) {
          setToken("");
          setTokenError("Could not reach the Next.js server to load the admin token.");
        }
      } finally {
        if (!cancelled) setTokenLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    const hdr = token.trim();
    if (!hdr) {
      setError(tokenError ?? "Admin token is not available yet.");
      return;
    }
    setListLoading(true);
    setError(null);
    try {
      const h = { "x-admin-token": hdr };
      const [vRes, pRes] = await Promise.all([
        fetch(`${backendUrl}/api/admin/volunteer-applications`, { headers: h }),
        fetch(`${backendUrl}/api/admin/work-proposals`, { headers: h }),
      ]);
      const vJson = (await vRes.json()) as { data?: VolunteerApp[]; error?: string };
      const pJson = (await pRes.json()) as { data?: WorkProposal[]; error?: string };
      if (!vRes.ok) setError(vJson.error ?? "Could not load volunteer applications.");
      else if (!pRes.ok) setError(pJson.error ?? "Could not load work proposals.");
      else {
        setVolunteers(vJson.data ?? []);
        setProposals(pJson.data ?? []);
      }
    } catch {
      setError("Could not reach the backend.");
    } finally {
      setListLoading(false);
    }
  }, [token, tokenError]);

  useEffect(() => {
    if (!ready || !authenticated) return;
    if (!token.trim() || tokenLoading) return;
    void refresh();
  }, [ready, authenticated, token, tokenLoading, refresh]);

  if (!ready || !authenticated) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-text-secondary">
        {ready ? "Redirecting…" : "Loading…"}
      </div>
    );
  }

  const reviewVolunteer = async (id: string, status: "approved" | "rejected") => {
    const hdr = token.trim();
    if (!hdr) return;
    const res = await fetch(`${backendUrl}/api/admin/volunteer-applications/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-token": hdr },
      body: JSON.stringify({ status }),
    });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) setError(json.error ?? "Update failed.");
    else void refresh();
  };

  const reviewProposal = async (id: string, status: "accepted" | "rejected") => {
    const hdr = token.trim();
    if (!hdr) return;
    const res = await fetch(`${backendUrl}/api/admin/work-proposals/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-token": hdr },
      body: JSON.stringify({ status }),
    });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) setError(json.error ?? "Update failed.");
    else void refresh();
  };

  return (
    <div className="mx-auto w-full max-w-[960px] space-y-6 px-5 pb-24 pt-6 md:px-10">
      <Link
        href="/home"
        className="inline-flex items-center gap-2 text-sm font-semibold text-secondary transition-colors hover:text-text-secondary"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back to home
      </Link>

      <header>
        <h1 className="text-2xl font-bold tracking-tight text-secondary md:text-3xl">Admin review</h1>
        <p className="mt-2 text-sm leading-relaxed text-text-secondary">
          Approve volunteer applications and work proposals. Your session token is loaded automatically from the app
          server (same <code className="rounded bg-card px-1 py-0.5 text-xs">ADMIN_REVIEW_TOKEN</code> in{" "}
          <code className="rounded bg-card px-1 py-0.5 text-xs">frontend/.env.local</code> as on the backend).
        </p>
      </header>

      <div className="flex flex-col gap-3 rounded-xl border border-stroke bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-card text-secondary">
            <ShieldCheck className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-secondary">Admin session</p>
            {tokenLoading ? (
              <p className="mt-1 flex items-center gap-2 text-xs text-text-secondary">
                <Loader2 className="size-3.5 animate-spin shrink-0" aria-hidden />
                Loading token from server…
              </p>
            ) : tokenError ? (
              <p className="mt-1 text-xs leading-snug text-red-700">{tokenError}</p>
            ) : (
              <p className="mt-1 text-xs text-emerald-800">Connected — lists load automatically.</p>
            )}
          </div>
        </div>
        <button
          type="button"
          disabled={!token.trim() || listLoading}
          onClick={() => void refresh()}
          className="shrink-0 rounded-lg bg-secondary px-4 py-2.5 text-sm font-bold text-primary disabled:opacity-50"
        >
          {listLoading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-secondary">Volunteer applications</h2>
        {listLoading && volunteers.length === 0 && proposals.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-text-secondary">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Loading…
          </p>
        ) : volunteers.length === 0 ? (
          <p className="text-sm text-text-secondary">No applications yet.</p>
        ) : (
          <ul className="space-y-3">
            {volunteers.map((v) => (
              <li key={v.id} className="rounded-xl border border-stroke bg-card p-4 text-sm">
                <p className="font-semibold text-secondary">
                  {v.status} · {v.privy_user_id.slice(0, 10)}…
                </p>
                <p className="mt-1 text-text-secondary">
                  <span className="font-medium text-secondary">Skills:</span> {v.skills}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-secondary">{v.role_description}</p>
                {v.id_document_public_url ? (
                  <a
                    href={v.id_document_public_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block text-xs font-semibold text-secondary underline"
                  >
                    View ID document
                  </a>
                ) : null}
                {v.status === "pending" ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void reviewVolunteer(v.id, "approved")}
                      className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => void reviewVolunteer(v.id, "rejected")}
                      className="rounded-lg border border-stroke px-3 py-1.5 text-xs font-semibold text-secondary"
                    >
                      Reject
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-secondary">Work proposals</h2>
        {listLoading && volunteers.length === 0 && proposals.length === 0 ? null : proposals.length === 0 ? (
          <p className="text-sm text-text-secondary">No proposals yet.</p>
        ) : (
          <ul className="space-y-3">
            {proposals.map((p) => (
              <li key={p.id} className="rounded-xl border border-stroke bg-white p-4 text-sm">
                <p className="font-semibold text-secondary">
                  {p.status} · issue {p.issue_id.slice(0, 8)}…
                </p>
                <p className="mt-2 whitespace-pre-wrap text-secondary">{p.pitch}</p>
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-text-secondary">
                  {(p.milestones ?? []).map((m, i) => (
                    <li key={i}>
                      {m.title} — {m.percent}%
                    </li>
                  ))}
                </ol>
                {p.status === "pending" ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void reviewProposal(p.id, "accepted")}
                      className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white"
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      onClick={() => void reviewProposal(p.id, "rejected")}
                      className="rounded-lg border border-stroke px-3 py-1.5 text-xs font-semibold text-secondary"
                    >
                      Reject
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
