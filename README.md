# Acta Web (Next.js + Tailwind)

Acta's website and options trading app, built with Next.js App Router, Tailwind and TypeScript. Shared UI components live in `src/components/ui/`.

## Run locally

```bash
npm install
npm run dev
```

## RFQ integration

The app uses `@acta-markets/ts-sdk/ws`; its exact version is pinned in
`package.json` and `package-lock.json`. `NEXT_PUBLIC_RFQ_WS_URL` selects the
backend, and `NEXT_PUBLIC_SOLANA_NETWORK` selects the matching token addresses.
Market prices and indicative premiums come from that backend.

Resume credentials require a future expiry in Unix seconds. Missing or expired
stored credentials start fresh authentication; reconnect recovery preserves the
selected order and never resubmits an already sent transaction.

Unfinished orders are stored locally per wallet and RFQ backend as identifiers,
submission state, and an optional transaction signature only. Transaction
payloads are never stored or replayed; recovery reconciles authoritative order
state before an unsigned same-session order can retrieve its signing payload.

Public documentation lives in the sibling `public-docs` repository. After editing
it, run `npm run sync:docs`, `npm run check:docs-source`, and `npm run check:docs`
to update and validate the site's copy in `docs-site`.

## MongoDB (whitelist)

The whitelist form posts to `POST /api/whitelist` and stores submissions in MongoDB.

See `ENV_SETUP.md` to set `MONGODB_URI` / `MONGODB_DB` and `NEXT_PUBLIC_PRIVY_APP_ID` in your local `.env.local`.

## Where things live

- **Design system primitives**: `src/components/ui/`
  - `Button`, `Card`, `Badge`, `Container`, `Input`
- **Page sections**: `src/components/sections/`
  - `Navbar`, `Hero`, `Marquee`, `Architecture`, `Solution`, `Whitelist`, `Team`, `Footer`
- **Global styles + legacy effects**: `src/app/globals.css`
- **Legacy snapshots**: `legacy/oldindex.html` (original) and `legacy/index.html` (whitelist version)
