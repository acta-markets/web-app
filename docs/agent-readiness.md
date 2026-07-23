# Agent readiness rollout

This change targets both `devnet.acta.markets` and `beta.acta.markets` from one code branch. Host-aware routes select the correct API and Solana environment at request time.

| Website host | Environment | Public API | Solana cluster |
|---|---|---|---|
| `devnet.acta.markets` | Devnet | `devnet-api.acta.markets` | Devnet |
| `beta.acta.markets` | Beta | `beta-api.acta.markets` | Mainnet-beta |

## Implemented in the application

- `/robots.txt` with explicit general and AI crawler groups, private-path exclusions, Content Signals, the host sitemap, and the GitBook documentation sitemap.
- `/sitemap.xml` with public canonical pages only.
- Homepage `Link` response headers for `api-catalog`, `service-desc`, `service-doc`, and `describedby`.
- `Accept: text/markdown` negotiation for `/` and `/earn`, with `Vary: Accept`.
- `/.well-known/api-catalog` using the RFC 9727 JSON Linkset format.
- `/openapi.json` for the public read-only HTTP API.
- `/auth.md` documenting the actual Solana wallet challenge flow and its transaction-consent boundary.
- `/.well-known/agent-skills/index.json` and a digest-verified read-only API skill.
- `/llms.txt` as a compact resource index.
- WebMCP registration for two read-only tools: environment discovery and public market listing.
- Direct `service-doc` discovery of `https://docs.acta.markets`.
- `/docs` as a permanent compatibility redirect to the canonical documentation site.

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

Do not copy the full protocol documentation into `yuzu-web`.

The intended publication flow is:

```text
docs/external  →  docs/sync-public-docs.sh  →  public-docs
                                                    │
                                              GitBook Git Sync
                                                    │
                                            docs.acta.markets
                                                    ↑
                              yuzu-web service-doc + /docs redirect
```

`docs/external` remains the authored public source, and `public-docs` remains its generated content mirror. GitBook-specific `.gitbook.yaml` and `SUMMARY.md` files live only in `public-docs` and are excluded from content synchronization. Full Markdown documentation is not copied into `yuzu-web`.

The `public-docs` GitBook change:

- reconciles the previous drift in `reference/governance.md` and `reference/protocol-flow.md`;
- defines the complete GitBook sidebar;
- keeps every public Markdown page addressable from the table of contents.

### Documentation follow-up

- The public HTTP documentation lists `/metrics`, but both deployed API hosts currently return `404` for that path. The OpenAPI document in this change intentionally omits `/metrics` until the endpoint and documentation agree.

### Publication order

Do not deploy the website changes before the documentation origin exists:

1. merge the `docs` sync-script change;
2. merge the `public-docs` GitBook structure and synchronized content;
3. connect `acta-markets/public-docs` to a GitBook space using Git Sync;
4. create and publish a GitBook Docs Site;
5. configure the GitBook-provided CNAME for `docs.acta.markets`;
6. verify `https://docs.acta.markets/`, `/robots.txt`, and `/sitemap-pages.xml`;
7. deploy the website change and verify its `service-doc` and sitemap links.

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
