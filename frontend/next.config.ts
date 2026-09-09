import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  turbopack: {
    // Root is the frontend directory itself — not the monorepo root
    root: __dirname,
  },
}

export default nextConfig
