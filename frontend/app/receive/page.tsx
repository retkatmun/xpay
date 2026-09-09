"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/Button"
import { CopyButton } from "@/components/CopyButton"
import { Screen, Title } from "@/components/Screen"
import { ChevronDown } from "@/components/icons"
import { formatHandle, prettyPhone } from "@/lib/api"
import { useSession } from "@/lib/session"

export default function Receive() {
  const router = useRouter()
  const { user, loading, signOut } = useSession()
  const [showAddress, setShowAddress] = useState(false)

  useEffect(() => { if (!loading && !user) router.replace("/") }, [loading, user, router])
  if (!user) return <div className="min-h-dvh bg-white" />

  return (
    <Screen back onBack={() => router.replace("/home")}>
      <div className="flex flex-1 flex-col pt-4 pb-10">
        <Title sub="Share your handle or phone — anyone on XPay can pay you instantly.">
          Receive money
        </Title>

        <div className="mt-6 space-y-3">
          {/* handle */}
          <div className="flex items-center justify-between rounded-2xl border border-gray-100 bg-white px-5 py-4 shadow-sm">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">XPay handle</p>
              <p className="mt-1 font-[var(--font-instrument-serif)] text-2xl leading-none tracking-[-0.01em] text-gray-900">
                {formatHandle(user.username)}
              </p>
            </div>
            <CopyButton value={formatHandle(user.username)} label="Copy handle" />
          </div>

          {/* phone */}
          <div className="flex items-center justify-between rounded-2xl border border-gray-100 bg-white px-5 py-4 shadow-sm">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Phone number</p>
              <p className="mt-1 text-lg font-medium tabular-nums text-gray-900">{prettyPhone(user.phone)}</p>
            </div>
            <CopyButton value={user.phone} label="Copy phone" />
          </div>
        </div>

        {/* USDC deposit address toggle */}
        <div className="mt-6">
          <button type="button" onClick={() => setShowAddress(v => !v)} aria-expanded={showAddress}
            className="flex w-full items-center justify-between rounded-xl px-1 py-2.5 text-left transition hover:opacity-70">
            <span className="text-sm text-gray-500">Receive USDC from outside XPay</span>
            <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform duration-150 ${showAddress ? "rotate-180" : ""}`} />
          </button>

          {showAddress && (
            <div className="mt-3 rounded-2xl border border-gray-100 bg-gray-50 p-5">
              <p className="text-xs font-semibold text-gray-700">Your USDC deposit address</p>
              {user.walletAddress ? (
                <>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <p className="break-all font-mono text-xs leading-relaxed text-gray-800">
                      {user.walletAddress}
                    </p>
                    <CopyButton value={user.walletAddress} label="Copy address" />
                  </div>
                </>
              ) : (
                <p className="mt-3 text-xs leading-relaxed text-gray-500">
                  Wallet address unavailable — try signing out and back in.
                </p>
              )}
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs leading-relaxed text-amber-700">
                  <strong>Only send USDC on the Base network to this address.</strong> Sending any other asset, or sending on a different network (e.g. Ethereum, Polygon, Solana), will result in permanent loss.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="mt-auto pt-10">
          <Button full variant="ghost"
            onClick={async () => { await signOut(); router.replace("/") }}>
            Sign out
          </Button>
        </div>
      </div>
    </Screen>
  )
}
