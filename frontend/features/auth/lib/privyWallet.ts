import type { User } from "@privy-io/react-auth";

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
  const linked = user.linkedAccounts?.find((a) => a.type === "smart_wallet");
  if (linked && "address" in linked && typeof linked.address === "string") {
    return linked.address;
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
  return readOptimisticSmartAccountAddress(client as { account?: { address?: string } } | undefined);
}
