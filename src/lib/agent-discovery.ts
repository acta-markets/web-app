export type ActaEnvironment = "devnet" | "beta";

export interface DeploymentContext {
  environment: ActaEnvironment;
  siteOrigin: string;
  apiOrigin: string;
  websocketOrigin: string;
  solanaCluster: "devnet" | "mainnet-beta";
}

const PUBLIC_DOCS_REPOSITORY = "https://github.com/acta-markets/public-docs";

function configuredEnvironment(): ActaEnvironment {
  return process.env.NEXT_PUBLIC_SOLANA_NETWORK === "mainnet" ? "beta" : "devnet";
}

export function getDeploymentContext(requestUrl: string): DeploymentContext {
  const url = new URL(requestUrl);
  const hostname = url.hostname.toLowerCase();
  const environment =
    hostname === "beta.acta.markets" || hostname.startsWith("beta.")
      ? "beta"
      : hostname === "devnet.acta.markets" || hostname.startsWith("devnet.")
        ? "devnet"
        : configuredEnvironment();

  const apiOrigin =
    environment === "beta"
      ? "https://beta-api.acta.markets"
      : "https://devnet-api.acta.markets";

  return {
    environment,
    siteOrigin: url.origin,
    apiOrigin,
    websocketOrigin: apiOrigin.replace(/^http/, "ws"),
    solanaCluster: environment === "beta" ? "mainnet-beta" : "devnet",
  };
}

export function acceptsMarkdown(acceptHeader: string | null): boolean {
  if (!acceptHeader) return false;

  return acceptHeader.split(",").some((entry) => {
    const [mediaType, ...parameters] = entry.trim().toLowerCase().split(";");
    if (mediaType !== "text/markdown") return false;

    const quality = parameters
      .map((parameter) => parameter.trim())
      .find((parameter) => parameter.startsWith("q="));

    return quality ? Number(quality.slice(2)) > 0 : true;
  });
}

export function getDiscoveryLinkHeader(): string {
  return [
    '</.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"',
    '</openapi.json>; rel="service-desc"; type="application/vnd.oai.openapi+json"',
    '</docs>; rel="service-doc"; type="text/html"',
    '</llms.txt>; rel="describedby"; type="text/plain"',
  ].join(", ");
}

export function getHomeMarkdown(context: DeploymentContext): string {
  return `# Acta

Acta is a structured-yield and European-style options protocol on Solana. Takers sell covered calls or cash-secured puts through a competitive RFQ process and receive premium upfront. Positions settle on-chain at maturity.

## Current environment

- Site: ${context.siteOrigin}
- Environment: ${context.environment}
- Solana cluster: ${context.solanaCluster}
- Public HTTP API: ${context.apiOrigin}
- Taker WebSocket: ${context.websocketOrigin}/taker

## Public resources

- [Markets](${context.siteOrigin}/earn)
- [Documentation](${context.siteOrigin}/docs)
- [API catalog](${context.siteOrigin}/.well-known/api-catalog)
- [OpenAPI description](${context.siteOrigin}/openapi.json)
- [Authentication guide](${context.siteOrigin}/auth.md)
- [Agent skill index](${context.siteOrigin}/.well-known/agent-skills/index.json)
- [Source documentation](${PUBLIC_DOCS_REPOSITORY})
- [Service health](${context.apiOrigin}/health)

## Access model

Public HTTP discovery endpoints are read-only and require no authentication. Trading uses WebSocket sessions authenticated by a Solana wallet challenge. A user must review and sign any sponsored transaction in their wallet. Do not infer consent to trade from access to this page or its public APIs.
`;
}

export function getDocsMarkdown(context: DeploymentContext): string {
  return `# Acta documentation

Use the public documentation repository as the source of truth for protocol integration:
${PUBLIC_DOCS_REPOSITORY}

## Start here

- [Protocol flow](${PUBLIC_DOCS_REPOSITORY}/blob/main/reference/protocol-flow.md)
- [Taker quickstart](${PUBLIC_DOCS_REPOSITORY}/blob/main/quickstart/taker-quickstart.md)
- [Web client SDK](${PUBLIC_DOCS_REPOSITORY}/blob/main/quickstart/web-client-ts-sdk.md)
- [Maker quickstart](${PUBLIC_DOCS_REPOSITORY}/blob/main/quickstart/maker-quickstart.md)
- [Rust maker SDK](${PUBLIC_DOCS_REPOSITORY}/blob/main/quickstart/maker-rust-sdk.md)

## Reference

- [HTTP API](${PUBLIC_DOCS_REPOSITORY}/blob/main/reference/http-api.md)
- [Maker WebSocket API](${PUBLIC_DOCS_REPOSITORY}/blob/main/reference/maker-api.md)
- [Taker WebSocket API](${PUBLIC_DOCS_REPOSITORY}/blob/main/reference/taker-api.md)
- [Wire conventions](${PUBLIC_DOCS_REPOSITORY}/blob/main/reference/ws-common.md)
- [Governance and security](${PUBLIC_DOCS_REPOSITORY}/blob/main/reference/governance.md)
- [Devnet guide](${PUBLIC_DOCS_REPOSITORY}/blob/main/reference/sandbox.md)

## Machine-readable resources

- API catalog: ${context.siteOrigin}/.well-known/api-catalog
- OpenAPI: ${context.siteOrigin}/openapi.json
- Authentication: ${context.siteOrigin}/auth.md
- Environment API: ${context.apiOrigin}
`;
}

export function getEarnMarkdown(context: DeploymentContext): string {
  return `# Acta markets

Browse Acta's currently available structured-yield markets in the ${context.environment} environment.

## Read-only market data

- Public API: ${context.apiOrigin}/api/v1/markets
- OpenAPI: ${context.siteOrigin}/openapi.json
- Protocol documentation: ${PUBLIC_DOCS_REPOSITORY}/blob/main/reference/protocol-flow.md
- Taker integration: ${PUBLIC_DOCS_REPOSITORY}/blob/main/quickstart/taker-quickstart.md

Market discovery is public and does not require authentication. Opening an RFQ requires a Solana wallet-authenticated WebSocket session. Completing a trade requires the wallet owner to review and explicitly sign the sponsored transaction.
`;
}

export function getAuthMarkdown(context: DeploymentContext): string {
  const makerRegistration =
    context.environment === "devnet"
      ? "Maker registration is human-mediated. Contact the Acta team with the maker owner and quote-signing public keys."
      : "Maker access and taker invites may be gated during beta. Contact the Acta team for provisioning.";

  return `# Acta auth.md

## Audience

This document is for agents and developers connecting to Acta's public HTTP and WebSocket APIs in the ${context.environment} environment.

## Public HTTP API

The read-only API at ${context.apiOrigin} requires no authentication. Its supported endpoints are described by ${context.siteOrigin}/openapi.json.

## Trading WebSocket authentication

Acta does not currently expose OAuth, OpenID Connect, bearer-token authentication, or automatic agent registration. Do not attempt OAuth discovery or send bearer credentials.

Takers connect to ${context.websocketOrigin}/taker. Makers connect to ${context.websocketOrigin}/maker and ${context.websocketOrigin}/maker/data. Authentication proves control of a Solana Ed25519 key:

1. Connect and send the documented \`Hello\` message.
2. A taker sends \`StartAuth\` with its wallet public key; a maker is challenged automatically after \`Welcome\` and must not send \`StartAuth\`.
3. Receive \`AuthRequest\` from the server.
4. Sign the exact UTF-8 challenge bytes with the authorized wallet or quote-signing key.
5. Return \`AuthChallenge\` with the base58-encoded signature, exact challenge, and documented public key.
6. Treat any returned taker session identifier as a secret used only for session resumption. Makers re-authenticate on every connection.

${makerRegistration}

## Safety boundary

Authentication does not authorize a trade. Any sponsored Solana transaction must be decoded or reviewed by the wallet owner and explicitly signed. Agents must not request a wallet signature or submit a transaction without the user's specific confirmation for that transaction.

## Documentation

- ${context.siteOrigin}/docs
- ${PUBLIC_DOCS_REPOSITORY}/blob/main/reference/sandbox.md
- ${PUBLIC_DOCS_REPOSITORY}/blob/main/quickstart/taker-quickstart.md
- ${PUBLIC_DOCS_REPOSITORY}/blob/main/quickstart/maker-quickstart.md
`;
}

export function getLlmsText(context: DeploymentContext): string {
  return `# Acta

> Structured yield and European-style options on Solana, using competitive off-chain RFQs and on-chain settlement.

## Documentation

- [Documentation index](${context.siteOrigin}/docs): Human- and agent-readable integration entrypoint.
- [Protocol flow](${PUBLIC_DOCS_REPOSITORY}/blob/main/reference/protocol-flow.md): Actors, RFQ mechanics, settlement, economics, and risk.
- [Taker quickstart](${PUBLIC_DOCS_REPOSITORY}/blob/main/quickstart/taker-quickstart.md): Wallet authentication, RFQs, quotes, and sponsored transactions.
- [Maker quickstart](${PUBLIC_DOCS_REPOSITORY}/blob/main/quickstart/maker-quickstart.md): Maker authentication, subscriptions, quoting, and recovery.
- [HTTP API](${PUBLIC_DOCS_REPOSITORY}/blob/main/reference/http-api.md): Public read-only HTTP endpoints.

## Discovery

- [API catalog](${context.siteOrigin}/.well-known/api-catalog)
- [OpenAPI](${context.siteOrigin}/openapi.json)
- [Authentication](${context.siteOrigin}/auth.md)
- [Agent skills](${context.siteOrigin}/.well-known/agent-skills/index.json)

## Environment

- Name: ${context.environment}
- Solana cluster: ${context.solanaCluster}
- HTTP API: ${context.apiOrigin}
- WebSocket base: ${context.websocketOrigin}
`;
}

export function getRobotsText(context: DeploymentContext): string {
  const privatePaths = [
    "Disallow: /api/",
    "Disallow: /portfolio",
    "Disallow: /referrals",
  ].join("\n");
  const contentSignal = "Content-Signal: ai-train=no, search=yes, ai-input=yes";
  const aiAgents = [
    "GPTBot",
    "OAI-SearchBot",
    "Claude-Web",
    "Google-Extended",
    "Amazonbot",
    "anthropic-ai",
    "Bytespider",
    "CCBot",
    "Applebot-Extended",
  ];

  const aiGroups = aiAgents
    .map(
      (agent) => `User-agent: ${agent}
Allow: /
${privatePaths}
${contentSignal}`,
    )
    .join("\n\n");

  return `# Acta crawl policy
User-agent: *
Allow: /
${privatePaths}
${contentSignal}

${aiGroups}

Sitemap: ${context.siteOrigin}/sitemap.xml
`;
}

export function getSitemapUrls(context: DeploymentContext): string[] {
  return ["/", "/earn", "/docs"].map((path) => `${context.siteOrigin}${path}`);
}
