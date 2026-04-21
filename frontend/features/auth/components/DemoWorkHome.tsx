"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import HomeDashboard from "@/features/home/components/HomeDashboard";

export default function DemoWorkHome() {
  const router = useRouter();
  const { ready, authenticated } = usePrivy();

  useEffect(() => {
    if (ready && !authenticated) {
      router.replace("/login");
    }
  }, [ready, authenticated, router]);

  if (!ready) {
    return <div className="text-center text-sm text-text-secondary">Loading your session...</div>;
  }

  if (!authenticated) {
    return <div className="text-center text-sm text-text-secondary">Redirecting to login...</div>;
  }

  return <HomeDashboard variant="work" />;
}
