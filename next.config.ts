import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces a self-contained .next/standalone build for the Docker image.
  // Vercel does its own build tracing and breaks if this is set (ENOENT on
  // next-server.js.nft.json), so only apply it outside Vercel's builder.
  output: process.env.VERCEL ? undefined : "standalone",
  // Keep these as real node_modules dependencies at runtime instead of
  // getting bundled — they ship native/binary assets that don't survive
  // webpack/turbopack bundling.
  serverExternalPackages: ["playwright-core", "@sparticuz/chromium"],
  // The bundler's static file-trace misses non-JS assets these packages
  // need at runtime (playwright-core's browsers.json, @sparticuz/chromium's
  // bin/ binary) — force the whole packages along.
  outputFileTracingIncludes: {
    "/api/ratings": ["./node_modules/playwright-core/**", "./node_modules/@sparticuz/chromium/**"],
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "a.ltrbxd.com" }],
  },
};

export default nextConfig;
