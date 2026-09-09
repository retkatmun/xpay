import { db } from "../db/index.js"
import { auditLogs } from "../db/schema.js"
import { newId } from "../lib/ids.js"

/**
 * Audit logging.
 *
 * Append-only. Every action that matters to compliance or security gets a row here.
 * Never put secrets in metadata — assume this table is visible to compliance reviewers.
 */
export async function audit(
  actorId: string | null,
  action: string,
  resource: string,
  resourceId: string,
  metadata?: Record<string, unknown>,
  ipAddress?: string,
): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      id: newId("al"),
      actorId,
      action,
      resource,
      resourceId,
      metadata: metadata ?? null,
      ipAddress: ipAddress ?? null,
    })
  } catch (err) {
    // Audit logging must never crash the main flow.
    // Log the error but continue.
    console.error("[audit] Failed to write audit log:", err)
  }
}
