# Acta Web (Next.js + Tailwind)

Acta's website and options trading app, built with Next.js App Router, Tailwind and TypeScript. Shared UI components live in `src/components/ui/`.

## Run locally

```bash
npm ci
npm run dev
```

## RFQ integration

The app uses the published `@acta-markets/ts-sdk` 0.2.2, pinned in `package.json`
and `package-lock.json`. A separate SDK checkout or build is not required.
WebSocket integration imports `@acta-markets/ts-sdk/ws`.

`NEXT_PUBLIC_RFQ_WS_URL` selects the
backend, and `NEXT_PUBLIC_SOLANA_NETWORK` selects the matching token addresses.
Market prices and indicative premiums come from that backend.
`NEXT_PUBLIC_PYTH_FEED_SHARDS` (comma-separated, default `0`) lists the Pyth
push-oracle shards that backend posts vault feeds to; it must match the tx-service
`pyth_feed_shards` of that network, or vault swaps fail verification.

The SDK checks auth challenge format before opening the wallet. The app supplies
the selected wallet's signing callback without logging or rewriting the message.
Maker-quote fills are signed only through `verifyAndSignTakerFill`: the served
transaction is rebuilt from the accepted quote and RFQ terms before the wallet
sees it (a vault maker is recognised from its on-chain account, read when the
quote is accepted), and the wallet's result must be that transaction.

Resume credentials require a future expiry in Unix seconds. Missing or expired
stored credentials start fresh authentication; reconnect recovery preserves the
selected order and never resubmits an already sent transaction.

Unfinished orders are stored locally per wallet and RFQ backend as identifiers,
submission state, and an optional transaction signature only. Transaction
payloads are never stored or replayed; recovery reconciles authoritative order
state before an unsigned same-session order can retrieve its signing payload.

## Documentation

Website documentation is authored in `docs-site`. It has two sections: User guide
and Protocol & integrations. `SUMMARY.md` defines their navigation and search index.
Run `npm run check:docs` to validate pages, links and heading anchors, then
`npm run build` to check rendering. The separate `public-docs` repository is
maintained independently; its contents are not copied into this site.

## MongoDB (whitelist)

The whitelist form posts to `POST /api/whitelist` and stores submissions in MongoDB.

See `ENV_SETUP.md` to set `MONGODB_URI` / `MONGODB_DB` and `NEXT_PUBLIC_PRIVY_APP_ID` in your local `.env.local`.

## Where things live

- **Design system primitives**: `src/components/ui/`
  - `Button`, `Card`, `Badge`, `Container`, `Input`
- **Page sections**: `src/components/sections/`
  - `Navbar`, `Hero`, `Marquee`, `Architecture`, `Solution`, `Whitelist`, `Team`, `Footer`
- **Global styles**: `src/app/globals.css`
- **Vaults**: data layer in `src/lib/vaults/`, hooks in `src/components/vaults/` (see `docs/vaults-integration.md`)
