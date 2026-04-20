"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  Camera,
  Banknote,
  FileText,
  Loader2,
  MapPin,
  Navigation,
  Sparkles,
  Tag,
  AlertTriangle,
} from "lucide-react";
import { APP_CHAIN_NAME } from "@/lib/chain";
import { resolveBestLatLngFromQuery } from "@/lib/geo";
import { fetchPkrPerUsd, pkrGoalToUsdCents } from "@/lib/fxPkr";

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:5000";

/** Same rules as HomeDashboard: use saved profile coordinates when present so distance matches the dashboard viewer. */
function parseProfileCoords(data: unknown): { lat: number; lng: number } | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  const la = Number(row.latitude);
  const lo = Number(row.longitude);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
  if (la < -90 || la > 90 || lo < -180 || lo > 180) return null;
  return { lat: la, lng: lo };
}

const CATEGORIES = ["Infrastructure", "Environment", "Education", "Community", "Safety"] as const;
const SEVERITIES = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "critical", label: "Critical" },
] as const;

const MAX_BYTES = 2 * 1024 * 1024;
const DESCRIPTION_MAX = 8000;
const BODY_MIN = 24;

function composeDescription(body: string, landmark: string, stakeholders: string): string {
  const b = body.trim();
  const parts = [b];
  const lm = landmark.trim();
  const st = stakeholders.trim();
  if (lm) parts.push("", `Nearby landmark: ${lm}`);
  if (st) parts.push("", `Stakeholders / who should help: ${st}`);
  return parts.join("\n").slice(0, DESCRIPTION_MAX);
}

const inputClass =
  "w-full rounded-[12px] border border-stroke bg-white px-3.5 py-3 text-sm text-secondary outline-none transition-[border-color] duration-150 placeholder:text-text-secondary focus:border-secondary/30 focus:ring-2 focus:ring-primary/40";

const labelClass = "text-xs font-semibold uppercase tracking-wide text-text-secondary";

function SectionHeader({
  icon: Icon,
  title,
  subtitle,
  step,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  step: number;
}) {
  return (
    <div className="flex gap-4 pb-5">
      <span
        className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-stroke bg-card text-secondary"
        aria-hidden
      >
        <Icon className="size-5" strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="font-mono text-[11px] font-bold tabular-nums text-text-secondary">0{step}</span>
          <h2 className="text-xl font-bold tracking-tight text-secondary">{title}</h2>
        </div>
        <p className="mt-1 text-sm leading-snug text-text-secondary">{subtitle}</p>
      </div>
    </div>
  );
}

export default function ReportIssuePage() {
  const router = useRouter();
  const { ready, authenticated, user } = usePrivy();
  const [title, setTitle] = useState("");
  const [descriptionBody, setDescriptionBody] = useState("");
  const [landmark, setLandmark] = useState("");
  const [stakeholders, setStakeholders] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("Infrastructure");
  const [severity, setSeverity] = useState<(typeof SEVERITIES)[number]["value"]>("low");
  const [city, setCity] = useState("");
  const [village, setVillage] = useState("");
  const [street, setStreet] = useState("");
  const [donationPkr, setDonationPkr] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitStep, setSubmitStep] = useState(0);

  useEffect(() => {
    if (ready && !authenticated) {
      router.replace("/login");
    }
  }, [ready, authenticated, router]);

  useEffect(() => {
    if (!file) {
      setFilePreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setFilePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!submitting) {
      setSubmitStep(0);
      return;
    }
    const id = window.setInterval(() => setSubmitStep((s) => (s + 1) % 4), 1200);
    return () => window.clearInterval(id);
  }, [submitting]);

  if (!ready || !authenticated || !user) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-6 py-24">
        <Loader2 className="size-8 animate-spin text-secondary" aria-hidden />
        <p className="text-sm text-text-secondary">Loading your session…</p>
      </div>
    );
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const desc = composeDescription(descriptionBody, landmark, stakeholders);

    if (!title.trim() || !city.trim() || !village.trim() || !street.trim() || !donationPkr.trim()) {
      setError("Title, city, village, street, and fundraising goal (PKR) are required.");
      return;
    }
    if (descriptionBody.trim().length < BODY_MIN) {
      setError(`Please add at least ${BODY_MIN} characters in “What should we know?” so responders have enough context.`);
      return;
    }
    if (desc.length > DESCRIPTION_MAX) {
      setError(`Combined details are too long (max ${DESCRIPTION_MAX} characters).`);
      return;
    }
    if (!file) {
      setError("A photo of the issue is required (PNG or JPEG, max 2MB).");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Image must be 2MB or smaller.");
      return;
    }
    const allowed = ["image/png", "image/jpeg", "image/jpg"];
    if (!allowed.includes(file.type)) {
      setError("Image must be PNG or JPEG.");
      return;
    }

    const geoQuery = [street.trim(), village.trim(), city.trim()].filter(Boolean).join(", ");
    let coords: { latitude: number; longitude: number } | null = null;
    try {
      const profRes = await fetch(`${backendUrl}/api/profiles/${encodeURIComponent(user.id)}`);
      if (profRes.ok) {
        const profJson = (await profRes.json()) as { data?: unknown };
        const pc = parseProfileCoords(profJson.data);
        if (pc) coords = { latitude: pc.lat, longitude: pc.lng };
      }
    } catch {
      /* fall through to geocode */
    }
    if (!coords) {
      const ll = await resolveBestLatLngFromQuery(geoQuery);
      if (!ll) {
        setError("Could not determine a location. Check your internet connection and try again.");
        return;
      }
      coords = ll;
    }

    const pkrPerUsd = await fetchPkrPerUsd();

    const pkr = Number.parseFloat(donationPkr.replace(",", "."));
    if (!Number.isFinite(pkr) || pkr <= 0) {
      setError("Enter a valid fundraising goal in Pakistani rupees (PKR).");
      return;
    }
    const cents = pkrGoalToUsdCents(pkr, pkrPerUsd);
    if (cents < 1) {
      setError("That goal is too small after conversion. Enter a higher amount in PKR.");
      return;
    }

    const fd = new FormData();
    fd.append("image", file);
    fd.append("title", title.trim());
    fd.append("description", desc);
    fd.append("category", category);
    fd.append("severity", severity);
    fd.append("city", city.trim());
    fd.append("village", village.trim());
    fd.append("street", street.trim());
    fd.append("latitude", String(coords.latitude));
    fd.append("longitude", String(coords.longitude));
    fd.append("donation_target_cents", String(cents));

    setSubmitting(true);
    try {
      const res = await fetch(`${backendUrl}/api/issues`, {
        method: "POST",
        headers: { "x-privy-user-id": user.id },
        body: fd,
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Could not create issue.");
        return;
      }
      router.replace("/home");
    } catch {
      setError("Network error. Is the backend running?");
    } finally {
      setSubmitting(false);
    }
  };

  const submitLines = [
    "Saving your location…",
    "Preparing your goal…",
    "Uploading your photo…",
    "Publishing your report…",
  ];

  return (
    <div className="-mt-6 min-h-screen bg-white pb-28 pt-6 md:-mt-5 md:pt-8">
      <main className="relative z-[1] mx-auto w-full max-w-[1280px] space-y-8 px-5 md:px-10">
        <div className="report-hero-animate flex flex-col gap-4">
          <Link
            href="/home"
            className="group inline-flex w-fit items-center gap-2.5 text-sm font-semibold text-secondary transition-colors hover:text-text-secondary"
          >
            <span className="flex size-9 items-center justify-center rounded-lg border border-stroke bg-white transition-colors group-hover:border-secondary">
              <ArrowLeft className="size-4" aria-hidden />
            </span>
            Back to dashboard
          </Link>

            <p className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Community</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-secondary md:text-[2.15rem] md:leading-tight">
              Report an issue
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-text-secondary md:text-[15px]">
              Describe what is wrong, where it is, and how much you hope to raise.
            </p>
        </div>

        <form
          onSubmit={(e) => void onSubmit(e)}
          className="report-field-animate overflow-hidden rounded-2xl border border-stroke bg-white"
          style={{ animationDelay: "60ms" }}
        >
          {error && (
            <div
              className="flex gap-3 border-b border-red-200 bg-red-50 px-5 py-4 text-sm text-red-900 sm:px-6"
              role="alert"
            >
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-red-600" aria-hidden />
              <p className="leading-snug">{error}</p>
            </div>
          )}

          <section className="space-y-6 bg-white px-5 py-7 sm:px-7 sm:py-8">
            <SectionHeader
              icon={FileText}
              step={1}
              title="Details"
              subtitle="Title, category, severity, and the story behind the issue."
            />

            <div className="space-y-2">
              <label className={labelClass} htmlFor="issue-title">
                Title <span className="text-red-600">*</span>
              </label>
              <input
                id="issue-title"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Broken water main on Oak Street"
                className={`${inputClass} mt-0`}
              />
            </div>

            <div className="space-y-3">
              <p className={`${labelClass} flex items-center gap-2`}>
                <Tag className="size-3.5" strokeWidth={2} aria-hidden />
                Category
              </p>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((c) => {
                  const active = category === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCategory(c)}
                      className={`rounded-lg border px-3.5 py-2 text-sm font-semibold transition-colors duration-150 ${
                        active
                          ? "border-secondary bg-secondary text-primary"
                          : "border-stroke bg-card text-secondary hover:border-secondary/40"
                      }`}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3">
              <p className={labelClass}>Severity</p>
              <div
                className="flex rounded-xl border border-stroke p-0.5"
                role="group"
                aria-label="Severity"
              >
                {SEVERITIES.map((s) => {
                  const active = severity === s.value;
                  return (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setSeverity(s.value)}
                      className={`min-h-[44px] flex-1 rounded-[10px] text-sm font-semibold transition-colors duration-150 ${
                        active ? "bg-secondary text-primary" : "text-secondary hover:bg-card"
                      }`}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <label className={labelClass} htmlFor="issue-body">
                What should we know? <span className="text-red-600">*</span>
              </label>
              <textarea
                id="issue-body"
                required
                value={descriptionBody}
                onChange={(e) => setDescriptionBody(e.target.value)}
                rows={6}
                placeholder="Describe the problem, who it affects, and any safety or urgency."
                className={`${inputClass} min-h-[140px] resize-y leading-relaxed`}
              />
              <p className="font-mono text-[11px] tabular-nums text-text-secondary">
                At least {BODY_MIN} characters · {descriptionBody.trim().length} / {DESCRIPTION_MAX}
              </p>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <label className={labelClass} htmlFor="issue-landmark">
                  Nearby landmark <span className="normal-case font-normal text-text-secondary">(optional)</span>
                </label>
                <input
                  id="issue-landmark"
                  value={landmark}
                  onChange={(e) => setLandmark(e.target.value)}
                  placeholder="e.g. Beside the old post office"
                  className={inputClass}
                />
              </div>
              <div className="space-y-2">
                <label className={labelClass} htmlFor="issue-stakeholders">
                  Who should help? <span className="normal-case font-normal text-text-secondary">(optional)</span>
                </label>
                <input
                  id="issue-stakeholders"
                  value={stakeholders}
                  onChange={(e) => setStakeholders(e.target.value)}
                  placeholder="e.g. Municipality, school board"
                  className={inputClass}
                />
              </div>
            </div>
          </section>

          <div className="h-px w-full bg-stroke" aria-hidden />

          <section className="space-y-6 px-5 py-7 sm:px-7 sm:py-8">
            <SectionHeader
              icon={MapPin}
              step={2}
              title="Location"
              subtitle="City, area, and street help people find the issue."
            />

            <div className="grid gap-5 sm:grid-cols-3">
              <div className="space-y-2 sm:col-span-1">
                <label className={labelClass} htmlFor="issue-city">
                  City <span className="text-red-600">*</span>
                </label>
                <input id="issue-city" required value={city} onChange={(e) => setCity(e.target.value)} className={inputClass} />
              </div>
              <div className="space-y-2 sm:col-span-1">
                <label className={labelClass} htmlFor="issue-village">
                  Village / area <span className="text-red-600">*</span>
                </label>
                <input
                  id="issue-village"
                  required
                  value={village}
                  onChange={(e) => setVillage(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="space-y-2 sm:col-span-1">
                <label className={labelClass} htmlFor="issue-street">
                  Street <span className="text-red-600">*</span>
                </label>
                <input
                  id="issue-street"
                  required
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          </section>

          <div className="h-px w-full bg-stroke" aria-hidden />

          <section className="space-y-6 bg-white px-5 py-7 sm:px-7 sm:py-8">
            <SectionHeader
              icon={Camera}
              step={3}
              title="Photo & goal"
              subtitle="Add a clear photo and your fundraising goal in PKR."
            />

            <div className="space-y-3">
              <label className={labelClass}>
                Photo <span className="text-red-600">*</span>
              </label>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-stretch">
                <label className="flex min-h-[180px] flex-1 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-stroke bg-card/50 px-4 py-8 text-center transition-colors hover:border-secondary/50 hover:bg-card">
                  <Camera className="size-9 text-text-secondary" strokeWidth={1.5} aria-hidden />
                  <span className="mt-3 text-sm font-semibold text-secondary">Choose image</span>
                  <span className="mt-1 text-xs text-text-secondary">PNG or JPEG · max 2 MB</span>
                  <input
                    required
                    type="file"
                    accept="image/png,image/jpeg,image/jpg"
                    className="sr-only"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                </label>
                {filePreview ? (
                  <div className="relative aspect-[4/3] w-full max-w-[min(100%,320px)] shrink-0 overflow-hidden rounded-xl border border-stroke bg-card sm:aspect-square sm:max-w-[280px]">
                    <Image src={filePreview as string} alt="Selected preview" fill className="object-cover" unoptimized />
                  </div>
                ) : null}
              </div>
              {file != null ? (
                <p className="truncate text-xs font-medium text-secondary" title={file.name}>
                  {file.name}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <label className={`${labelClass} flex items-center gap-2`} htmlFor="issue-goal">
                <Banknote className="size-3.5" strokeWidth={2} aria-hidden />
                Fundraising goal (PKR) <span className="text-red-600">*</span>
              </label>
              <input
                id="issue-goal"
                required
                type="number"
                min="0.01"
                step="any"
                value={donationPkr}
                onChange={(e) => setDonationPkr(e.target.value)}
                className={inputClass}
                placeholder="e.g. 50000"
              />
              <p className="text-[11px] leading-relaxed text-text-secondary">
                Enter the total you hope to raise in PKR. Donations to the project are sent in USDC on the test network.
              </p>
            </div>
          </section>

          <div className="border-t border-stroke bg-card/60 px-5 py-6 sm:px-7">
            <button
              type="submit"
              disabled={submitting}
              className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl border-2 border-secondary bg-secondary py-3.5 text-base font-bold text-primary transition-colors duration-150 hover:bg-[#1a1a1a] disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="size-5 animate-spin shrink-0" aria-hidden />
                  Creating issue…
                </>
              ) : (
                <>
                  <Sparkles className="size-5 shrink-0" aria-hidden />
                  Submit report
                </>
              )}
            </button>
            <p className="mt-3 text-center text-[11px] leading-relaxed text-text-secondary">
              Each report gets its own project wallet on {APP_CHAIN_NAME}.
            </p>
          </div>
        </form>
      </main>

      {submitting ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/20 backdrop-blur-[1px]">
          <div className="mx-4 w-full max-w-md overflow-hidden rounded-2xl border-2 border-secondary bg-white">
            <div className="border-b border-stroke bg-primary px-6 py-3">
              <p className="text-center text-xs font-bold uppercase tracking-widest text-secondary">Submitting report</p>
            </div>
            <div className="flex flex-col items-center gap-6 px-8 py-10">
              <div className="relative size-20">
                <div
                  className="absolute inset-0 rounded-full border-4 border-card"
                  aria-hidden
                />
                <div
                  className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-secondary border-r-secondary/40"
                  aria-hidden
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Sparkles className="size-7 text-secondary" aria-hidden />
                </div>
              </div>
              <div className="space-y-2 text-center">
                <p className="text-base font-bold text-secondary">{submitLines[submitStep]}</p>
                <p className="text-xs text-text-secondary">Hang tight — this usually takes a few seconds.</p>
              </div>
              <div className="flex w-full justify-center gap-1.5">
                {[0, 1, 2, 3].map((i) => (
                  <span
                    key={i}
                    className={`h-1.5 w-8 rounded-full transition-colors duration-300 ${
                      i === submitStep ? "bg-secondary" : "bg-stroke"
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
