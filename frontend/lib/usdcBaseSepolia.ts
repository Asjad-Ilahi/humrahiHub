import type { PublicClient } from "viem";
import { encodeFunctionData, formatUnits, getAddress, parseUnits } from "viem";

/**
 * Circle USDC on Base Sepolia (chain 84532).
 * @see https://developers.circle.com/stablecoins/usdc-contract-addresses
 *
 * Note: An older/incorrect constant (`…7927321ec2312B14dce8`) fails EIP-55 checks in viem and breaks `readContract`.
 */
export const USDC_BASE_SEPOLIA = getAddress("0x036cbd53842c5426634e7929541ec2318f3dcf7e");

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
