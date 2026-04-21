"use client";

import Image from "next/image";

type Stat = {
  label: string;
  iconSrc: string;
  value: string;
  balanceSubline?: string;
};

const STATS_META: Omit<Stat, "value">[] = [
  { label: "Total raised (PKR)", iconSrc: "/coin.svg" },
  { label: "Active Projects", iconSrc: "/receipt.svg" },
  { label: "Community Supporters", iconSrc: "/community.svg" },
  { label: "Your balance (PKR)", iconSrc: "/wallet.svg" },
];

type Props = {
  firstName: string | null;
  lastName: string | null;
  profileLoading: boolean;
  stats: {
    totalRaised: string;
    activeProjects: string;
    communitySupporters: string;
    balance: string;
    balanceLoading: boolean;
    /** USDC amount + network + address snippet (smart wallet). */
    balanceSubline?: string;
  };
};

function buildDisplayName(firstName: string | null, lastName: string | null): string {
  const parts = [firstName?.trim(), lastName?.trim()].filter((p): p is string => Boolean(p && p.length > 0));
  return parts.join(" ");
}

export default function DashboardHero({ firstName, lastName, profileLoading, stats }: Props) {
  const displayName = buildDisplayName(firstName, lastName);
  const statRows: Stat[] = STATS_META.map((m, i) => {
    const values = [stats.totalRaised, stats.activeProjects, stats.communitySupporters, stats.balance] as const;
    const loadingBalance = i === 3 && stats.balanceLoading;
    return {
      ...m,
      value: loadingBalance ? "…" : values[i],
      balanceSubline: i === 3 ? stats.balanceSubline : undefined,
    };
  });

  return (
    <section className="animate-fade-slide-in overflow-hidden rounded-2xl text-black transition-all duration-500 ease-out">
      <div className="px-5 pb-2 pt-6 md:px-8 md:pt-8">
        {profileLoading ? (
          <div className="h-8 w-64 max-w-full animate-pulse rounded-md bg-neutral-800" aria-hidden />
        ) : displayName ? (
          <h1 className="text-2xl font-semibold tracking-tight text-black md:text-3xl">
            Welcome back, {displayName}!
          </h1>
        ) : (
          <h1 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">Welcome back!</h1>
        )}
        <p className="mt-2 max-w-2xl text-sm font-normal leading-relaxed text-[#666666] md:text-[15px]">
          Amounts on the dashboard are shown in Pakistani rupees (PKR). Your wallet balance is USDC on Base Sepolia.
        </p>
      </div>

      <div className="mt-4 grid grid-cols-1 divide-y divide-stroke border-t border-stroke border-b sm:grid-cols-2 lg:mt-6 lg:grid-cols-4 lg:divide-x lg:divide-y-0 lg:divide-stroke">
        {statRows.map((s) => (
          <div
            key={s.label}
            className="flex items-center gap-4 px-5 py-6 md:gap-5 md:px-8 md:py-7"
          >
            <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-card md:size-[52px]">
              <Image src={s.iconSrc} alt="" width={28} height={28} className="size-7 md:size-8" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-normal text-[#666666] md:text-[13px]">{s.label}</p>
              <p className="mt-1 text-xl font-bold tabular-nums leading-none text-black md:text-2xl">{s.value}</p>
              {s.balanceSubline ? (
                <p className="mt-1.5 break-all text-[11px] font-medium leading-snug text-[#666666] md:text-xs">
                  {s.balanceSubline}
                </p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
