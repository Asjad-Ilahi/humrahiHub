"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";

export default function LoginOnly() {
  const router = useRouter();
  const { ready, authenticated, login } = usePrivy();

  useEffect(() => {
    if (ready && authenticated) {
      router.replace("/home");
    }
  }, [ready, authenticated, router]);

  if (!ready) {
    return <div className="text-center text-sm text-text-secondary">Preparing sign-in...</div>;
  }

  if (authenticated) {
    return <div className="text-center text-sm text-text-secondary">Redirecting...</div>;
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 rounded-3xl border border-stroke bg-white p-8 text-center md:p-10">
      <p className="text-xs uppercase tracking-[0.22em] text-text-secondary">Welcome back</p>
      <h1 className="text-3xl font-semibold text-secondary">Log in to your account</h1>
      <p className="text-sm text-text-secondary">
        Use the same Google or email method you signed up with. New here?{" "}
        <Link href="/auth" className="font-semibold text-secondary underline-offset-2 hover:underline">
          Create an account
        </Link>
        .
      </p>
      <button
        type="button"
        onClick={() => login()}
        className="w-full rounded-full bg-secondary px-8 py-3 text-sm font-semibold text-primary transition-transform duration-300 hover:-translate-y-0.5 md:text-base"
      >
        Continue with Google or Email
      </button>
    </div>
  );
}
