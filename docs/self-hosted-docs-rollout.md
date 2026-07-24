# Self-hosted documentation rollout

This runbook covers publishing `docs.acta.markets` from the existing
`acta-markets/web-app` Next.js project. It does not authorize a production
deployment or DNS change.

## Cost model

This design has no GitBook subscription. It uses the existing web application,
Vercel project, and Acta domain. Incremental cost is limited to usage under the
current hosting plan and DNS provider.

The implementation does not require a second Vercel project:

- `beta.acta.markets/docs` and `devnet.acta.markets/docs` expose the docs inside
  the existing sites;
- `docs.acta.markets` is assigned to the same project;
- middleware maps clean documentation-domain paths to the same Next.js pages.

## Architecture

```text
docs/external
      │
      │ npm run sync:docs
      ▼
yuzu-web/docs-site ── SUMMARY.md
      │
      ├── Next.js server-rendered Markdown
      ├── Accept: text/markdown
      ├── sidebar and search index
      ├── robots.txt
      ├── sitemap.xml
      └── llms.txt
             │
             ├── /docs on beta and devnet
             └── docs.acta.markets
```

Canonical URLs use `https://docs.acta.markets`. The `/docs` versions remain
available for previews and same-origin navigation.

## Repository checks

Run before review or deployment:

```bash
npm run sync:docs
npm run check:docs
npm run check:docs-source
npm test
npm run build
```

`check:docs` detects:

- Markdown links to missing local files;
- duplicate `SUMMARY.md` entries;
- documentation pages missing from the sidebar.

`check:docs-source` additionally detects drift from `docs/external` when that
sibling repository is available. The regular validation remains runnable in an
isolated CI checkout.

## Local verification

Start the application:

```bash
npm run dev
```

Verify the same-origin routes:

```bash
curl -fsSI http://localhost:3000/docs
curl -fsSI http://localhost:3000/docs/reference/http-api
curl -fsS -H 'Accept: text/markdown' \
  http://localhost:3000/docs/reference/http-api
```

Simulate the documentation hostname:

```bash
curl -fsS -H 'Host: docs.acta.markets' \
  http://localhost:3000/
curl -fsS -H 'Host: docs.acta.markets' \
  http://localhost:3000/reference/http-api
curl -fsS -H 'Host: docs.acta.markets' \
  -H 'Accept: text/markdown' \
  http://localhost:3000/reference/http-api
curl -fsS -H 'Host: docs.acta.markets' \
  http://localhost:3000/robots.txt
curl -fsS -H 'Host: docs.acta.markets' \
  http://localhost:3000/sitemap.xml
curl -fsS -H 'Host: docs.acta.markets' \
  http://localhost:3000/llms.txt
```

## Add `docs.acta.markets` to Vercel

1. Open the existing Vercel project that serves the Acta web application.
2. Open **Settings → Domains**.
3. Select **Add Domain**.
4. Enter `docs.acta.markets`.
5. Copy the exact DNS instructions Vercel displays.
6. Add the requested record in the DNS provider.

Vercel normally configures a subdomain through a project-specific CNAME.
Do not guess the target: use the value shown for this project. If the domain is
owned by another Vercel team, Vercel can also request a TXT ownership record.

Official references:

- [Add a Vercel domain](https://vercel.com/docs/domains/working-with-domains/add-a-domain)
- [Working with Vercel domains](https://vercel.com/docs/domains/working-with-domains)
- [Vercel SSL certificates](https://vercel.com/docs/domains/working-with-ssl)

After DNS verification, Vercel provisions and renews TLS automatically. Do not
remove the previous DNS record until the Vercel dashboard reports the new
configuration as valid.

## Preview checklist

Verify desktop and mobile:

- homepage and reference pages render without horizontal page overflow;
- sidebar navigation highlights the current page;
- the mobile navigation opens, closes, and follows links;
- search finds page titles and body terms;
- code blocks scroll horizontally without widening the page;
- tables remain readable on small screens;
- internal Markdown links stay within the docs UI;
- previous and next links follow `SUMMARY.md`;
- external links open separately;
- canonical metadata points to `docs.acta.markets`.

Agent-facing checks:

- `Accept: text/html` returns the rendered page;
- `Accept: text/markdown` returns the original source with
  `Content-Type: text/markdown`;
- Markdown responses include `Content-Location` and canonical `Link`;
- docs-domain `robots.txt` allows public crawling and declares Content Signals;
- docs-domain `sitemap.xml` contains every canonical documentation URL;
- docs-domain `llms.txt` links every page plus beta/devnet API descriptions.

## Production verification

After the production deployment and DNS change:

```bash
curl -fsSI https://docs.acta.markets/
curl -fsSI https://docs.acta.markets/reference/http-api
curl -fsS https://docs.acta.markets/robots.txt
curl -fsS https://docs.acta.markets/sitemap.xml
curl -fsS https://docs.acta.markets/llms.txt
curl -fsS -H 'Accept: text/markdown' \
  https://docs.acta.markets/reference/http-api
```

Verify app discovery on both environments:

```bash
curl -fsSI https://beta.acta.markets/
curl -fsS https://beta.acta.markets/robots.txt
curl -fsS https://beta.acta.markets/.well-known/api-catalog
curl -fsS https://devnet.acta.markets/robots.txt
curl -fsS https://devnet.acta.markets/.well-known/api-catalog
```

Confirm:

- homepage `Link` headers advertise
  `https://docs.acta.markets` as `service-doc`;
- both app robots files reference
  `https://docs.acta.markets/sitemap.xml`;
- API catalog, OpenAPI, `llms.txt`, WebMCP, and visible navigation agree;
- beta API resources never point to devnet, and devnet resources never point
  to beta;
- no URL redirects to GitBook.

Run `isitagentready.com` against beta and devnet only after these checks pass.

## Rollback

If the docs hostname fails before the web deployment, do not change DNS.

If it fails after deployment:

1. remove `docs.acta.markets` from public discovery in a small rollback change;
2. keep `/docs` available on beta and devnet;
3. point navigation and `service-doc` to the verified beta `/docs` URL;
4. repair the domain separately;
5. restore the canonical docs origin only after HTTPS and all agent endpoints
   pass.

Vercel also supports reverting the production deployment, which immediately
reassigns configured custom domains to the previous production version.
