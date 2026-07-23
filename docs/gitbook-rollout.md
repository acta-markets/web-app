# GitBook and documentation-site rollout

This runbook describes the remaining work after the agent-readiness PR is
approved. It does not authorize a production deployment or DNS change.

Pricing was checked against the official GitBook pricing page on 2026-07-23.
Recheck it before purchase.

## Cost and hosting decision

| Option | GitBook cost | Public URL | Trade-off |
| --- | --- | --- | --- |
| GitBook Free | `$0` | GitBook-managed `*.gitbook.io` URL | Git Sync, previews, built-in SEO, LLM outputs, and one free user; no custom domain |
| GitBook Premium | `$65/site/month` with annual billing | `docs.acta.markets` | Custom domain, branding, analytics, AI search; GitBook lists collaborators at `$12/user/month` |
| GitBook Ultimate | `$249/site/month` with annual billing | `docs.acta.markets` | Adds AI Assistant and advanced multi-site features that Acta does not currently require |
| Self-hosted docs | No GitBook fee | `docs.acta.markets` | Requires Acta to build and maintain Markdown rendering, navigation, search, SEO, sitemaps, and agent outputs |

Recommended launch path:

1. import and preview the docs on the Free plan;
2. verify structure, links, and rendering;
3. choose either Premium for `docs.acta.markets` or keep the GitBook-managed
   URL and update `DOCS_SITE_ORIGIN` before deploying the website.

Do not deploy the current website links while neither URL is live.

Official references:

- [GitBook pricing](https://www.gitbook.com/pricing)
- [Git Sync import](https://gitbook.com/docs/guides/editing-and-publishing-documentation/import-or-migrate-your-content-to-gitbook-with-git-sync)
- [Content configuration](https://gitbook.com/docs/getting-started/git-sync/content-configuration)
- [Custom domain setup](https://gitbook.com/docs/publishing-documentation/custom-domain)

## Repository state

The web repository already contains everything GitBook needs:

- `.gitbook.yaml` selects `docs-site/` as the Git Sync root;
- `docs-site/README.md` is the documentation homepage;
- `docs-site/SUMMARY.md` defines the complete sidebar;
- `docs-site/quickstart/` contains taker and maker onboarding;
- `docs-site/reference/` contains protocol and API reference material;
- `npm run check:docs` checks source drift, missing files, broken internal
  Markdown links, duplicate sidebar entries, and pages omitted from the
  sidebar.

Before changing GitBook settings, run:

```bash
npm run check:docs
npm test
npm run build
```

## Required access

Identify one owner for each role before starting:

| Role | Required access |
| --- | --- |
| GitBook owner | Create the organization, Space, and Docs Site; select a plan |
| GitHub organization admin | Install the GitBook GitHub App for `acta-markets/web-app` |
| DNS operator | Create the exact CNAME GitBook provides |
| Product/security reviewer | Approve public content and agent usage policy |

Grant the GitBook GitHub App access only to `acta-markets/web-app` unless it
genuinely needs other repositories.

## 1. Create the GitBook content

1. Sign in to GitBook and create or select the Acta organization.
2. Create a Docs Site named `Acta Protocol Docs`.
3. Choose the option to sync content from GitHub.
4. Install or authorize the GitBook GitHub App for the Acta organization.
5. Select `acta-markets/web-app`.
6. Select the `main` branch.
7. For the initial sync direction, select **GitHub → GitBook**. Selecting the
   opposite direction could overwrite repository content.
8. Start the initial sync.

GitBook should read `.gitbook.yaml`, use `docs-site/README.md` as the homepage,
and use `docs-site/SUMMARY.md` for navigation.

## 2. Verify the imported Space

Before publishing, confirm:

- the sidebar has 16 entries and no duplicate pages;
- all four groups appear: Understand Acta, Taker, Maker, and Reference;
- code blocks and JSON examples render without truncation;
- tables are readable on desktop and mobile;
- relative links stay inside the documentation site;
- external devnet, beta, GitHub, and Solana links open correctly;
- search finds `StartAuth`, `AuthRequest`, `settlement_attestor`, and
  `UpdateOraclePriceAttested`;
- no internal-only files outside `docs-site/` were imported.

If GitBook imports the repository root instead, stop and verify that
`.gitbook.yaml` is present on the selected branch and contains:

```yaml
root: ./docs-site/

structure:
  readme: README.md
  summary: SUMMARY.md
```

## 3. Configure the site

Suggested settings:

| Setting | Value |
| --- | --- |
| Site name | `Acta Protocol Docs` |
| Description | `Protocol, API, taker, and maker documentation for Acta Markets` |
| Audience | Public |
| Default appearance | Follow system theme |
| Primary color | Acta brand orange |
| Page actions | Copy page, Copy Markdown, View source |
| Edit on Git | Enabled |
| AI Assistant | Disabled initially |
| PDF export | Optional |

Use Preview on desktop and mobile before pressing Publish.

## 4. Publish a temporary URL

Publish first on the GitBook-provided URL. Record the exact origin, for example:

```text
https://acta-markets.gitbook.io/acta-protocol
```

The real value is assigned by GitBook; do not assume the example exists.

Verify:

```bash
curl -fsSI https://GITBOOK_ORIGIN/
curl -fsS https://GITBOOK_ORIGIN/robots.txt
curl -fsS https://GITBOOK_ORIGIN/sitemap-pages.xml
curl -fsS https://GITBOOK_ORIGIN/llms.txt
curl -fsS https://GITBOOK_ORIGIN/llms-full.txt
```

GitBook currently advertises `llms.txt`, `llms-full.txt`, and Markdown page
versions on all plans. Treat the actual responses as the release criterion.

## 5. Choose the production URL

### Option A: use `docs.acta.markets`

1. Upgrade the Docs Site to Premium or higher.
2. Open the site dashboard.
3. Open **Settings → Domain and URL**.
4. Enter `docs.acta.markets`.
5. Copy the CNAME name and target shown by GitBook.
6. In the Acta DNS provider, create exactly that CNAME.
7. If DNS is managed through Cloudflare, keep the record DNS-only while
   GitBook verifies it unless GitBook explicitly says otherwise.
8. Wait for DNS propagation and GitBook TLS provisioning.
9. Finish domain verification in GitBook.

Do not invent the CNAME target in advance. GitBook generates it during domain
setup. GitBook notes that DNS propagation can take up to 48 hours.

### Option B: stay on GitBook Free

Before deploying the web application, change:

```ts
DOCS_SITE_ORIGIN = "https://THE-ACTUAL-GITBOOK-ORIGIN"
```

Then update the documentation sitemap line in `robots.txt` tests and rerun the
full validation suite. Do not leave `docs.acta.markets` in discovery metadata
if that domain will not be created.

## 6. Verify the documentation origin

For `docs.acta.markets`, run:

```bash
curl -fsSI https://docs.acta.markets/
curl -fsS https://docs.acta.markets/robots.txt
curl -fsS https://docs.acta.markets/sitemap-pages.xml
curl -fsS https://docs.acta.markets/llms.txt
curl -fsS https://docs.acta.markets/llms-full.txt
curl -fsSI https://docs.acta.markets/quickstart/taker-quickstart
curl -fsSI https://docs.acta.markets/reference/http-api
```

Release criteria:

- every request succeeds without an authentication page;
- the homepage is indexable;
- the sitemap contains all documentation pages;
- the taker and HTTP API pages have canonical URLs under the chosen origin;
- Markdown/LLM representations contain useful page content;
- no preview or GitBook editor URL appears as canonical.

## 7. Deploy the web application

Deploy the website only after the documentation origin passes the preceding
checks. Verify both `devnet.acta.markets` and `beta.acta.markets`:

```bash
curl -fsS https://HOST/robots.txt
curl -fsS https://HOST/sitemap.xml
curl -fsS https://HOST/.well-known/api-catalog
curl -fsS https://HOST/openapi.json
curl -fsS https://HOST/llms.txt
curl -fsSI https://HOST/
curl -fsSI https://HOST/docs
curl -fsS -H 'Accept: text/markdown' https://HOST/
```

Confirm:

- `/docs` redirects to the chosen documentation origin;
- the homepage `Link` header advertises it with `rel="service-doc"`;
- the API catalog uses the same `service-doc` URL;
- OpenAPI `externalDocs.url`, `llms.txt`, WebMCP, and visible navigation agree;
- `robots.txt` references both the website sitemap and documentation sitemap;
- beta resources never point to devnet APIs, and devnet resources never point
  to beta APIs.

After deployment, scan both hosts with `isitagentready.com` and save the report
in the release notes.

## Rollback

If the documentation domain fails before the web deployment, do not deploy the
web change.

If it fails after the web deployment:

1. keep the GitBook-provided URL available;
2. change `DOCS_SITE_ORIGIN` to that verified URL;
3. update the docs sitemap URL in `robots.txt`;
4. deploy the small fallback change;
5. repair the custom domain separately.

Do not redirect `docs.acta.markets` to an unavailable site, and do not leave a
broken `service-doc` URL in agent discovery metadata.
