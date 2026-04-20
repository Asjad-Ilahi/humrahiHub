const { generatePrivateKey, privateKeyToAccount } = require("viem/accounts");
const { encryptPrivateKeyHex } = require("./issueSignerCrypto");

/**
 * Creates a dedicated EOA per issue to receive native ETH on Base Sepolia (issue “fund wallet”).
 * Column name `smart_wallet_address` is historical; this is not a Privy/Coinbase smart contract wallet.
 * Private key is stored encrypted in DB — gas top-ups and withdrawals use operational tooling.
 */
function createIssueVaultCredentials() {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  const signer_encrypted_payload = encryptPrivateKeyHex(privateKey);
  return {
    smart_wallet_address: account.address,
    signer_encrypted_payload,
  };
}

module.exports = { createIssueVaultCredentials };
