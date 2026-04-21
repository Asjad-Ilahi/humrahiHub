"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import VolunteerMyWorkPage from "@/features/home/components/VolunteerMyWorkPage";

export default function VolunteerMyProposalsRoute() {
  const router = useRouter();
  const { ready, authenticated } = usePrivy();

  useEffect(() => {
    if (ready && !authenticated) {
      router.replace("/login");
    }
  }, [ready, authenticated, router]);

  if (!ready) {
    return <div className="px-6 py-20 text-center text-sm text-text-secondary">Loading your session…</div>;
  }

  if (!authenticated) {
    return <div className="px-6 py-20 text-center text-sm text-text-secondary">Redirecting to login…</div>;
  }

  return <VolunteerMyWorkPage />;
}
