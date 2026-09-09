/**
 * Deterministic user wallet address derivation.
 *
 * Each XPay user gets a unique Base Sepolia deposit address derived from:
 *   HMAC-SHA256(BASE_PRIVATE_KEY, "xpay-deposit:" + userId + ":" + chainId)
 *
 * The resulting 32-byte secret is used as a private key → EVM address.
 * This means:
 *   - Every user has a unique, real EVM address (not random junk)
 *   - The address can be re-derived at any time from the treasury key + userId
 *   - No separate mnemonic/seed is needed
 *   - Treasury private key is the single root secret
 *
 * IMPORTANT: The treasury wallet (BASE_PRIVATE_KEY directly) is used to SIGN
 * outbound USDC transfers. User deposit addresses are only used as destinations
 * for incoming deposits — the treasury sweeps them via the treasury signer.
 */

import { createHmac } from "node:crypto"
import { privateKeyToAccount } from "viem/accounts"
import { config } from "../config.js"

/**
 * Derive a deterministic EVM address for a user's deposit wallet.
 *
 * @param userId - The XPay user ID (e.g. "u_abc123")
 * @param chainId - The EIP-155 chain ID (e.g. 84532 for Base Sepolia)
 * @returns A 0x-prefixed EVM address (lowercase)
 */
export function deriveUserWalletAddress(userId: string, chainId: number): string {
  const treasuryKey = config.BASE_PRIVATE_KEY
  // Normalise the key: strip 0x prefix for the HMAC input
  const keyBytes = treasuryKey.startsWith("0x")
    ? Buffer.from(treasuryKey.slice(2), "hex")
    : Buffer.from(treasuryKey, "hex")

  // Derivation path: domain-separated so it can't collide with other usages
  const message = `xpay-deposit:${userId}:${chainId}`

  // HMAC-SHA256 produces 32 bytes — exactly a valid secp256k1 private key
  const childKey = createHmac("sha256", keyBytes).update(message).digest("hex")

  const account = privateKeyToAccount(`0x${childKey}`)
  return account.address.toLowerCase()
}

/**
 * Derive the private key for a user's deposit wallet.
 * Used internally by the treasury sweep logic to sign transactions from
 * a deposit address back to the treasury.
 *
 * NEVER expose this to the frontend or logs.
 */
export function deriveUserWalletPrivateKey(userId: string, chainId: number): `0x${string}` {
  const treasuryKey = config.BASE_PRIVATE_KEY
  const keyBytes = treasuryKey.startsWith("0x")
    ? Buffer.from(treasuryKey.slice(2), "hex")
    : Buffer.from(treasuryKey, "hex")

  const message = `xpay-deposit:${userId}:${chainId}`
  const childKey = createHmac("sha256", keyBytes).update(message).digest("hex")
  return `0x${childKey}`
}
