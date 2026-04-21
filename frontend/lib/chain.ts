import { createPublicClient, fallback, http } from "viem";
import { baseSepolia } from "viem/chains";

/**
 * Base Sepolia (84532). RPC/bundler/paymaster URLs use Alchemy’s `base-sepolia` host.
 * In Alchemy Dashboard, enable the Base Sepolia network for this API key; paymaster policy (if any) must target Base Sepolia.
 */
export const appChain = baseSepolia;

export const APP_CHAIN_ID = appChain.id;

export const APP_CHAIN_NAME = "Base Sepolia";

/** Public Base Sepolia RPC — allows browser reads when Alchemy is blocked by CORS. */
export const BASE_SEPOLIA_PUBLIC_RPC = "https://sepolia.base.org";

function alchemyKey(): string | undefined {
  const k = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY || process.env.ALCHEMY_API_KEY;
  return k && k.length > 0 ? k : undefined;
}

/** Direct JSON-RPC URL (server, scripts, or bundler). Prefer {@link getAppChainReadRpcUrl} in the browser. */
export function getAppChainRpcUrl(): string {
  const key = alchemyKey();
  return key ? `https://base-sepolia.g.alchemy.com/v2/${key}` : BASE_SEPOLIA_PUBLIC_RPC;
}

/**
 * JSON-RPC URL for **browser** reads. Alchemy’s host often rejects browser calls (no CORS), so we use a
 * same-origin Next route that proxies to Alchemy (or Base public RPC), with {@link createAppChainPublicReadClient} fallback.
 */
export function getAppChainReadRpcUrl(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/api/rpc/base-sepolia`;
  }
  return getAppChainRpcUrl();
}

/** Public client for ERC-20 / chain reads from the app UI (CORS-safe + resilient). */
export function createAppChainPublicReadClient() {
  return createPublicClient({
    chain: appChain,
    transport: fallback([
      http(getAppChainReadRpcUrl(), { timeout: 30_000 }),
      http(BASE_SEPOLIA_PUBLIC_RPC, { timeout: 30_000 }),
    ]),
  });
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
