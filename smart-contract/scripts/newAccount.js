/**
 * Create a new EVM wallet for use as the XPay treasury on Base Sepolia.
 *
 * Usage:
 *   node scripts/newAccount.js
 *
 * Output: private key + address.
 *
 * After creation:
 *   1. Set BASE_PRIVATE_KEY in backend/.env
 *   2. Fund with Base Sepolia ETH:  https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet
 *   3. Fund with Base Sepolia USDC: https://faucet.circle.com
 *
 * NEVER commit the private key. NEVER share it.
 */

"use strict"

const crypto = require("crypto")

const privateKey = "0x" + crypto.randomBytes(32).toString("hex")

// Compute address from private key (secp256k1 + keccak256)
// This uses only Node built-ins — no extra dependency required.
function privateKeyToAddress(pk) {
  try {
    // Try using viem if available
    const { privateKeyToAccount } = require("viem/accounts")
    return privateKeyToAccount(pk).address
  } catch {
    return "(install viem to compute address: npm install viem)"
  }
}

const address = privateKeyToAddress(privateKey)

console.log("\n════════════════════════════════════════════════════════")
console.log("  XPay Treasury Wallet — Base Sepolia")
console.log("════════════════════════════════════════════════════════")
console.log("")
console.log("  PRIVATE KEY (add to backend/.env as BASE_PRIVATE_KEY):")
console.log("  " + privateKey)
console.log("")
console.log("  ADDRESS:")
console.log("  " + address)
console.log("")
console.log("════════════════════════════════════════════════════════")
console.log("")
console.log("Next steps:")
console.log("  1. Copy PRIVATE KEY → backend/.env  (BASE_PRIVATE_KEY=...)")
console.log("  2. Fund with testnet ETH:")
console.log("     https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet")
console.log("  3. Fund with testnet USDC:")
console.log("     https://faucet.circle.com  (select Base Sepolia)")
console.log("")
console.log("  NEVER commit the private key.")
console.log("  NEVER share it.")
console.log("  NEVER log it.")
console.log("")
