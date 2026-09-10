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
- `Accept: text/markdown` negotiation for `/`, `/earn`, and every documentation page, with `Vary: Accept`.
- `/.well-known/api-catalog` using the RFC 9727 JSON Linkset format.
- `/openapi.json` for the public read-only HTTP API.
- `/auth.md` documenting the actual Solana wallet challenge flow and its transaction-consent boundary.
- `/.well-known/agent-skills/index.json` and a digest-verified read-only API skill.
- `/llms.txt` as a compact resource index.
- WebMCP registration for two read-only tools: environment discovery and public market listing.
- Direct `service-doc` discovery of `https://docs.acta.markets`.
- A self-hosted `/docs` interface with sidebar navigation, full-text search, GFM rendering, canonical metadata, and previous/next navigation.
- Host-aware routing so `docs.acta.markets/reference/...` serves the same content as `/docs/reference/...` without a second deployment.

## Authentication and protocol support

Trading APIs use Solana wallet challenges. The application exposes no OAuth or
OpenID Connect metadata, MCP Server Card, A2A endpoint, or MCP server transport.
Agent access uses browser WebMCP and the read-only skill index listed above.

## Documentation source of truth

Documentation is built from:

```text
public-docs
    │ npm run sync:docs
    ▼
web-app/docs-site → Next.js renderer → docs.acta.markets and /docs
```

`public-docs` is the authored source. `docs-site` is its synchronized copy used by the website build; `docs-site/SUMMARY.md` defines the sidebar.

Run the following after editing the source documentation:

```bash
npm run sync:docs
npm run check:docs
npm run check:docs-source
```

`check:docs` works in an isolated checkout and fails on missing Markdown link targets, duplicate sidebar entries, or documentation pages omitted from the sidebar. `check:docs-source` additionally checks drift when the sibling `public-docs` source is available.

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
curl -i -H 'Accept: text/markdown' https://HOST/
curl -I https://HOST/
```

Confirm exact content types, HTTP 200 responses, the homepage `Link` header, environment-specific API origins, and that HTML remains the default without the Markdown `Accept` header.
