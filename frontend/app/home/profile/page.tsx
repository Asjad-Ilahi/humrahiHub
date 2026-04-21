"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { ArrowLeft, Heart, Loader2, Megaphone } from "lucide-react";

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:5000";

type IssueActivityItem = {
  id: string;
  title: string;
  phase: string;
  category: string;
  image_public_url: string | null;
  location: string;
  created_at: string;
};

function formatDisplayName(row: Record<string, unknown> | null): string {
  if (!row) return "—";
  const fn = typeof row.first_name === "string" ? row.first_name.trim() : "";
  const ln = typeof row.last_name === "string" ? row.last_name.trim() : "";
  const combined = [fn, ln].filter((s) => s.length > 0).join(" ").trim();
  if (combined.length > 0) return combined;
  const em = typeof row.email === "string" ? row.email.trim() : "";
  return em.length > 0 ? em : "—";
}

function formatAddressLine(row: Record<string, unknown>): string {
  const sn = typeof row.street_number === "string" ? row.street_number.trim() : "";
  const st = typeof row.street === "string" ? row.street.trim() : "";
  const city = typeof row.city === "string" ? row.city.trim() : "";
  const pc = typeof row.postal_code === "string" ? row.postal_code.trim() : "";
  const country = typeof row.country === "string" ? row.country.trim() : "";
  const streetLine = [sn, st].filter((s) => s.length > 0).join(" ").trim();
  const tail = [city, pc, country].filter((s) => s.length > 0).join(" ").trim();
  if (streetLine && tail) return `${streetLine}, ${tail}`;
  if (streetLine) return streetLine;
  if (tail) return tail;
  return "—";
}

function ActivityIssueCard({ it }: { it: IssueActivityItem }) {
  return (
    <Link
      href={`/home/issue/${encodeURIComponent(it.id)}`}
      className="flex gap-4 rounded-2xl border border-stroke/90 bg-[#fafafa] p-4 transition-all hover:border-neutral-300 hover:bg-white hover:shadow-sm"
    >
      <div className="relative size-[4.5rem] shrink-0 overflow-hidden rounded-xl bg-neutral-200/80 ring-1 ring-black/5">
        {it.image_public_url ? (
          <Image
            src={it.image_public_url}
            alt=""
            fill
            className="object-cover"
            sizes="72px"
            unoptimized={it.image_public_url.includes("supabase.co")}
          />
        ) : (
          <span className="flex h-full items-center justify-center text-[10px] text-text-secondary">No image</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-bold leading-snug text-secondary line-clamp-2">{it.title}</p>
        <p className="mt-1.5 text-xs font-medium text-text-secondary">
          {it.category} · {phaseLabel(it.phase)}
        </p>
        {it.location ? <p className="mt-1 line-clamp-1 text-xs text-text-secondary">{it.location}</p> : null}
      </div>
    </Link>
  );
}

function phaseLabel(phase: string): string {
  const p = phase.toLowerCase().replace(/\s+/g, "_");
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

export default function ProfilePage() {
  const router = useRouter();
  const { ready, authenticated, user } = usePrivy();
  const [loading, setLoading] = useState(true);
  const [row, setRow] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activityLoading, setActivityLoading] = useState(true);
  const [followed, setFollowed] = useState<IssueActivityItem[]>([]);
  const [reported, setReported] = useState<IssueActivityItem[]>([]);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [activityTab, setActivityTab] = useState<"following" | "reports">("following");

  useEffect(() => {
    if (ready && !authenticated) router.replace("/login");
  }, [ready, authenticated, router]);

  useEffect(() => {
    if (!ready || !authenticated || !user?.id) {
      setLoading(false);
      return;
    }
    let c = false;
    setLoading(true);
    void (async () => {
      try {
        const res = await fetch(`${backendUrl}/api/profiles/${encodeURIComponent(user.id)}`);
        const json = (await res.json()) as { data?: Record<string, unknown> | null; error?: string };
        if (!c) {
          if (!res.ok) setError(json.error ?? "Could not load profile.");
          else setRow(json.data ?? null);
        }
      } catch {
        if (!c) setError("Could not reach the server.");
      } finally {
        if (!c) setLoading(false);
      }
    })();
    return () => {
      c = true;
    };
  }, [ready, authenticated, user?.id]);

  useEffect(() => {
    if (!ready || !authenticated || !user?.id) {
      setActivityLoading(false);
      return;
    }
    let c = false;
    setActivityLoading(true);
    setActivityError(null);
    void (async () => {
      try {
        const res = await fetch(`${backendUrl}/api/issues/my-activity`, {
          headers: { "x-privy-user-id": user.id },
        });
        const json = (await res.json()) as {
          data?: { followed?: IssueActivityItem[]; reported?: IssueActivityItem[] };
          error?: string;
        };
        if (c) return;
        if (!res.ok) {
          setActivityError(json.error ?? "Could not load your issues.");
          setFollowed([]);
          setReported([]);
          return;
        }
        setFollowed(json.data?.followed ?? []);
        setReported(json.data?.reported ?? []);
      } catch {
        if (!c) {
          setActivityError("Could not reach the server.");
          setFollowed([]);
          setReported([]);
        }
      } finally {
        if (!c) setActivityLoading(false);
      }
    })();
    return () => {
      c = true;
    };
  }, [ready, authenticated, user?.id]);

  if (!ready || !authenticated) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-text-secondary">
        {ready ? "Redirecting…" : "Loading…"}
      </div>
    );
  }

  const str = (k: string) => (row && typeof row[k] === "string" ? String(row[k]).trim() : "") || "—";
  const displayName = formatDisplayName(row);

  return (
    <div className="min-h-screen bg-[#f4f4f5]">
      <div className="mx-auto w-full max-w-[760px] space-y-6 px-4 pb-24 pt-6 sm:px-6 md:px-10">
      <Link
        href="/home"
        className="inline-flex items-center gap-2 text-sm font-semibold text-secondary hover:text-text-secondary"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back to home
      </Link>

      <header>
        <h1 className="text-2xl font-bold tracking-tight text-secondary md:text-3xl">Your profile</h1>
        {!loading && !error && row ? (
          <p className="mt-2 text-lg font-semibold text-secondary">{displayName}</p>
        ) : null}
        <p className="mt-2 text-sm leading-relaxed text-text-secondary">
          Details we store for reporting issues, donations, and volunteer applications.
        </p>
      </header>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <Loader2 className="size-5 animate-spin" aria-hidden />
          Loading profile…
        </div>
      ) : null}
      {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}

      {!loading && !error && !row ? (
        <p className="text-sm text-text-secondary">
          No profile on file yet.{" "}
          <Link href="/auth" className="font-semibold text-secondary underline underline-offset-2">
            Complete onboarding
          </Link>{" "}
          to report issues and donate.
        </p>
      ) : null}

      {!loading && !error && row ? (
        <div className="space-y-4 rounded-2xl border border-stroke bg-white p-5 shadow-sm md:p-6">
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Email</dt>
              <dd className="mt-1 font-medium text-secondary">{str("email")}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Phone</dt>
              <dd className="mt-1 font-medium text-secondary">{str("phone")}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-text-secondary">First name</dt>
              <dd className="mt-1 font-medium text-secondary">{str("first_name")}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Last name</dt>
              <dd className="mt-1 font-medium text-secondary">{str("last_name")}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Address</dt>
              <dd className="mt-1 font-medium text-secondary">{formatAddressLine(row)}</dd>
            </div>
          </dl>
          <div className="border-t border-stroke pt-4">
            <Link
              href="/auth"
              className="inline-flex rounded-full border border-stroke bg-secondary px-5 py-2.5 text-sm font-bold text-primary transition-opacity hover:opacity-90"
            >
              Edit profile
            </Link>
          </div>
        </div>
      ) : null}

      {activityError ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-sm">
          {activityError}
        </p>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-stroke bg-white shadow-md">
        <div className="border-b border-stroke bg-[#fafafa] px-4 py-4 md:px-6">
          <h2 className="text-lg font-bold text-secondary">Your issues</h2>
          <p className="mt-1 text-xs text-text-secondary">Issues you follow and issues you reported.</p>
        </div>
        <div className="flex gap-1 border-b border-stroke bg-[#f4f4f5] p-1.5 sm:px-2" role="tablist" aria-label="Issue lists">
          <button
            type="button"
            role="tab"
            aria-selected={activityTab === "following"}
            onClick={() => setActivityTab("following")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-bold transition-all sm:py-3.5 ${
              activityTab === "following"
                ? "bg-secondary text-white shadow-md"
                : "text-secondary hover:bg-white/90"
            }`}
          >
            <Heart className="size-4 shrink-0 opacity-95" aria-hidden />
            <span>Following</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums ${
                activityTab === "following" ? "bg-white/20 text-white" : "bg-[#e5e5e5] text-secondary"
              }`}
            >
              {followed.length}
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activityTab === "reports"}
            onClick={() => setActivityTab("reports")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-bold transition-all sm:py-3.5 ${
              activityTab === "reports" ? "bg-secondary text-white shadow-md" : "text-secondary hover:bg-white/90"
            }`}
          >
            <Megaphone className="size-4 shrink-0" aria-hidden />
            <span>Your reports</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums ${
                activityTab === "reports" ? "bg-white/20 text-white" : "bg-[#e5e5e5] text-secondary"
              }`}
            >
              {reported.length}
            </span>
          </button>
        </div>
        <div className="p-5 md:p-6" role="tabpanel">
          {activityLoading ? (
            <p className="flex items-center gap-2 text-sm text-text-secondary">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Loading…
            </p>
          ) : activityTab === "following" ? (
            followed.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-stroke bg-[#fafafa] px-6 py-12 text-center">
                <Heart className="mx-auto size-9 text-text-secondary/35" aria-hidden />
                <p className="mt-3 text-sm font-semibold text-secondary">No followed issues yet</p>
                <p className="mt-1 text-xs text-text-secondary">Follow issues from the home feed to see them here.</p>
              </div>
            ) : (
              <ul className="space-y-3">
                {followed.map((it) => (
                  <li key={it.id}>
                    <ActivityIssueCard it={it} />
                  </li>
                ))}
              </ul>
            )
          ) : reported.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stroke bg-[#fafafa] px-6 py-12 text-center">
              <Megaphone className="mx-auto size-9 text-text-secondary/35" aria-hidden />
              <p className="mt-3 text-sm font-semibold text-secondary">No reports yet</p>
              <p className="mt-1 text-xs text-text-secondary">Issues you create appear in this list.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {reported.map((it) => (
                <li key={it.id}>
                  <ActivityIssueCard it={it} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
      </div>
    </div>
  );
}
