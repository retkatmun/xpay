import type { TransactionStatus } from "@/lib/types"

export function statusLabel(status: TransactionStatus): string {
  const labels: Record<TransactionStatus, string> = {
    created: "Created",
    awaiting_payment: "Awaiting payment",
    blockchain_detected: "Payment detected",
    blockchain_confirmed: "Payment confirmed",
    conversion_processing: "Converting",
    payout_pending: "Payout pending",
    payout_processing: "Paying out",
    completed: "Completed",
    expired: "Expired",
    rejected: "Rejected",
    blockchain_failed: "Payment failed",
    payout_failed: "Payout failed",
    cancelled: "Cancelled",
    manual_review: "Under review",
  }
  return labels[status] ?? status
}

export function statusColor(status: TransactionStatus): string {
  if (status === "completed") return "text-green-600"
  if (
    status === "expired" ||
    status === "rejected" ||
    status === "blockchain_failed" ||
    status === "payout_failed" ||
    status === "cancelled"
  )
    return "text-red-500"
  if (status === "manual_review") return "text-amber-600"
  return "text-blue-600"
}

export function isTerminal(status: TransactionStatus): boolean {
  return ["completed", "expired", "rejected", "blockchain_failed", "payout_failed", "cancelled"].includes(status)
}

export function isPending(status: TransactionStatus): boolean {
  return !isTerminal(status)
}
