import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  serverExternalPackages: ['@libsql/client', 'xlsx'],
  // Force unique build ID to bust CDN cache
  generateBuildId: async () => {
    return `build-${Date.now()}`;
  },
};

export default nextConfig;