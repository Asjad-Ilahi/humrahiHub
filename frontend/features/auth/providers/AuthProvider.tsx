"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { SmartWalletsProvider } from "@privy-io/react-auth/smart-wallets";
import type { ReactNode } from "react";
import { appChain, getAlchemyBundlerHttpUrl } from "@/lib/chain";

const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
const paymasterPolicyId = String(process.env.NEXT_PUBLIC_PAYMASTER_POLICY_ID ?? "").trim();

const bundlerUrl = getAlchemyBundlerHttpUrl();

/**
 * Absolute origin for same-origin paymaster proxy (Privy → `/api/alchemy/paymaster` → Base Sepolia).
 * Set `NEXT_PUBLIC_APP_URL` in production if not on Vercel. Local dev defaults to localhost:3000.
 */
function resolveAppOrigin(): string {
  const u = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (u) return u.replace(/\/$/, "");
  const v = process.env.VERCEL_URL?.trim();
  if (v) return `https://${v.replace(/^https?:\/\//, "")}`;
  return "http://localhost:3000";
}

const paymasterProxyUrl = `${resolveAppOrigin()}/api/alchemy/paymaster`;

/** Gas sponsorship: policy id + bundler + proxy route (avoids Privy dashboard `base-mainnet` paymaster URLs). */
const alchemyPaymasterEnabled =
  process.env.NEXT_PUBLIC_ALCHEMY_PAYMASTER_ENABLED !== "false" && Boolean(paymasterPolicyId && bundlerUrl);

type Props = {
  children: ReactNode;
};

export default function AuthProvider({ children }: Props) {
  if (!privyAppId) {
    throw new Error("Missing NEXT_PUBLIC_PRIVY_APP_ID.");
  }

  return (
    <PrivyProvider
      appId={privyAppId}
      config={{
        loginMethods: ["google", "email"],
        supportedChains: [appChain],
        defaultChain: appChain,
        embeddedWallets: {
          ethereum: {
            createOnLogin: "users-without-wallets",
          },
          showWalletUIs: true,
        },
        appearance: {
          theme: "light",
          accentColor: "#AFFF6F",
          logo: "/logo.png",
        },
        smartWallets: {
          enabled: true,
          smartWalletType: "coinbase_smart_wallet",
          configuredNetworks: bundlerUrl
            ? [
                {
                  chainId: `eip155:${appChain.id}`,
                  bundlerUrl,
                  ...(alchemyPaymasterEnabled
                    ? {
                        paymasterUrl: paymasterProxyUrl,
                        paymasterContext: { policyId: paymasterPolicyId },
                      }
                    : {}),
                },
              ]
            : [],
        },
      } as never}
    >
      <SmartWalletsProvider
        config={
          alchemyPaymasterEnabled
            ? {
                paymasterContext: { policyId: paymasterPolicyId },
              }
            : undefined
        }
      >
        {children}
      </SmartWalletsProvider>
    </PrivyProvider>
  );
}
