/**
 * DepositScanner — external USDC deposit detection.
 *
 * Polls the chain on an interval, looking for USDC Transfer events directed
 * at any known XPay wallet address.  When a new inbound transfer is found:
 *
 *   1. Insert a transaction record with status "completed" (the USDC is
 *      already in the user's wallet — no further payout needed for a simple
 *      top-up).
 *   2. Advance the scan cursor so the next poll doesn't re-process the same
 *      blocks.
 *
 * Idempotency is enforced by the UNIQUE index on transactions.tx_hash.
 * A duplicate txHash is silently swallowed; the cursor still advances.
 *
 * Only runs on the real chain (base_sepolia).  The mock adapter's scanDeposits
 * is a no-op, so starting the scanner in test/dev is harmless but does nothing.
 */

import { eq } from "drizzle-orm"
import { db } from "../db/index.js"
import {
  walletAccounts,
  transactions,
  depositScanCursors,
} from "../db/schema.js"
import { newId } from "../lib/ids.js"
import { audit } from "./audit.js"
import type { ChainAdapter } from "../chain/adapter.js"
import { config } from "../config.js"

// Scan at most this many blocks per window to avoid hitting RPC getLogs limits.
const BLOCKS_PER_WINDOW = 500n
// How long to wait between polls (ms).
const POLL_INTERVAL_MS = 15_000
// How many blocks behind the chain tip we scan to (avoids re-orgs on very new blocks).
const CONFIRMATION_LAG = 2n

export class DepositScanner {
  private readonly adapter: ChainAdapter
  private running = false
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(adapter: ChainAdapter) {
    this.adapter = adapter
  }

  /** Start the polling loop.  Safe to call multiple times — subsequent calls are no-ops. */
  start(): void {
    if (this.running) return
    this.running = true
    console.log("[DepositScanner] Starting — polling every", POLL_INTERVAL_MS / 1000, "s")
    void this.tick()
  }

  /** Gracefully stop the loop (waits for the current tick to finish). */
  stop(): void {
    this.running = false
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  private scheduleNext(): void {
    if (!this.running) return
    this.timer = setTimeout(() => {
      void this.tick()
    }, POLL_INTERVAL_MS)
  }

  private async tick(): Promise<void> {
    try {
      await this.scan()
    } catch (err) {
      console.error("[DepositScanner] scan error:", err instanceof Error ? err.message : err)
    } finally {
      this.scheduleNext()
    }
  }

  private async scan(): Promise<void> {
    const chainId = this.adapter.chainId

    // ── 1. Determine scan window ────────────────────────────────────────────
    const tipBlock = await this.adapter.currentBlock()
    const safeBlock = tipBlock - CONFIRMATION_LAG

    // Load or initialise the cursor for this chain.
    const [cursor] = await db
      .select()
      .from(depositScanCursors)
      .where(eq(depositScanCursors.chainId, chainId))

    // On first run, start from 50 blocks behind tip (avoids scanning history).
    const fromBlock = cursor
      ? cursor.lastScannedBlock + 1n
      : safeBlock - 50n < 0n ? 0n : safeBlock - 50n

    if (fromBlock > safeBlock) {
      // Already up to date — nothing to do.
      return
    }

    // Clamp window size so a single call can't time out on the RPC.
    const toBlock = fromBlock + BLOCKS_PER_WINDOW - 1n < safeBlock
      ? fromBlock + BLOCKS_PER_WINDOW - 1n
      : safeBlock

    // ── 2. Build the watched-address set ────────────────────────────────────
    const walletRows = await db
      .select({ walletAddress: walletAccounts.walletAddress, userId: walletAccounts.userId })
      .from(walletAccounts)
      .where(eq(walletAccounts.chainId, chainId))

    if (walletRows.length === 0) {
      await this.advanceCursor(chainId, toBlock)
      return
    }

    // Normalise to lowercase so the comparison with log data is case-insensitive.
    const addressToUserId = new Map<string, string>(
      walletRows.map((r) => [r.walletAddress.toLowerCase(), r.userId]),
    )
    const watchedAddresses = new Set(addressToUserId.keys())

    // ── 3. Fetch on-chain Transfer events ───────────────────────────────────
    const events = await this.adapter.scanDeposits({ fromBlock, toBlock, watchedAddresses })

    // ── 4. Credit each deposit ──────────────────────────────────────────────
    for (const event of events) {
      const userId = addressToUserId.get(event.toAddress.toLowerCase())
      if (!userId) continue

      // Skip transfers from the treasury itself (those are internal XPay transfers,
      // already recorded by the transaction service).
      const isTreasurySource =
        this.adapter.kind === "base_sepolia" &&
        event.fromAddress.toLowerCase() ===
          (this.adapter as import("../chain/baseSepolia.js").BaseSepoliaChain)
            .treasuryWalletAddress.toLowerCase()

      if (isTreasurySource) continue

      // Idempotency: skip if this txHash is already recorded.
      const existing = await db
        .select({ id: transactions.id })
        .from(transactions)
        .where(eq(transactions.txHash, event.txHash))
      if (existing.length > 0) continue

      const txId = newId("tx")

      try {
        await db.insert(transactions).values({
          id: txId,
          // External deposits have no XPay sender.
          senderId: userId,
          recipientId: userId,
          recipientType: "xpay_user",
          recipientDisplayName: "External deposit",
          asset: "USDC",
          amount: event.amount,
          chainId: event.chainId,
          txHash: event.txHash,
          status: "completed",
          // No FX conversion for a raw USDC deposit — it lands in the user's wallet.
          feeNgn: 0n,
          fxRate: 0,
          ngnAmount: 0n,
          ngnAmountGross: 0n,
          memo: "External USDC deposit",
          updatedAt: new Date(),
        })

        await audit(userId, "deposit.detected", "transaction", txId, {
          txHash: event.txHash,
          amount: event.amount.toString(),
          fromAddress: event.fromAddress,
          blockNumber: event.blockNumber.toString(),
        })

        console.log(
          `[DepositScanner] Credited ${event.amount} USDC to user ${userId}` +
            ` (tx ${event.txHash.slice(0, 10)}…)`,
        )
      } catch (err) {
        // Unique constraint violation on tx_hash = already recorded. Safe to ignore.
        const isUniqueViolation =
          err instanceof Error && err.message.includes("unique")
        if (!isUniqueViolation) {
          console.error("[DepositScanner] Failed to record deposit:", err)
        }
      }
    }

    // ── 5. Advance the cursor ───────────────────────────────────────────────
    await this.advanceCursor(chainId, toBlock)
  }

  private async advanceCursor(chainId: number, toBlock: bigint): Promise<void> {
    await db
      .insert(depositScanCursors)
      .values({ chainId, lastScannedBlock: toBlock, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: depositScanCursors.chainId,
        set: { lastScannedBlock: toBlock, updatedAt: new Date() },
      })
  }
}
