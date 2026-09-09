import { and, eq, gt, isNull } from "drizzle-orm"
import { db } from "../db/index.js"
import { quotes, type QuoteRow, type UserRow } from "../db/schema.js"
import { newId } from "../lib/ids.js"
import { fail, ok, type Result } from "../lib/errors.js"
import { fxProvider } from "../providers/fx/index.js"
import { config } from "../config.js"
import { toNGN } from "../lib/money.js"

/**
 * Quote engine.
 *
 * Generates a time-limited FX quote for a USDC → NGN conversion.
 * The quote is stored in the database and must be referenced when creating a transaction.
 * This prevents the user from being surprised by a rate change between "I see the rate"
 * and "the transaction is created".
 */

export type QuoteInput = {
  user: UserRow
  amountUsdc: bigint
}

export type QuoteOutput = {
  id: string
  amountUsdc: bigint
  fxRate: number
  feeNgn: bigint
  ngnAmountGross: bigint
  ngnAmountNet: bigint
  expiresAt: Date
}

export async function createQuote(input: QuoteInput): Promise<Result<QuoteOutput>> {
  if (input.amountUsdc <= 0n) return fail("invalid")

  // Minimum $1 to avoid dust
  if (input.amountUsdc < 1_000_000n) return fail("invalid")

  const fx = fxProvider()
  const rate = await fx.getRate("USDC", "NGN")

  const ngnGross = toNGN(input.amountUsdc, rate.rate)
  const feeNgn = BigInt(config.FEE_NGN)
  const ngnNet = ngnGross - feeNgn

  if (ngnNet <= 0n) return fail("invalid")

  const expiresAt = new Date(Date.now() + config.QUOTE_TTL_SECONDS * 1000)

  const [row] = await db
    .insert(quotes)
    .values({
      id: newId("q"),
      userId: input.user.id,
      amountUsdc: input.amountUsdc,
      fxRate: rate.rate,
      feeNgn,
      ngnAmountGross: ngnGross,
      ngnAmountNet: ngnNet,
      expiresAt,
    })
    .returning()

  if (!row) return fail("invalid")

  return ok({
    id: row.id,
    amountUsdc: row.amountUsdc,
    fxRate: row.fxRate,
    feeNgn: row.feeNgn,
    ngnAmountGross: row.ngnAmountGross,
    ngnAmountNet: row.ngnAmountNet,
    expiresAt: row.expiresAt,
  })
}

/**
 * Look up a valid, unconsumed quote.
 */
export async function getQuote(quoteId: string, userId: string): Promise<QuoteRow | null> {
  const [row] = await db
    .select()
    .from(quotes)
    .where(
      and(
        eq(quotes.id, quoteId),
        eq(quotes.userId, userId),
        isNull(quotes.consumedAt),
        gt(quotes.expiresAt, new Date()),
      ),
    )
  return row ?? null
}

/**
 * Mark a quote as consumed so it cannot be used for another transaction.
 */
export async function consumeQuote(quoteId: string): Promise<boolean> {
  const updated = await db
    .update(quotes)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(quotes.id, quoteId),
        isNull(quotes.consumedAt),
        gt(quotes.expiresAt, new Date()),
      ),
    )
    .returning({ id: quotes.id })

  return updated.length > 0
}
