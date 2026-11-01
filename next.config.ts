import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Type errors don't stop the deployment; run `npm run typecheck` to see and fix them.
  typescript: { ignoreBuildErrors: true },
  experimental: {
    serverActions: {
      // Attachments are uploaded directly to Supabase Storage from the browser,
      // so server actions only carry small JSON payloads.
      bodySizeLimit: "2mb",
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
