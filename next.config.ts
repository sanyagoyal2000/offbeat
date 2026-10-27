import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root; a stray lockfile in the home folder otherwise confuses Next.
  outputFileTracingRoot: __dirname,
  devIndicators: false,
  // A second dev server or build in the same folder must use its own output dir, or it breaks the first.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  images: {
    // Film images returned by the Qloo API.
    remotePatterns: [
      { protocol: "https", hostname: "images.qloo.com" },
      { protocol: "https", hostname: "staging.images.qloo.com" },
    ],
  },
  webpack: (config) => {
    // The local data store writes to data/runtime; don't trigger dev rebuilds on every write.
    config.watchOptions = { ...config.watchOptions, ignored: ["**/node_modules/**", "**/.git/**", "**/data/runtime/**"] };
    return config;
  },
};

export default nextConfig;
