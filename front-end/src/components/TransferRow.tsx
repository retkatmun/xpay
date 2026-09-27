import { Link } from "react-router-dom"
import { formatUSD } from "@/lib/money"
import { clockTime, relativeTime } from "@/lib/time"
import type { Transaction } from "@/lib/types"
import { Avatar } from "./Avatar"

export function TransferRow({
  transfer,
  stamp = "relative",
}: {
  transfer: Transaction
  stamp?: "relative" | "clock"
}) {
  const incoming = transfer.direction === "in"
  const amount = BigInt(transfer.amount)

  const tone = incoming ? "text-blue-600" : "text-gray-900"
  const sign = incoming ? "+" : "−"

  const when =
    stamp === "clock" ? clockTime(transfer.createdAt) : relativeTime(transfer.createdAt)

  const name = transfer.recipientDisplayName

  // How was it sent?
  const methodLabel =
    transfer.recipientType === "bank_account"
      ? "Bank transfer"
      : name?.startsWith("+") || /^\d{10,}$/.test(name ?? "")
      ? "Phone"
      : "Username"

  const asset = transfer.asset ?? "USDC"

  const meta = [when, transfer.memo].filter(Boolean).join(" · ")

  return (
    <Link
      to={`/activity/${transfer.id}`}
      className="-mx-2 flex items-center gap-3 rounded px-2 py-3.5 transition-colors duration-150 hover:bg-gray-50"
    >
      {transfer.recipientType === "bank_account" ? (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50">
          <svg
            className="h-5 w-5 text-blue-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 6l9-3 9 3v12l-9 3-9-3V6z"
            />
          </svg>
        </div>
      ) : (
        <Avatar name={name} />
      )}

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-gray-900">{name}</span>
        <span className="mt-0.5 flex items-center gap-1 truncate text-xs text-gray-400">
          <span className="font-semibold text-sky-500 uppercase tracking-wide text-[10px]">{asset}</span>
          <span className="text-gray-300">·</span>
          <span>{methodLabel}</span>
          <span className="text-gray-300">·</span>
          <span>{meta}</span>
        </span>
      </span>

      <span className={`shrink-0 tabular-nums text-sm font-medium ${tone}`}>
        {sign}
        {formatUSD(amount)}
      </span>
    </Link>
  )
}
