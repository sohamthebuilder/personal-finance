import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Stops `next dev` writing agent instructions into the repo.
  agentRules: false,
  // Loaded by Node at runtime rather than bundled, because it is a native module.
  serverExternalPackages: ["better-sqlite3-multiple-ciphers"],
  // No image optimiser: it adds a route that fetches and processes files.
  images: { unoptimized: true },
};

export default nextConfig;
