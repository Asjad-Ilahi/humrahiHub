"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { isAddress } from "viem";
import { Copy, Check } from "lucide-react";
import Button from "@/components/Button";
import {
  readEmbeddedWalletAddress,
  readSmartWalletAddressForBalance,
} from "@/features/auth/lib/privyWallet";
import { APP_CHAIN_NAME } from "@/lib/chain";

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:5000";
/** Match backend default: sandbox unless COINBASE_RAMP_SANDBOX=false */
const showCoinbaseSandboxHint = process.env.NEXT_PUBLIC_COINBASE_RAMP_SANDBOX !== "false";

type ProfileTab = "details" | "volunteer" | "settings";

function useDismissRef(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const el = ref.current;
      if (el && !el.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, onClose]);

  return ref;
}

function WalletTriggerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
      <rect x="3" y="6" width="18" height="12" rx="3" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="16.5" cy="12" r="1.7" fill="currentColor" />
    </svg>
  );
}

export default function DashboardNavbar() {
  const router = useRouter();
  const { user, logout } = usePrivy();
  const { client: smartWalletClient } = useSmartWallets();
  const [walletOpen, setWalletOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileTab, setProfileTab] = useState<ProfileTab>("details");
  const [copied, setCopied] = useState(false);
  const [rampBusy, setRampBusy] = useState<"on" | "off" | null>(null);
  const [rampError, setRampError] = useState<string | null>(null);

  const walletRef = useDismissRef(walletOpen, () => setWalletOpen(false));
  const profileRef = useDismissRef(profileOpen, () => setProfileOpen(false));

  const smartAddress = useMemo(
    () => readSmartWalletAddressForBalance(user, smartWalletClient),
    [user, smartWalletClient]
  );

  const embedded = useMemo(() => readEmbeddedWalletAddress(user), [user]);

  const copyAddress = useCallback(async () => {
    if (!smartAddress) return;
    try {
      await navigator.clipboard.writeText(smartAddress);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }, [smartAddress]);

  const openCoinbaseRamp = useCallback(
    async (flow: "onramp" | "offramp") => {
      if (!user?.id) return;
      const addr = smartAddress;
      if (!addr || !isAddress(addr as `0x${string}`)) {
        setRampError("Smart wallet address is not ready yet.");
        return;
      }
      setRampError(null);
      setRampBusy(flow === "onramp" ? "on" : "off");
      if (flow === "onramp") {
        void fetch(`${backendUrl}/api/coinbase/credit-sepolia-usdc`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-privy-user-id": user.id,
          },
          body: JSON.stringify({ destinationAddress: addr }),
        })
          .then((creditRes) => {
            if (creditRes.ok) {
              window.dispatchEvent(new Event("humrahi:refresh-wallet-balance"));
            }
          })
          .catch(() => {});
      }
      try {
        const res = await fetch(`${backendUrl}/api/coinbase/ramp-session`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-privy-user-id": user.id,
          },
          body: JSON.stringify({
            flow,
            destinationAddress: addr,
          }),
        });
        const json = (await res.json()) as { data?: { url?: string }; error?: string };
        if (!res.ok) {
          setRampError(json.error ?? "Could not start Coinbase session.");
          return;
        }
        const url = json.data?.url;
        if (!url || typeof url !== "string") {
          setRampError("Unexpected response from the server.");
          return;
        }
        window.open(url, "_blank", "noopener,noreferrer");
      } catch {
        setRampError("Could not reach the API.");
      } finally {
        setRampBusy(null);
      }
    },
    [user?.id, smartAddress]
  );

  const qrSrc = smartAddress
    ? `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(smartAddress)}`
    : null;

  const email = user?.email?.address ?? "—";

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-stroke bg-white/95 backdrop-blur-md transition-shadow duration-300 hover:shadow-sm">
      <div className="mx-auto flex w-full max-w-[1280px] items-center justify-between gap-4 px-5 py-3 md:px-10">
        <Link href="/home" className="flex min-w-0 items-center gap-3 transition-opacity duration-200 hover:opacity-90">
          <Image src="/logo.png" alt="" width={44} height={44} className="size-11 shrink-0 rounded-full" />
          <span className="truncate text-xl font-bold tracking-tight text-secondary md:text-2xl">HUMRAHI HUB</span>
        </Link>

        <div className="flex shrink-0 items-center gap-2 md:gap-3">
          <Button type="button" variant="reportIssue" onClick={() => router.push("/home/report")} className="max-w-[48vw] truncate sm:max-w-none">
            <span className="truncate">Report Issue</span>
          </Button>

          <div className="relative" ref={walletRef}>
            <button
              type="button"
              onClick={() => {
                setWalletOpen((v) => !v);
                setProfileOpen(false);
              }}
              className="inline-flex items-center gap-2 rounded-[12px] bg-secondary px-4 py-2.5 text-sm font-semibold text-primary transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98] md:px-5"
              aria-expanded={walletOpen}
              aria-haspopup="true"
            >
              <WalletTriggerIcon />
              <span className="hidden md:inline">Wallet Info</span>
            </button>

            <div
              className={`absolute right-0 top-[calc(100%+10px)] z-50 w-[min(100vw-2rem,320px)] origin-top-right rounded-[14px] border border-stroke bg-white p-4 shadow-xl transition-all duration-200 ease-out md:w-[340px] ${
                walletOpen
                  ? "pointer-events-auto scale-100 opacity-100"
                  : "pointer-events-none scale-95 opacity-0"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Smart wallet</p>
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                  {APP_CHAIN_NAME}
                </span>
              </div>
              <div className="mt-2 flex items-start gap-2">
                <p className="min-w-0 flex-1 break-all font-mono text-xs leading-relaxed text-secondary">
                  {smartAddress ?? "Creating your smart wallet…"}
                </p>
                <button
                  type="button"
                  onClick={copyAddress}
                  disabled={!smartAddress}
                  className="shrink-0 rounded-lg border border-stroke p-2 text-secondary transition-colors duration-200 hover:bg-card disabled:opacity-40"
                  aria-label="Copy address"
                >
                  {copied ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
                </button>
              </div>

              {qrSrc ? (
                <Image src={qrSrc} alt="Wallet QR code" width={140} height={140} className="mx-auto mt-4 rounded-xl border border-stroke" unoptimized />
              ) : (
                <div className="mx-auto mt-4 flex size-[140px] items-center justify-center rounded-xl border border-dashed border-stroke bg-card text-center text-xs text-text-secondary">
                  QR when address is ready
                </div>
              )}

              <div className="mt-4 space-y-2 border-t border-stroke pt-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">Coinbase ramp</p>

                <Button
                  type="button"
                  variant="topup"
                  className="w-full"
                  disabled={!user?.id || rampBusy !== null}
                  onClick={() => void openCoinbaseRamp("onramp")}
                >
                  {rampBusy === "on" ? "Opening…" : "Add funds (PKR → USDC)"}
                </Button>
                <Button
                  type="button"
                  variant="withdraw"
                  className="w-full"
                  disabled={!user?.id || rampBusy !== null}
                  onClick={() => void openCoinbaseRamp("offramp")}
                >
                  {rampBusy === "off" ? "Opening…" : "Withdraw to bank / Coinbase"}
                </Button>
                {rampError ? <p className="text-center text-xs text-red-700">{rampError}</p> : null}
                <p className="text-center text-[11px] text-text-secondary">
                  Or send USDC to the address above from any wallet.
                </p>
              </div>
            </div>
          </div>

          <div className="relative" ref={profileRef}>
            <button
              type="button"
              onClick={() => {
                setProfileOpen((v) => !v);
                setWalletOpen(false);
              }}
              className="flex size-11 items-center justify-center rounded-full border border-stroke bg-card text-secondary transition-all duration-300 hover:border-secondary hover:shadow-md active:scale-95"
              aria-expanded={profileOpen}
              aria-haspopup="true"
              aria-label="Account menu"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-4 0-7 2-7 4v1h14v-1c0-2-3-4-7-4Z"
                  fill="currentColor"
                  opacity="0.85"
                />
              </svg>
            </button>

            <div
              className={`absolute right-0 top-[calc(100%+10px)] z-50 w-[min(100vw-2rem,340px)] origin-top-right rounded-[14px] border border-stroke bg-white shadow-xl transition-all duration-200 ease-out ${
                profileOpen ? "pointer-events-auto scale-100 opacity-100" : "pointer-events-none scale-95 opacity-0"
              }`}
            >
              <div className="flex border-b border-stroke p-1">
                {(
                  [
                    ["details", "Details"],
                    ["volunteer", "Become a volunteer"],
                    ["settings", "Setting"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setProfileTab(id)}
                    className={`flex-1 rounded-[10px] px-2 py-2 text-center text-xs font-semibold transition-colors duration-200 md:text-sm ${
                      profileTab === id ? "bg-secondary text-primary" : "text-text-secondary hover:bg-card"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="p-4 text-sm">
                {profileTab === "details" && (
                  <div className="space-y-3 animate-fade-slide-in">
                    <p className="text-text-secondary">Signed in as</p>
                    <p className="font-medium text-secondary">{email}</p>
                    <Link
                      href="/auth"
                      className="inline-flex rounded-full border border-stroke px-4 py-2 text-sm font-semibold text-secondary transition-colors hover:bg-card"
                      onClick={() => setProfileOpen(false)}
                    >
                      Edit profile
                    </Link>
                  </div>
                )}
                {profileTab === "volunteer" && (
                  <div className="space-y-3 animate-fade-slide-in">
                    <p className="text-text-secondary">
                      Volunteers help verify issues and support local projects. Tell us how you would like to contribute.
                    </p>
                    <Button
                      type="button"
                      variant="joinNow"
                      className="w-full !py-2.5 !text-sm"
                      onClick={() => {
                        setProfileOpen(false);
                        router.push("/auth");
                      }}
                    >
                      Start volunteer form
                    </Button>
                  </div>
                )}
                {profileTab === "settings" && (
                  <div className="space-y-3 animate-fade-slide-in">
                    <p className="text-text-secondary">Session and notifications (demo).</p>
                    <button
                      type="button"
                      onClick={() => {
                        setProfileOpen(false);
                        void logout();
                      }}
                      className="w-full rounded-[12px] border border-stroke py-2.5 text-sm font-semibold text-secondary transition-colors hover:bg-card"
                    >
                      Log out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
