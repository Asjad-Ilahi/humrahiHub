import { baseSepolia } from "viem/chains";

/**
 * Base Sepolia (84532). RPC/bundler/paymaster URLs use Alchemy’s `base-sepolia` host.
 * In Alchemy Dashboard, enable the Base Sepolia network for this API key; paymaster policy (if any) must target Base Sepolia.
 */
export const appChain = baseSepolia;

export const APP_CHAIN_ID = appChain.id;

export const APP_CHAIN_NAME = "Base Sepolia";

function alchemyKey(): string | undefined {
  const k = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
  return k && k.length > 0 ? k : undefined;
}

/** JSON-RPC for reads (balance, etc.). */
export function getAppChainRpcUrl(): string {
  const key = alchemyKey();
  return key ? `https://base-sepolia.g.alchemy.com/v2/${key}` : "https://sepolia.base.org";
}

/** Alchemy bundler base (append /v2/{key} is same host as RPC for many accounts APIs). */
export function getAlchemyBundlerHttpUrl(): string | undefined {
  const key = alchemyKey();
  return key ? `https://base-sepolia.g.alchemy.com/v2/${key}` : undefined;
}

export function getAlchemyPaymasterHttpUrl(): string | undefined {
  const key = alchemyKey();
  return key ? `https://base-sepolia.g.alchemy.com/paymaster/v2/${key}` : undefined;
}
