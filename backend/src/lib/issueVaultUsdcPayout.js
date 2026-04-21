const crypto = require("crypto");
const { createWalletClient, createPublicClient, http, getAddress, hexToSignature } = require("viem");
const { privateKeyToAccount, signTypedData } = require("viem/accounts");
const { baseSepolia } = require("viem/chains");
const { decryptPrivateKeyHex } = require("./issueSignerCrypto");
const { USDC_BASE_SEPOLIA } = require("./verifyBaseSepoliaUsdcTransfer");

const erc20TransferAbi = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
];

const transferWithAuthorizationAbi = [
  {
    type: "function",
    name: "transferWithAuthorization",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
    ],
    outputs: [],
  },
];

const usdcNameAbi = [
  {
    type: "function",
    name: "name",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
];

function rpcUrl() {
  const u = String(process.env.BASE_SEPOLIA_RPC_URL || "").trim();
  return u.length > 0 ? u : "https://sepolia.base.org";
}

function relayerPrivateKey() {
  const k = String(process.env.PAYOUT_RELAYER_PRIVATE_KEY || "").trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(k)) return null;
  return /** @type {`0x${string}`} */ (k);
}

/** @type {{ name: string; version: string } | null} */
let cachedUsdcEip712 = null;

async function getUsdcEip712DomainMeta() {
  if (cachedUsdcEip712) return cachedUsdcEip712;
  const envName = String(process.env.USDC_EIP712_NAME || "").trim();
  const envVersion = String(process.env.USDC_EIP712_VERSION || "").trim();
  if (envName && envVersion) {
    cachedUsdcEip712 = { name: envName, version: envVersion };
    return cachedUsdcEip712;
  }
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl(), { timeout: 30_000 }),
  });
  let name = envName;
  if (!name) {
    try {
      name = await publicClient.readContract({
        address: USDC_BASE_SEPOLIA,
        abi: usdcNameAbi,
        functionName: "name",
      });
    } catch {
      name = "USDC";
    }
  }
  const version = envVersion || "2";
  cachedUsdcEip712 = { name, version };
  return cachedUsdcEip712;
}

/**
 * USDC on Base Sepolia has 6 decimals. Backend records USD in integer cents.
 * 1 cent on-chain = 10_000 smallest units (same convention as verifyBaseSepoliaUsdcTransfer).
 * @param {number} usdCents
 * @returns {bigint}
 */
function usdCentsToUsdcUnits(usdCents) {
  const c = Math.floor(Number(usdCents));
  if (!Number.isFinite(c) || c < 1) return 0n;
  return BigInt(c) * 10000n;
}

/**
 * Gasless for the vault: vault signs EIP-3009; relayer pays ETH gas.
 * Set `PAYOUT_RELAYER_PRIVATE_KEY` (0x + 64 hex) on the backend — fund that address with Base Sepolia ETH only.
 * The issue vault still holds USDC; it does not need native ETH when this path is used.
 */
async function sendUsdcViaRelayerAuthorization({ vaultPk, vaultAddress, toAddress, usdCents, relayerPk }) {
  const vault = getAddress(vaultAddress);
  const to = getAddress(toAddress);
  const vaultAccount = privateKeyToAccount(vaultPk);
  if (vaultAccount.address.toLowerCase() !== vault.toLowerCase()) {
    return { ok: false, error: "Issue vault signer does not match smart_wallet_address on file." };
  }
  const amount = usdCentsToUsdcUnits(usdCents);
  if (amount <= 0n) {
    return { ok: false, error: "Payout amount is too small." };
  }

  const { name, version } = await getUsdcEip712DomainMeta();
  const nowSec = BigInt(Math.floor(Date.now() / 1000));
  const validAfter = 0n;
  const validBefore = nowSec + 3600n;
  const nonce = /** @type {`0x${string}`} */ (`0x${crypto.randomBytes(32).toString("hex")}`);

  const domain = {
    name,
    version,
    chainId: baseSepolia.id,
    verifyingContract: USDC_BASE_SEPOLIA,
  };

  const types = {
    TransferWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ],
  };

  const message = {
    from: vault,
    to,
    value: amount,
    validAfter,
    validBefore,
    nonce,
  };

  const signature = await signTypedData({
    privateKey: vaultPk,
    domain,
    types,
    primaryType: "TransferWithAuthorization",
    message,
  });

  const { v, r, s } = hexToSignature(signature);
  let v27 = Number(v);
  if (v27 === 0 || v27 === 1) v27 += 27;

  const relayerAccount = privateKeyToAccount(relayerPk);
  const transport = http(rpcUrl(), { timeout: 120_000 });
  const publicClient = createPublicClient({ chain: baseSepolia, transport });
  const relayerClient = createWalletClient({
    account: relayerAccount,
    chain: baseSepolia,
    transport,
  });

  // Avoid bad eth_estimateGas responses (e.g. bogus huge limits) by using a successful simulation.
  const { request } = await publicClient.simulateContract({
    address: USDC_BASE_SEPOLIA,
    abi: transferWithAuthorizationAbi,
    functionName: "transferWithAuthorization",
    args: [vault, to, amount, validAfter, validBefore, nonce, v27, r, s],
    account: relayerAccount,
  });

  const cap = 500_000n;
  const gas =
    request.gas != null && request.gas > 0n && request.gas <= cap ? request.gas : 280_000n;

  const hash = await relayerClient.writeContract({ ...request, gas });

  return { ok: true, txHash: hash };
}

/**
 * Sends USDC from the per-issue vault EOA to a recipient.
 *
 * If `PAYOUT_RELAYER_PRIVATE_KEY` is set in `backend/.env`, uses EIP-3009 `transferWithAuthorization`:
 * the vault only signs; the relayer pays Base Sepolia ETH for gas. Fund the relayer with test ETH, not each vault.
 *
 * Otherwise falls back to `transfer` from the vault (vault must hold ETH for gas).
 *
 * @param {object} p
 * @param {string} p.signerEncryptedPayload
 * @param {string} p.vaultAddress checksummed or raw
 * @param {string} p.toAddress worker smart wallet
 * @param {number} p.usdCents whole USD cents (>=1)
 * @returns {Promise<{ ok: true, txHash: `0x${string}` } | { ok: false, error: string }>}
 */
async function sendUsdcFromIssueVault({ signerEncryptedPayload, vaultAddress, toAddress, usdCents }) {
  try {
    const pk = decryptPrivateKeyHex(signerEncryptedPayload);
    const vault = getAddress(vaultAddress);
    const to = getAddress(toAddress);
    const account = privateKeyToAccount(pk);
    if (account.address.toLowerCase() !== vault.toLowerCase()) {
      return { ok: false, error: "Issue vault signer does not match smart_wallet_address on file." };
    }
    const amount = usdCentsToUsdcUnits(usdCents);
    if (amount <= 0n) {
      return { ok: false, error: "Payout amount is too small." };
    }

    const relayerPk = relayerPrivateKey();
    if (relayerPk) {
      return await sendUsdcViaRelayerAuthorization({
        vaultPk: pk,
        vaultAddress,
        toAddress,
        usdCents,
        relayerPk,
      });
    }

    const transport = http(rpcUrl(), { timeout: 120_000 });
    const publicClient = createPublicClient({ chain: baseSepolia, transport });
    const walletClient = createWalletClient({
      account,
      chain: baseSepolia,
      transport,
    });

    const { request } = await publicClient.simulateContract({
      address: USDC_BASE_SEPOLIA,
      abi: erc20TransferAbi,
      functionName: "transfer",
      args: [to, amount],
      account,
    });
    const cap = 500_000n;
    const gas =
      request.gas != null && request.gas > 0n && request.gas <= cap ? request.gas : 120_000n;
    const hash = await walletClient.writeContract({ ...request, gas });

    return { ok: true, txHash: hash };
  } catch (e) {
    const msg = e?.shortMessage || e?.message || String(e);
    const relayerHint =
      !relayerPrivateKey() && (msg.includes("gas") || msg.includes("funds") || msg.includes("allowance"))
        ? " Set PAYOUT_RELAYER_PRIVATE_KEY (funded with Base Sepolia ETH) so the vault does not pay gas — see backend/.env.example."
        : "";
    return {
      ok: false,
      error:
        msg.includes("insufficient funds") || msg.includes("insufficient balance")
          ? `Vault wallet needs Base Sepolia ETH for gas (and USDC for the transfer).${relayerHint}`.trim()
          : `${msg}${relayerHint}`.trim(),
    };
  }
}

module.exports = { sendUsdcFromIssueVault, usdCentsToUsdcUnits };
