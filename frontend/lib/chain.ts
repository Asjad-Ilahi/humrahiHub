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

/**
 * Alchemy gas-manager / paymaster policies are tied to a specific network. If the app uses Base Sepolia
 * but an env or upstream tool pointed bundler/paymaster at `base-mainnet`, `pm_getPaymasterData` fails
 * (wrong policy / chain). Coerce known bad hosts for this chain.
 */
export function normalizeAlchemyUrlForAppChain(url: string): string {
  const u = String(url ?? "").trim();
  if (appChain.id !== baseSepolia.id) return u;
  return u.replace(/https:\/\/base-mainnet\.g\.alchemy\.com/gi, "https://base-sepolia.g.alchemy.com");
}

/** Direct JSON-RPC URL (server, scripts, or bundler). Prefer {@link getAppChainReadRpcUrl} in the browser. */
export function getAppChainRpcUrl(): string {
  const key = alchemyKey();
  return key
    ? normalizeAlchemyUrlForAppChain(`https://base-sepolia.g.alchemy.com/v2/${key}`)
    : BASE_SEPOLIA_PUBLIC_RPC;
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

/** Optional override, e.g. `https://base-sepolia.g.alchemy.com/v2/YOUR_KEY` (see {@link normalizeAlchemyUrlForAppChain}). */
export function getAlchemyBundlerHttpUrl(): string | undefined {
  const override = String(process.env.NEXT_PUBLIC_ALCHEMY_BUNDLER_URL ?? "").trim();
  if (override.length > 0) return normalizeAlchemyUrlForAppChain(override);
  const key = alchemyKey();
  if (!key) return undefined;
  return normalizeAlchemyUrlForAppChain(`https://base-sepolia.g.alchemy.com/v2/${key}`);
}

/** Optional override, e.g. `https://base-sepolia.g.alchemy.com/paymaster/v2/YOUR_KEY`. */
export function getAlchemyPaymasterHttpUrl(): string | undefined {
  const override = String(process.env.NEXT_PUBLIC_ALCHEMY_PAYMASTER_URL ?? "").trim();
  if (override.length > 0) return normalizeAlchemyUrlForAppChain(override);
  const key = alchemyKey();
  if (!key) return undefined;
  return normalizeAlchemyUrlForAppChain(`https://base-sepolia.g.alchemy.com/paymaster/v2/${key}`);
}
