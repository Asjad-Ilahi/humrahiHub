"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { ArrowLeft, CheckCircle2, FileUp, IdCard, Loader2, Trash2, Upload } from "lucide-react";

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:5000";

const ACCEPT_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "application/pdf"]);
const MAX_BYTES = 5 * 1024 * 1024;

const inputClass =
  "w-full rounded-xl border border-stroke bg-white px-4 py-3 text-sm text-secondary outline-none transition-[border-color,box-shadow] placeholder:text-text-secondary focus:border-secondary/40 focus:ring-2 focus:ring-primary/35";

const labelClass = "text-xs font-semibold uppercase tracking-wide text-text-secondary";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function validateIdFile(f: File): string | null {
  if (!ACCEPT_TYPES.has(f.type)) {
    return "Use PNG, JPEG, or PDF.";
  }
  if (f.size > MAX_BYTES) {
    return "File must be 5 MB or smaller.";
  }
  return null;
}

export default function VolunteerApplyPage() {
  const router = useRouter();
  const { ready, authenticated, user } = usePrivy();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [skills, setSkills] = useState("");
  const [roleDescription, setRoleDescription] = useState("");
  const [phone, setPhone] = useState("");
  const [availability, setAvailability] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileHint, setFileHint] = useState<string | null>(null);
  const [idDragActive, setIdDragActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [statusLine, setStatusLine] = useState<string | null>(null);
  const [submitBlocked, setSubmitBlocked] = useState(false);

  const pickFile = useCallback((f: File | null) => {
    setFileHint(null);
    if (!f) {
      setFile(null);
      return;
    }
    const err = validateIdFile(f);
    if (err) {
      setFile(null);
      setFileHint(err);
      return;
    }
    setFile(f);
  }, []);

  useEffect(() => {
    if (ready && !authenticated) router.replace("/login");
  }, [ready, authenticated, router]);

  useEffect(() => {
    if (!ready || !authenticated || !user?.id) return;
    let c = false;
    void (async () => {
      try {
        const res = await fetch(`${backendUrl}/api/volunteers/me`, {
          headers: { "x-privy-user-id": user.id },
        });
        const json = (await res.json()) as { data?: { approved?: boolean; application?: { status?: string } | null } };
        if (c || !res.ok) return;
        if (json.data?.approved) {
          setStatusLine("You are already an approved volunteer.");
          setSubmitBlocked(true);
        } else if (json.data?.application?.status === "pending") {
          setStatusLine("Your application is pending review.");
          setSubmitBlocked(true);
        } else {
          setSubmitBlocked(false);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      c = true;
    };
  }, [ready, authenticated, user?.id]);

  if (!ready || !authenticated || !user) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-text-secondary">
        {ready ? "Redirecting…" : "Loading…"}
      </div>
    );
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (!file) {
      setMsg("Add your ID document using the upload area below.");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("id_document", file);
      fd.append("skills", skills.trim());
      fd.append("role_description", roleDescription.trim());
      fd.append("phone", phone.trim());
      fd.append("availability_notes", availability.trim());
      const res = await fetch(`${backendUrl}/api/volunteers/apply`, {
        method: "POST",
        headers: { "x-privy-user-id": user.id },
        body: fd,
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMsg(json.error ?? "Could not submit application.");
        return;
      }
      setSubmitBlocked(true);
      setStatusLine("Application submitted. An admin will review it shortly.");
      setSkills("");
      setRoleDescription("");
      setPhone("");
      setAvailability("");
      setFile(null);
      setFileHint(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch {
      setMsg("Network error. Is the backend running?");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[640px] space-y-8 px-5 pb-28 pt-6 md:px-10">
      <Link
        href="/home"
        className="inline-flex items-center gap-2 text-sm font-semibold text-secondary transition-colors hover:text-text-secondary"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back to home
      </Link>

      <header className="space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Community</p>
        <h1 className="text-2xl font-bold tracking-tight text-secondary md:text-3xl">Volunteer application</h1>
        <p className="max-w-xl text-sm leading-relaxed text-text-secondary">
          Share your skills and how you want to help. We need a clear government-issued ID (CNIC, passport, or similar)
          for verification. Approved volunteers can submit work proposals during the short window after projects meet
          their fundraising goals.
        </p>
      </header>

      {statusLine ? (
        <div className="flex gap-3 rounded-xl border border-stroke bg-card px-4 py-3 text-sm text-secondary">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden />
          <p>{statusLine}</p>
        </div>
      ) : null}

      <form
        onSubmit={(e) => void onSubmit(e)}
        className="overflow-hidden rounded-2xl border border-stroke bg-white shadow-sm"
      >
        {msg ? (
          <div className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-800" role="alert">
            {msg}
          </div>
        ) : null}

        <div className="space-y-6 px-5 py-7 sm:px-7 sm:py-8">
          <div className="space-y-2">
            <label className={labelClass} htmlFor="skills">
              Skills & trades <span className="text-red-600">*</span>
            </label>
            <input
              id="skills"
              required
              value={skills}
              onChange={(e) => setSkills(e.target.value)}
              placeholder="e.g. plumbing, electrical, first aid, community outreach"
              className={inputClass}
            />
          </div>

          <div className="space-y-2">
            <label className={labelClass} htmlFor="role">
              How you want to contribute <span className="text-red-600">*</span>
            </label>
            <textarea
              id="role"
              required
              rows={5}
              value={roleDescription}
              onChange={(e) => setRoleDescription(e.target.value)}
              placeholder="Describe the kinds of roles you are comfortable with on-site or remotely, and any relevant experience."
              className={`${inputClass} min-h-[140px] resize-y leading-relaxed`}
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <label className={labelClass} htmlFor="phone-v">
                Contact phone <span className="font-normal normal-case text-text-secondary">(optional)</span>
              </label>
              <input
                id="phone-v"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+92 …"
                className={inputClass}
              />
            </div>
            <div className="space-y-2">
              <label className={labelClass} htmlFor="avail">
                Availability <span className="font-normal normal-case text-text-secondary">(optional)</span>
              </label>
              <input
                id="avail"
                value={availability}
                onChange={(e) => setAvailability(e.target.value)}
                placeholder="e.g. weekends, evenings"
                className={inputClass}
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <IdCard className="size-4 text-secondary" strokeWidth={2} aria-hidden />
              <span className={labelClass}>
                Government ID <span className="text-red-600">*</span>
              </span>
            </div>
            <p className="text-[13px] leading-snug text-text-secondary">
              Upload a photo or scan of your CNIC, passport, or other official ID. PNG, JPEG, or PDF — max{" "}
              {formatFileSize(MAX_BYTES)}.
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,application/pdf"
              className="sr-only"
              id="id-doc"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />

            <div
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onDragEnter={(e) => {
                e.preventDefault();
                setIdDragActive(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setIdDragActive(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setIdDragActive(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setIdDragActive(false);
                const f = e.dataTransfer.files?.[0];
                if (f) pickFile(f);
              }}
              className={`relative rounded-2xl border-2 border-dashed transition-colors duration-200 ${
                idDragActive
                  ? "border-secondary bg-primary/30"
                  : file
                    ? "border-emerald-500/50 bg-emerald-50/40"
                    : "border-stroke bg-card/60 hover:border-secondary/35 hover:bg-card"
              }`}
            >
              <div className="flex flex-col items-center justify-center gap-3 px-4 py-10 sm:py-12">
                <span
                  className={`flex size-14 items-center justify-center rounded-2xl border ${
                    file ? "border-emerald-200 bg-white text-emerald-700" : "border-stroke bg-white text-secondary"
                  }`}
                >
                  {file ? <FileUp className="size-7" strokeWidth={1.75} aria-hidden /> : <Upload className="size-7" strokeWidth={1.75} aria-hidden />}
                </span>
                {file ? (
                  <>
                    <div className="text-center">
                      <p className="text-sm font-semibold text-secondary">{file.name}</p>
                      <p className="mt-1 font-mono text-xs tabular-nums text-text-secondary">{formatFileSize(file.size)}</p>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="rounded-full border border-stroke bg-white px-4 py-2 text-xs font-semibold text-secondary transition-colors hover:bg-card"
                      >
                        Replace file
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setFile(null);
                          setFileHint(null);
                          if (fileInputRef.current) fileInputRef.current.value = "";
                        }}
                        className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-white px-4 py-2 text-xs font-semibold text-red-800 transition-colors hover:bg-red-50"
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                        Remove
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-center">
                      <p className="text-sm font-semibold text-secondary">Drop your file here or browse</p>
                      <p className="mt-1 text-xs text-text-secondary">Click the button below to choose from your device</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-secondary px-6 py-2.5 text-sm font-bold text-primary shadow-sm transition-transform hover:-translate-y-0.5 active:scale-[0.99]"
                    >
                      <Upload className="size-4 shrink-0" aria-hidden />
                      Choose ID document
                    </button>
                  </>
                )}
              </div>
            </div>

            {fileHint ? <p className="text-xs font-medium text-red-700">{fileHint}</p> : null}
          </div>
        </div>

        <div className="border-t border-stroke bg-card/50 px-5 py-5 sm:px-7">
          <button
            type="submit"
            disabled={busy || submitBlocked}
            className="flex w-full min-h-[52px] items-center justify-center gap-2 rounded-xl border-2 border-secondary bg-secondary py-3.5 text-sm font-bold text-primary transition-opacity hover:opacity-95 disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-5 animate-spin shrink-0" aria-hidden /> : null}
            Submit application
          </button>
        </div>
      </form>
    </div>
  );
}
