# Agent discovery

The application serves `devnet.acta.markets` and `beta.acta.markets`. Host-aware routes select the API and Solana environment at request time.

| Website host | Environment | Public API | Solana cluster |
|---|---|---|---|
| `devnet.acta.markets` | Devnet | `devnet-api.acta.markets` | Devnet |
| `beta.acta.markets` | Beta | `beta-api.acta.markets` | Mainnet-beta |

## Public interfaces

- `/robots.txt` with explicit general and AI crawler groups, private-path exclusions, Content Signals, the host sitemap, and the self-hosted documentation sitemap.
- `/sitemap.xml` with public canonical pages only.
- Homepage `Link` response headers for `api-catalog`, `service-desc`, `service-doc`, and `describedby`.
- `Accept: text/markdown` negotiation for `/`, `/earn` (vaults), `/trade` (markets), and every documentation page, with `Vary: Accept`.
- `/.well-known/api-catalog` using the RFC 9727 JSON Linkset format.
- `/openapi.json` for the public read-only HTTP API.
- `/auth.md` documenting the actual Solana wallet challenge flow and its transaction-consent boundary.
- `/.well-known/agent-skills/index.json` and a digest-verified read-only API skill.
- `/llms.txt` as a compact resource index.
- WebMCP registration for two read-only tools: environment discovery and public market listing.
- `/agent`: the page a person connects an agent from, also served as Markdown.
- `/mcp`: an MCP server over Streamable HTTP, stateless, with the read-only tools and no sign-in. Devnet only; any other host answers 404.
- `/mcp/server-card` and `/.well-known/ai-catalog.json`: where a client finds that server. Both formats are experimental upstream (SEP-2127 and AI Catalog 0.9).
- A second skill, `trade-on-acta`, for an agent that has the MCP tools. The read-only skill stays first in the index.
- Direct `service-doc` discovery of `https://docs.acta.markets`.
- A self-hosted `/docs` interface with sidebar navigation, full-text search, GFM rendering, canonical metadata, and previous/next navigation.
- Host-aware routing so `docs.acta.markets/reference/...` serves the same content as `/docs/reference/...` without a second deployment.

## Authentication and protocol support

Trading APIs use Solana wallet challenges. The application exposes no OAuth or
OpenID Connect metadata and no A2A endpoint.

The site's MCP server holds no key and only reads. An agent trades through
`packages/mcp`, a stdio MCP server its owner runs on their own machine, with a
wallet the server makes there and spending limits the owner sets; the site is
never in that path. The Agent page is a grid of AI tools with the one step that
adds Acta to each (`agentTools` in `src/lib/agent/install.ts`); any other agent
gets a prompt it follows to connect itself (`agentPrompt`). Both are built from one tool
list, `src/lib/agent/tools.ts`, which the Agent page and its Markdown also
render. `docs-site/quickstart/mcp.md` is the public description.

## Documentation source of truth

Documentation is built from:

```text
web-app/docs-site → Next.js renderer → docs.acta.markets and /docs
```

`docs-site` is authored and versioned in this repository. `SUMMARY.md` defines
the User guide and Protocol & integrations navigation. `public-docs` is a
separate technical documentation repository; the website does not sync from it.

Run the following after editing the source documentation:

```bash
npm run check:docs
```

`check:docs` works in an isolated checkout and fails on missing Markdown link
targets or anchors, duplicate sidebar entries, or pages omitted from navigation.

### Metrics coverage

- The backend exposes `/metrics`, and the HTTP reference documents it. The agent-facing OpenAPI document omits it; public ingress availability must be verified for each deployment.

## Deployment

Domain setup and deployment checks are in the
[self-hosted docs runbook](self-hosted-docs-rollout.md).

## Content Signals

The application sends:

```text
Content-Signal: ai-train=no, search=yes, ai-input=yes
```

The signal permits search indexing and AI input use and disallows model training.

## Pre-deployment checks

Run the unit and integration tests, then verify each host through a preview deployment:

```bash
curl -i https://HOST/robots.txt
curl -i https://HOST/sitemap.xml
curl -i https://HOST/.well-known/api-catalog
curl -i https://HOST/openapi.json
curl -i https://HOST/auth.md
curl -i https://HOST/.well-known/agent-skills/index.json
curl -i https://HOST/mcp/server-card
curl -i https://HOST/.well-known/ai-catalog.json
curl -i -H 'Accept: text/markdown' https://HOST/agent
curl -s -X POST https://HOST/mcp -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
curl -i -H 'Accept: text/markdown' https://HOST/
curl -I https://HOST/
```

Confirm exact content types, HTTP 200 responses, the homepage `Link` header, environment-specific API origins, and that HTML remains the default without the Markdown `Accept` header.
