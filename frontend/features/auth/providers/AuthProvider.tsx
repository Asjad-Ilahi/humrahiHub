"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { SmartWalletsProvider } from "@privy-io/react-auth/smart-wallets";
import { base } from "viem/chains";
import type { ReactNode } from "react";

const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
const alchemyApiKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
const paymasterPolicyId = process.env.NEXT_PUBLIC_PAYMASTER_POLICY_ID;

const bundlerUrl = alchemyApiKey ? `https://base-mainnet.g.alchemy.com/v2/${alchemyApiKey}` : undefined;
const paymasterUrl = alchemyApiKey ? `https://base-mainnet.g.alchemy.com/paymaster/v2/${alchemyApiKey}` : undefined;

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
        supportedChains: [base],
        defaultChain: base,
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
                  chainId: `eip155:${base.id}`,
                  bundlerUrl,
                  ...(paymasterUrl
                    ? {
                        paymasterUrl,
                        paymasterContext: paymasterPolicyId ? { policyId: paymasterPolicyId } : undefined,
                      }
                    : {}),
                },
              ]
            : [],
        },
      } as never}
    >
      <SmartWalletsProvider
        config={{
          paymasterContext: paymasterPolicyId ? { policyId: paymasterPolicyId } : undefined,
        }}
      >
        {children}
      </SmartWalletsProvider>
    </PrivyProvider>
  );
}
