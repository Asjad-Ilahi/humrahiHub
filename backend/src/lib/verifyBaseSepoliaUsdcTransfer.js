const { createPublicClient, http, getAddress, decodeEventLog } = require("viem");
const { baseSepolia } = require("viem/chains");

const USDC_BASE_SEPOLIA = getAddress("0x036cbd53842c5426634e7929541ec2318f3dcf7e");

const erc20Abi = [
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
];

function rpcUrl() {
  const u = String(process.env.BASE_SEPOLIA_RPC_URL || "").trim();
  return u.length > 0 ? u : "https://sepolia.base.org";
}

/**
 * @param {`0x${string}`} txHash
 * @param {string} vaultAddress checksummed or raw
 * @returns {Promise<{ from: `0x${string}`; value: bigint } | null>}
 */
async function fetchUsdcTransferToVault(txHash, vaultAddress) {
  const client = createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl(), { timeout: 90_000 }),
  });
  const receipt = await client.getTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") return null;
  const vault = getAddress(vaultAddress);
  for (const log of receipt.logs) {
    try {
      if (getAddress(log.address) !== USDC_BASE_SEPOLIA) continue;
      const decoded = decodeEventLog({
        abi: erc20Abi,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName !== "Transfer") continue;
      const to = getAddress(decoded.args.to);
      if (to !== vault) continue;
      return {
        from: getAddress(decoded.args.from),
        value: decoded.args.value,
      };
    } catch {
      /* ignore non-transfer logs */
    }
  }
  return null;
}

module.exports = { fetchUsdcTransferToVault, USDC_BASE_SEPOLIA };
