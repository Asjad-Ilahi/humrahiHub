"use client";

import { usePathname } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import MarketingNavbar from "./MarketingNavbar";
import DashboardNavbar from "./dashboard/DashboardNavbar";

export default function SiteHeader() {
  const pathname = usePathname();
  const { ready, authenticated } = usePrivy();

  const showDashboardNav =
    Boolean(pathname?.startsWith("/home")) && ready && authenticated;

  if (showDashboardNav) {
    return <DashboardNavbar />;
  }

  return <MarketingNavbar />;
}
