import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto"
import { and, eq } from "drizzle-orm"
import { db } from "../db/index.js"
import { bankAccounts, type BankAccountRow, type UserRow } from "../db/schema.js"
import { newId } from "../lib/ids.js"
import { fail, ok, type Result } from "../lib/errors.js"
import { config } from "../config.js"
import { bankProvider } from "../providers/bank/index.js"

/**
 * Bank account management.
 *
 * Account numbers are encrypted at rest using AES-256-GCM.
 * The encryption key is derived from SESSION_SECRET.
 * Only the last 4 digits are stored in plaintext for display purposes.
 */

function getEncryptionKey(): Buffer {
  return createHash("sha256").update(config.SESSION_SECRET).digest()
}

export function encryptAccountNumber(accountNumber: string): string {
  const key = getEncryptionKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const encrypted = Buffer.concat([cipher.update(accountNumber, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`
}

export function decryptAccountNumber(encrypted: string): string {
  const key = getEncryptionKey()
  const parts = encrypted.split(":")
  if (parts.length !== 3) throw new Error("Invalid encrypted account number format")
  const [ivHex, tagHex, cipherHex] = parts
  const iv = Buffer.from(ivHex!, "hex")
  const tag = Buffer.from(tagHex!, "hex")
  const ciphertext = Buffer.from(cipherHex!, "hex")
  const decipher = createDecipheriv("aes-256-gcm", key, iv)
  decipher.setAuthTag(tag)
  return decipher.update(ciphertext).toString("utf8") + decipher.final("utf8")
}

export async function linkBankAccount(
  user: UserRow,
  bankCode: string,
  accountNumber: string,
  setAsDefault = true,
): Promise<Result<BankAccountRow>> {
  const provider = bankProvider()
  const resolved = await provider.resolveAccount(bankCode, accountNumber)
  if (!resolved.success) return fail(resolved.reason)

  const encrypted = encryptAccountNumber(accountNumber)

  if (setAsDefault) {
    await db
      .update(bankAccounts)
      .set({ isDefault: false })
      .where(eq(bankAccounts.userId, user.id))
  }

  const [row] = await db
    .insert(bankAccounts)
    .values({
      id: newId("ba"),
      userId: user.id,
      bankCode: resolved.bankCode,
      bankName: resolved.bankName,
      accountNumberEncrypted: encrypted,
      accountNumberLast4: accountNumber.slice(-4),
      accountName: resolved.accountName,
      verificationStatus: "verified",
      isDefault: setAsDefault,
    })
    .returning()

  if (!row) return fail("invalid")
  return ok(row)
}

export async function getUserBankAccounts(userId: string): Promise<BankAccountRow[]> {
  return db.select().from(bankAccounts).where(eq(bankAccounts.userId, userId))
}

export async function getDefaultBankAccount(userId: string): Promise<BankAccountRow | null> {
  const [row] = await db
    .select()
    .from(bankAccounts)
    .where(and(eq(bankAccounts.userId, userId), eq(bankAccounts.isDefault, true)))
  return row ?? null
}
