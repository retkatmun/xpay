import { isTest, config } from "../config.js"
import type { ChainAdapter } from "./adapter.js"

let instance: ChainAdapter | null = null

/**
 * Returns the chain adapter for this process.
 *
 * Production:              BaseSepoliaChain (requires BASE_RPC_URL, BASE_PRIVATE_KEY)
 * Tests (NODE_ENV=test):   MockChain
 * Development (USE_MOCK_CHAIN=true): MockChain — allows dev/fund and transfers
 *                          without a funded treasury wallet or RPC connection.
 */
export async function chain(): Promise<ChainAdapter> {
  if (instance) return instance

  if (isTest || config.USE_MOCK_CHAIN) {
    const { MockChain } = await import("./mock.js")
    instance = new MockChain()
  } else {
    const { BaseSepoliaChain } = await import("./baseSepolia.js")
    const adapter = new BaseSepoliaChain()
    // Validate the RPC actually serves Base Sepolia before accepting traffic
    await adapter.validateNetwork()
    instance = adapter
  }

  return instance
}

/** Reset the singleton — used in tests only. */
export function resetChain(): void {
  instance = null
}

export type { ChainAdapter, TransferOutcome } from "./adapter.js"
