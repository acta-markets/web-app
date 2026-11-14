// The `devnet` branch follows the devnet backend's wire format, so its Vercel builds
// always target devnet, whatever the project's Preview variables point at.
// An empty value falls back to the network's default (see src/lib/network.ts).
const devnetBranchEnv =
  process.env.VERCEL_GIT_COMMIT_REF === "devnet"
    ? {
        NEXT_PUBLIC_SOLANA_NETWORK: "devnet",
        NEXT_PUBLIC_RFQ_WS_URL: "",
        NEXT_PUBLIC_API_URL: "",
        NEXT_PUBLIC_SOLANA_RPC_URL: "",
      }
    : {};

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: devnetBranchEnv,
  async headers() {
    return [
      {
        source: "/.well-known/agent-skills/index.json",
        headers: [
          { key: "Content-Type", value: "application/json; charset=utf-8" },
          { key: "Cache-Control", value: "public, max-age=3600" },
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
      {
        source: "/.well-known/agent-skills/:skill/SKILL.md",
        headers: [
          { key: "Content-Type", value: "text/markdown; charset=utf-8" },
          { key: "Cache-Control", value: "public, max-age=3600" },
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "api.dicebear.com",
        pathname: "/7.x/**",
      },
    ],
  },
};

export default nextConfig;

