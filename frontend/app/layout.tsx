import type { Metadata, Viewport } from "next"
import { Instrument_Serif, Public_Sans } from "next/font/google"
import { SessionProvider } from "@/lib/session"
import "./globals.css"

const display = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
  display: "swap",
})

const sans = Public_Sans({
  subsets: ["latin"],
  variable: "--font-public-sans",
  display: "swap",
})

export const metadata: Metadata = {
  title: "XPay — Send dollars. Receive naira. No P2P.",
  description:
    "XPay lets people abroad send stablecoins to Nigerians by phone number, username, or any verified Nigerian bank account. No P2P traders. No crypto knowledge required.",
  openGraph: {
    title: "XPay",
    description: "Send dollars. Receive naira. No P2P.",
    type: "website",
  },
}

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  )
}
