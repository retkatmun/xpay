/**
 * Inspect the XPay treasury wallet on Base Sepolia.
 *
 * Usage:
 *   BASE_PRIVATE_KEY=0x... node scripts/inspect.js
 *
 * Shows: wallet address, ETH balance, USDC balance.
 */

"use strict"

const RPC_URL = process.env.BASE_RPC_URL || "https://sepolia.base.org"
const USDC_ADDRESS = process.env.USDC_ADDRESS || "0x036CbD53842c5426634e7929541eC2318f3dCF7e"

async function rpc(method, params) {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  })
  const json = await res.json()
  if (json.error) throw new Error(json.error.message)
  return json.result
}

function hexToDecimal(hex) {
  return BigInt(hex)
}

function formatUnits(value, decimals) {
  const divisor = 10n ** BigInt(decimals)
  const whole = value / divisor
  const frac = value % divisor
  return `${whole}.${frac.toString().padStart(decimals, "0").replace(/0+$/, "") || "0"}`
}

// ERC-20 balanceOf call data for an address
function balanceOfCalldata(address) {
  const sig = "0x70a08231" // keccak256("balanceOf(address)")[:4]
  const padded = address.replace("0x", "").padStart(64, "0")
  return sig + padded
}

async function main() {
  let address
  const pk = process.env.BASE_PRIVATE_KEY
  if (pk) {
    try {
      const { privateKeyToAccount } = require("viem/accounts")
      address = privateKeyToAccount(pk.startsWith("0x") ? pk : `0x${pk}`).address
    } catch {
      console.error("Install viem to derive address from key: npm install viem")
      process.exit(1)
    }
  } else {
    address = process.argv[2]
    if (!address) {
      console.error("Usage: BASE_PRIVATE_KEY=0x... node scripts/inspect.js")
      console.error("    or: node scripts/inspect.js 0xYOUR_ADDRESS")
      process.exit(1)
    }
  }

  console.log(`\nInspecting wallet: ${address}`)
  console.log(`RPC:              ${RPC_URL}`)
  console.log(`USDC contract:    ${USDC_ADDRESS}\n`)

  const ethHex = await rpc("eth_getBalance", [address, "latest"])
  const ethBalance = hexToDecimal(ethHex)

  const usdcHex = await rpc("eth_call", [{ to: USDC_ADDRESS, data: balanceOfCalldata(address) }, "latest"])
  const usdcBalance = hexToDecimal(usdcHex)

  console.log(`  ETH  balance: ${formatUnits(ethBalance, 18)} ETH`)
  console.log(`  USDC balance: ${formatUnits(usdcBalance, 6)} USDC`)

  if (ethBalance < 1_000_000_000_000_000n) {
    console.log("\n  ⚠ ETH balance too low for gas. Fund at:")
    console.log("    https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet")
  }
  if (usdcBalance === 0n) {
    console.log("\n  ⚠ USDC balance is 0. Fund at:")
    console.log("    https://faucet.circle.com  (select Base Sepolia)")
  }
  console.log("")
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
