import type { User } from "@privy-io/react-auth";
import { APP_CHAIN_ID } from "@/lib/chain";

/** Content-based key so effects do not re-run on every new `user` object reference from Privy. */
export function stablePrivyWalletLinkedJson(user: User | null | undefined): string {
  const accounts = user?.linkedAccounts ?? [];
  const rows = accounts
    .map((a) => ({
      type: a.type,
      addr: "address" in a && typeof a.address === "string" ? a.address.toLowerCase() : "",
    }))
    .sort((x, y) => `${x.type}:${x.addr}`.localeCompare(`${y.type}:${y.addr}`));
  return JSON.stringify(rows);
}

export function smartWalletAddressFromUserRoot(user: User | null | undefined): string {
  const record = user as unknown as { smartWallet?: { address?: string } };
  const a = record.smartWallet?.address;
  return typeof a === "string" && a.startsWith("0x") ? a : "";
}

export function readEmbeddedWalletAddress(user: User | null | undefined): string | null {
  if (!user) return null;
  const embedded = user.wallet?.address;
  if (embedded) return embedded;
  const linked = user.linkedAccounts?.find((a) => a.type === "wallet");
  if (linked && "address" in linked && typeof linked.address === "string") {
    return linked.address;
  }
  return null;
}

export function readLinkedSmartWalletAddress(user: User | null | undefined): string | null {
  if (!user) return null;
  const accounts = user.linkedAccounts?.filter((a) => a.type === "smart_wallet") ?? [];
  for (const linked of accounts) {
    if ("address" in linked && typeof linked.address === "string" && linked.address.length > 0) {
      return linked.address;
    }
  }
  return null;
}

export function readSmartWalletFromUserRecord(user: User | null | undefined): string | null {
  if (!user) return null;
  const fromLinked = readLinkedSmartWalletAddress(user);
  if (fromLinked) return fromLinked;
  const record = user as unknown as { smartWallet?: { address?: string } };
  if (record.smartWallet?.address) return record.smartWallet.address;
  return null;
}

function readOptimisticSmartAccountAddress(
  client: { account?: { address?: string } } | undefined | null
): string | null {
  const addr = client?.account?.address;
  return typeof addr === "string" && addr.length > 0 ? addr : null;
}

export function optimisticAddressFromSmartClient(client: unknown): string | null {
  const fromAccount = readOptimisticSmartAccountAddress(client as { account?: { address?: string } } | undefined);
  if (fromAccount) return fromAccount;
  if (client && typeof client === "object" && "address" in client) {
    const a = (client as { address?: unknown }).address;
    if (typeof a === "string" && a.startsWith("0x") && a.length >= 42) return a;
  }
  return null;
}

/** When `useSmartWallets().client` is still undefined, Privy often still serves a per-chain client. */
export async function resolveSmartWalletClientForReads(
  smartWalletClient: unknown,
  getClientForChain: (args: { id: number }) => Promise<unknown | undefined>
): Promise<unknown> {
  if (optimisticAddressFromSmartClient(smartWalletClient)) return smartWalletClient;
  const tryChain = async () => {
    try {
      const forChain = await getClientForChain({ id: APP_CHAIN_ID });
      if (forChain && optimisticAddressFromSmartClient(forChain)) return forChain;
    } catch {
      /* ignore */
    }
    return null;
  };
  const first = await tryChain();
  if (first) return first;
  await new Promise((r) => setTimeout(r, 450));
  const second = await tryChain();
  if (second) return second;
  return smartWalletClient;
}

/**
 * Address that holds USDC on Base Sepolia for the connected user.
 * Prefer the smart-wallet client (often ready before linkedAccounts); then linked / record; then EOA.
 */
export function readSmartWalletAddressForBalance(
  user: User | null | undefined,
  smartWalletClient: unknown
): string | null {
  const optimistic = optimisticAddressFromSmartClient(smartWalletClient);
  if (optimistic) return optimistic;
  const fromRecord = readSmartWalletFromUserRecord(user);
  if (fromRecord) return fromRecord;
  return readEmbeddedWalletAddress(user);
}
