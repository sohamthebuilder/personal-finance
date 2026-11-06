import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Loaded by Node at runtime rather than bundled, because it is a native module.
  serverExternalPackages: ["better-sqlite3-multiple-ciphers"],
  // No image optimiser: it adds a route that fetches and processes files.
  images: { unoptimized: true },
};

export default nextConfig;
