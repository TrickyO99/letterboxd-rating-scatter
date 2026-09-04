import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces a self-contained .next/standalone build for the Docker image.
  output: "standalone",
  // Keep this as a real node_modules dependency at runtime instead of
  // getting bundled — it ships native/binary assets that don't survive
  // webpack/turbopack bundling.
  serverExternalPackages: ["playwright-core"],
  // The bundler's static file-trace misses non-JS assets this package
  // needs at runtime (playwright-core's browsers.json) — force the whole
  // package along.
  outputFileTracingIncludes: {
    "/api/ratings": ["./node_modules/playwright-core/**"],
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "a.ltrbxd.com" }],
  },
};

export default nextConfig;
