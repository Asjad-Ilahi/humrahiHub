"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:5000";

export default function DemoHome() {
  const router = useRouter();
  const { ready, authenticated, user, logout } = usePrivy();
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileJson, setProfileJson] = useState<unknown>(null);

  const walletAddress = useMemo(() => {
    const embeddedWallet = user?.wallet?.address;
    if (embeddedWallet) return embeddedWallet;
    const linkedWallet = user?.linkedAccounts?.find((account) => account.type === "wallet");
    if (linkedWallet && "address" in linkedWallet) {
      return linkedWallet.address as string;
    }
    return null;
  }, [user]);

  useEffect(() => {
    if (ready && !authenticated) {
      router.replace("/login");
    }
  }, [ready, authenticated, router]);

  useEffect(() => {
    if (!ready || !authenticated || !user?.id) return;

    let cancelled = false;
    (async () => {
      setProfileError(null);
      try {
        const res = await fetch(`${backendUrl}/api/profiles/${encodeURIComponent(user.id)}`);
        const body = await res.json();
        if (!res.ok) {
          if (!cancelled) setProfileError(body.error ?? "Could not load profile.");
          return;
        }
        if (!cancelled) setProfileJson(body.data ?? null);
      } catch {
        if (!cancelled) setProfileError("Could not reach the API. Is the backend running?");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, authenticated, user?.id]);

  if (!ready) {
    return <div className="text-center text-sm text-text-secondary">Loading your session...</div>;
  }

  if (!authenticated || !user) {
    return <div className="text-center text-sm text-text-secondary">Redirecting to login...</div>;
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8">
      <div className="rounded-3xl border border-stroke bg-gradient-to-b from-card/70 to-white p-8 md:p-10">
        <p className="text-xs uppercase tracking-[0.22em] text-text-secondary">Demo home</p>
        <h1 className="mt-3 text-3xl font-semibold text-secondary md:text-4xl">You are signed in</h1>
        <p className="mt-4 text-sm text-text-secondary md:text-base">
          This is a simple post-login dashboard. Your Privy user id is stored with your profile when you complete signup
          on the join flow.
        </p>
        <dl className="mt-8 grid gap-4 rounded-2xl border border-stroke bg-white/80 p-6 text-left text-sm md:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-[0.16em] text-text-secondary">Email</dt>
            <dd className="mt-1 font-medium text-secondary">{user.email?.address ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.16em] text-text-secondary">Wallet</dt>
            <dd className="mt-1 break-all font-mono text-xs text-secondary">{walletAddress ?? "—"}</dd>
          </div>
          <div className="md:col-span-2">
            <dt className="text-xs uppercase tracking-[0.16em] text-text-secondary">Privy user id</dt>
            <dd className="mt-1 break-all font-mono text-xs text-secondary">{user.id}</dd>
          </div>
        </dl>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-full border border-stroke px-6 py-2.5 text-sm font-semibold text-secondary transition-colors hover:bg-card"
          >
            Back to marketing site
          </Link>
          <Link
            href="/auth"
            className="inline-flex items-center justify-center rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-secondary transition-transform hover:-translate-y-0.5"
          >
            Complete or update profile
          </Link>
          <button
            type="button"
            onClick={() => logout()}
            className="inline-flex items-center justify-center rounded-full bg-secondary px-6 py-2.5 text-sm font-semibold text-primary transition-transform hover:-translate-y-0.5"
          >
            Log out
          </button>
        </div>
      </div>

      <div className="rounded-3xl border border-stroke bg-white p-6 md:p-8">
        <h2 className="text-lg font-semibold text-secondary">Profile in database</h2>
        <p className="mt-2 text-sm text-text-secondary">
          Fetched from <span className="font-mono text-xs">{backendUrl}/api/profiles/:privyUserId</span>
        </p>
        {profileError && <p className="mt-4 text-sm text-red-600">{profileError}</p>}
        {!profileError && profileJson === null && (
          <p className="mt-4 text-sm text-text-secondary">
            No profile row yet. Finish the join flow and tap &quot;Save profile to Supabase&quot;, or add your details on{" "}
            <Link href="/auth" className="font-semibold underline-offset-2 hover:underline">
              /auth
            </Link>
            .
          </p>
        )}
        {!profileError && profileJson !== null && (
          <pre className="mt-4 max-h-80 overflow-auto rounded-2xl bg-card/80 p-4 text-xs leading-relaxed text-secondary">
            {JSON.stringify(profileJson, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
