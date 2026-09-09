import { desc, eq } from "drizzle-orm"
import { db } from "../db/index.js"
import { payouts, type PayoutRow } from "../db/schema.js"

/** Payout query helpers. The actual payout creation lives in services/transactions.ts. */

export async function history(userId: string, limit = 50): Promise<PayoutRow[]> {
  return db
    .select()
    .from(payouts)
    .where(eq(payouts.userId, userId))
    .orderBy(desc(payouts.createdAt))
    .limit(limit)
}

export async function byId(userId: string, payoutId: string): Promise<PayoutRow | null> {
  const [row] = await db
    .select()
    .from(payouts)
    .where(eq(payouts.id, payoutId) && eq(payouts.userId, userId))
  return row ?? null
}

export async function byTransactionId(transactionId: string): Promise<PayoutRow | null> {
  const [row] = await db
    .select()
    .from(payouts)
    .where(eq(payouts.transactionId, transactionId))
  return row ?? null
}
