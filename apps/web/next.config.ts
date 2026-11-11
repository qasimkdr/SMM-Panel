import type { NextConfig } from "next";
import { config as loadEnv } from "dotenv";
import path from "node:path";

// One .env at the repo root serves every app.
loadEnv({ path: path.resolve(process.cwd(), "../../.env"), quiet: true });

const API_URL = process.env.API_URL ?? "http://localhost:4000";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const config: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ["@smm/shared"],
  output: "standalone",
  images: { formats: ["image/avif", "image/webp"] },
  async rewrites() {
    // In production nginx sends /api straight to the API; this keeps dev and single-host setups working.
    return [{ source: "/api/:path*", destination: `${API_URL}/api/:path*` }];
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/_next/static/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default config;
