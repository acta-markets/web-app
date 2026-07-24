# Agent readiness rollout

This change targets both `devnet.acta.markets` and `beta.acta.markets` from one code branch. Host-aware routes select the correct API and Solana environment at request time.

| Website host | Environment | Public API | Solana cluster |
|---|---|---|---|
| `devnet.acta.markets` | Devnet | `devnet-api.acta.markets` | Devnet |
| `beta.acta.markets` | Beta | `beta-api.acta.markets` | Mainnet-beta |

## Implemented in the application

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

## Intentionally not published

### OAuth and OpenID Connect metadata

Acta does not currently authenticate its trading APIs with OAuth or OIDC. Publishing `/.well-known/openid-configuration`, `/.well-known/oauth-authorization-server`, or OAuth Protected Resource Metadata would advertise endpoints and token semantics that do not exist.

Keep these routes absent until Acta operates a real authorization server and protected resource using the advertised issuer, grants, keys, scopes, and bearer-token validation.

### MCP Server Card

The website does not operate an MCP server. Do not publish `/.well-known/mcp/server-card.json` until a real `/mcp` transport exists and its capabilities have been security-reviewed.

### DNS for AI Discovery

DNS-AID is an active individual Internet-Draft, not a finalized RFC. It also describes discovery of actual agent endpoints; the website currently exposes WebMCP and a skill, not an A2A or MCP network service.

Do not create placeholder `_index._agents` or `_a2a._agents` records merely to satisfy a scanner. Revisit DNS-AID after:

1. an agent protocol endpoint exists;
2. its capability descriptor is stable;
3. the DNS operator supports the required SVCB parameters;
4. the public discovery zone has a validated DNSSEC chain;
5. the then-current draft syntax has been rechecked.

DNS changes are outside this repository and must be reviewed separately.

## Documentation source of truth

The intended publication flow is:

```text
docs/external  →  yuzu-web/scripts/sync-docs.sh  →  yuzu-web/docs-site
                                                           │
                                                   Next.js renderer
                                                           │
                                                   docs.acta.markets
                                                     and /docs
```

`docs/external` remains the authored public source. This repository carries a synchronized copy under `docs-site` so the website and documentation can be reviewed, built, and deployed in one PR. `docs-site/SUMMARY.md` defines the complete sidebar.

Run the following after editing the source documentation:

```bash
npm run sync:docs
npm run check:docs
npm run check:docs-source
```

`check:docs` works in an isolated checkout and fails on missing Markdown link targets, duplicate sidebar entries, or documentation pages omitted from the sidebar. `check:docs-source` additionally checks drift when the sibling `docs/external` source is available. The synchronized copy includes the latest `reference/governance.md` and `reference/protocol-flow.md`, resolving the previous public mirror drift.

### Documentation follow-up

- Resolved: `/metrics` was removed from the public HTTP documentation because both deployed API hosts return `404` for it. The OpenAPI document never listed it. Re-add both together if the endpoint ships.

### Publication order

Follow the detailed [self-hosted docs rollout runbook](self-hosted-docs-rollout.md).

The documentation origin is served by the existing web application:

1. merge and deploy the web application;
2. add `docs.acta.markets` to the same Vercel project;
3. configure the exact DNS record Vercel provides;
4. verify `https://docs.acta.markets/`, `/robots.txt`, `/sitemap.xml`, and `/llms.txt`;
5. scan the devnet, beta, and docs hosts.

## Policy decision to confirm

The proposed Content Signals policy is:

```text
Content-Signal: ai-train=no, search=yes, ai-input=yes
```

This permits indexing and real-time agent use while reserving model-training rights. Product/legal owners should confirm this before deployment.

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
