import { randomBytes } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import { db } from "../db/index.js"
import { mockBalances } from "../db/schema.js"
import type { ChainAdapter, DepositEvent, TransferOutcome } from "./adapter.js"

/**
 * MockChain: a blockchain simulated entirely in Postgres.
 *
 * Exists so the whole product — signup, transfers, payouts — can be exercised
 * without any RPC connection, private keys, or testnet USDC. It enforces the
 * same rules a real EVM chain does (positive amounts, sufficient balance).
 *
 * What it cannot produce is a transaction anyone else can verify. The "View on
 * BaseScan" link in the UI is meaningful only when using the real adapter.
 * Under this adapter it generates a plausible-looking hash for UI testing.
 * That is the reason to keep it temporary.
 */
export class MockChain implements ChainAdapter {
  readonly kind = "mock" as const
  readonly chainId = 84532 // Base Sepolia

  canReceive(address: string): boolean {
    // Any valid 0x-prefixed 40-hex EVM address can receive
    return /^0x[0-9a-fA-F]{40}$/.test(address)
  }

  async balanceOf(address: string): Promise<bigint> {
    const [row] = await db
      .select({ amount: mockBalances.amount })
      .from(mockBalances)
      .where(eq(mockBalances.address, address.toLowerCase()))
    return row?.amount ?? 0n
  }

  async mint(toAddress: string, amount: bigint): Promise<TransferOutcome> {
    if (!this.canReceive(toAddress)) {
      throw new Error(`${toAddress} is not a valid EVM address`)
    }
    if (amount <= 0n) throw new Error("mint amount must be positive")

    const addr = toAddress.toLowerCase()
    await db
      .insert(mockBalances)
      .values({ address: addr, amount })
      .onConflictDoUpdate({
        target: mockBalances.address,
        set: { amount: sql`${mockBalances.amount} + ${amount}` },
      })

    return { txHash: fakeTxHash(), confirmed: true, chainId: this.chainId }
  }

  async transfer(params: {
    fromAddress: string
    toAddress: string
    amount: bigint
    confirmBudgetMs: number
  }): Promise<TransferOutcome> {
    const { fromAddress, toAddress, amount } = params

    if (amount <= 0n) throw new Error("transfer amount must be positive")
    if (!this.canReceive(toAddress)) {
      throw new Error(`${toAddress} is not a valid EVM address`)
    }

    const from = fromAddress.toLowerCase()
    const to = toAddress.toLowerCase()

    await db.transaction(async (tx) => {
      // Atomic debit: the WHERE clause is what makes the balance check atomic.
      // A read-then-write would let two concurrent sends both pass the check.
      const debited = await tx
        .update(mockBalances)
        .set({ amount: sql`${mockBalances.amount} - ${amount}` })
        .where(sql`${mockBalances.address} = ${from} and ${mockBalances.amount} >= ${amount}`)
        .returning({ address: mockBalances.address })

      if (debited.length === 0) throw new InsufficientFunds()

      await tx
        .insert(mockBalances)
        .values({ address: to, amount })
        .onConflictDoUpdate({
          target: mockBalances.address,
          set: { amount: sql`${mockBalances.amount} + ${amount}` },
        })
    })

    return { txHash: fakeTxHash(), confirmed: true, chainId: this.chainId }
  }

  async verifyTransfer(params: {
    txHash: string
    expectedTo: string
    expectedAmount: bigint
    requiredConfirmations?: number
  }): Promise<{ valid: boolean; confirmed: boolean; confirmations: number }> {
    // In the mock, all fake hashes are considered valid and confirmed.
    const isMockHash = /^0x[0-9a-f]{64}$/.test(params.txHash)
    return {
      valid: isMockHash,
      confirmed: isMockHash,
      confirmations: isMockHash ? 12 : 0,
    }
  }

  /**
   * Mock deposits happen via mint() in tests — there are no real on-chain events
   * to scan. Returns an empty array so the DepositScanner loop is a no-op.
   */
  async scanDeposits(_params: {
    fromBlock: bigint
    toBlock: bigint
    watchedAddresses: Set<string>
  }): Promise<DepositEvent[]> {
    return []
  }

  /** Mock block number advances monotonically using Date.now(). */
  async currentBlock(): Promise<bigint> {
    return BigInt(Math.floor(Date.now() / 1000))
  }
}

export class InsufficientFunds extends Error {
  constructor() {
    super("insufficient funds")
    this.name = "InsufficientFunds"
  }
}

function fakeTxHash(): string {
  return `0x${randomBytes(32).toString("hex")}`
}
