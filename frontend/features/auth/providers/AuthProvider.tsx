"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { SmartWalletsProvider } from "@privy-io/react-auth/smart-wallets";
import type { ReactNode } from "react";
import { appChain, getAlchemyBundlerHttpUrl, getAlchemyPaymasterHttpUrl } from "@/lib/chain";

const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
const paymasterPolicyId = process.env.NEXT_PUBLIC_PAYMASTER_POLICY_ID;

const bundlerUrl = getAlchemyBundlerHttpUrl();
const paymasterUrl = getAlchemyPaymasterHttpUrl();

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
