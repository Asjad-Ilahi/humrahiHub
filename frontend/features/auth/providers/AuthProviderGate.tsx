"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

/**
 * Privy + smart-wallets pull `permissionless` (and optional `ox`) into the graph.
 * SSR/Turbopack on CI can fail with MODULE_NOT_FOUND for deep ESM paths.
 * Loading the real provider only on the client avoids that class of build/runtime errors.
 */
const AuthProvider = dynamic(() => import("./AuthProvider"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[40vh] flex-1 items-center justify-center text-sm text-text-secondary">
      Loading…
    </div>
  ),
});

export default function AuthProviderGate({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
