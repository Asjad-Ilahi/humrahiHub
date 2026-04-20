import type { PublicClient } from "viem";
import { encodeFunctionData, formatUnits, parseUnits } from "viem";

/** Circle USDC on Base Sepolia (testnet). */
export const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7927321ec2312B14dce8" as const;

const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

export async function readUsdcBalance(client: Pick<PublicClient, "readContract">, holder: `0x${string}`): Promise<bigint> {
  return client.readContract({
    address: USDC_BASE_SEPOLIA,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [holder],
  });
}

export function formatUsdcUnits(units: bigint): string {
  return formatUnits(units, 6);
}

export function encodeUsdcTransfer(to: `0x${string}`, amountHuman: string): `0x${string}` {
  const amount = parseUnits(amountHuman.replace(",", "."), 6);
  return encodeFunctionData({
    abi: erc20Abi,
    functionName: "transfer",
    args: [to, amount],
  });
}
