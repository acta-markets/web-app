// The `devnet` branch follows the devnet backend's wire format, so its Vercel builds
// always target devnet, whatever the project's Preview variables point at.
// An empty value falls back to the network's default (see src/lib/network.ts).
const DEVNET_ENV = {
  NEXT_PUBLIC_SOLANA_NETWORK: "devnet",
  NEXT_PUBLIC_RFQ_WS_URL: "",
  NEXT_PUBLIC_API_URL: "",
  NEXT_PUBLIC_SOLANA_RPC_URL: "",
};

// A partner edition is the devnet app with its own assets and vaults (src/lib/edition.ts),
// built from its own branch. It is held to devnet exactly as the `devnet` branch is.
const EDITION_BRANCHES = { p0: "p0" };

const branch = process.env.VERCEL_GIT_COMMIT_REF ?? "";
const edition = Object.hasOwn(EDITION_BRANCHES, branch) ? EDITION_BRANCHES[branch] : null;
const devnetBranchEnv =
  branch === "devnet" ? DEVNET_ENV : edition ? { ...DEVNET_ENV, NEXT_PUBLIC_EDITION: edition } : {};

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

