# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start development server
npm run build    # Production build
npm run start    # Start production server
npm run lint     # Run ESLint
npm test         # Run tests
npm run test:watch  # Run tests in watch mode
npm run build:mcp   # Build packages/mcp/dist/cli.js, the MCP server an agent runs
```

## Post-Push Deployment Workflow (Required)

After every `git push`, always verify deployment status on Vercel and fix-forward if needed.

1. **Identify project/team**
   - Team ID: `team_J2ROv1pOThoNi7xxlgy6AVPm`
   - Project ID: `prj_e7I8FKtPMxD6cirzUUeHEglKwOvk`
   - If this changes, rediscover via MCP: `list_teams` -> `list_projects`.

   IDs are stable; project/team slugs may change with rebrands — always prefer IDs.

2. **Find latest deployment for pushed branch/commit**
   - Use MCP `list_deployments` for the project/team.
   - Match by `githubCommitSha` and/or `githubCommitRef`.

3. **Track until terminal state**
   - Poll deployment state (`QUEUED`/`BUILDING` -> `READY`/`ERROR`).
   - Stream logs with `get_deployment_build_logs` while building.

4. **If deployment is `READY`**
   - Report deployment URL + inspector URL.
   - Include any warnings that may become future failures.

5. **If deployment is `ERROR`**
   - Capture first actionable root cause from build logs.
   - Implement a fix in code (no rollback unless requested).
   - Re-run local sanity checks (`npm run build` minimum).
   - Commit, push, and repeat this workflow until deployment is `READY`.

6. **Communication format**
   - Always provide: commit SHA, deployment ID, final state, URL, and concise error/fix summary.

## Environment Setup

Create `.env.local` with:
```bash
MONGODB_URI="<connection_string>"
MONGODB_DB="acta"
NEXT_PUBLIC_PRIVY_APP_ID="<privy_app_id>"
NEXT_PUBLIC_APP_ENABLED="true"  # Set "false" to enable landing-only mode
NEXT_PUBLIC_RFQ_WS_URL="wss://beta-api.acta.markets"  # Optional override; defaults to devnet-api on devnet, beta-api on mainnet
NEXT_PUBLIC_SOLANA_NETWORK="mainnet"  # "devnet" (default), "mainnet" or "mainnet-beta"; controls mints, RPC, wallet, explorer and backend defaults
NEXT_PUBLIC_SOLANA_RPC_URL="<mainnet_rpc_url>"  # Optional browser-accessible RPC endpoint; called directly
# NEXT_PUBLIC_API_URL="https://beta-api.acta.markets"  # Optional: vault HTTP API; defaults to the RFQ WebSocket host
# NEXT_PUBLIC_VAULTS_SAMPLE="1"  # Dev only: sample vaults on /earn; ignored by production builds
```

### Hard rule: the `devnet` branch targets devnet

Every build of the `devnet` branch talks to the devnet backend (`wss://devnet-api.acta.markets`) on Solana devnet. It never talks to `beta-api` or mainnet.

- `next.config.mjs` enforces this: when `VERCEL_GIT_COMMIT_REF` is `devnet` it forces `NEXT_PUBLIC_SOLANA_NETWORK=devnet` and blanks `NEXT_PUBLIC_RFQ_WS_URL`, `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_SOLANA_RPC_URL`, so the Vercel project's Preview variables cannot redirect it. `src/lib/devnet-branch-env.test.ts` guards it.
- Do not remove or weaken that override, and do not add a network or backend variable that bypasses it. A new `NEXT_PUBLIC_*` variable that selects a network or backend must be added to the override.
- Why: `devnet` follows the devnet backend's wire format, which can be ahead of beta. Pointed at `beta-api`, the SDK rejects the handshake and the app shows "This app requires the WS 1.0.0 API".
- Locally, keep `.env.local` on devnet while working on this branch.

## Architecture

**Next.js 14 App Router** with two route groups:
- `(marketing)` - Landing page at `/`. While the app is enabled the middleware sends a browser that opens `/` on to `/trade` (307), so people skip the landing page; an agent asking for markdown still gets the home document, and with the app disabled `/` is the landing page.
- `(app)` - Protected app routes: `/earn` (vaults), `/earn/[vault]`, `/trade` (Easy mode; `?mode=pro` is a placeholder), `/portfolio`, `/rewards` (leagues, points and boards), `/agent`, `/market/[asset]` (the previous market page, reached by direct URL)

**Middleware** (`middleware.ts`) gates app routes based on `NEXT_PUBLIC_APP_ENABLED`. When disabled, app routes redirect to landing but `/api/whitelist` remains accessible.

**Wallet**: Solana Wallet Standard via `@wallet-standard/react`:
- `src/components/solana/solana-wallet-provider.tsx` - Wallet context provider
- `src/components/solana/solana-connect-button.tsx` - Connect button component
- Supports Phantom, Solflare, and other Wallet Standard wallets
- The last connected wallet is remembered in this browser (`src/lib/wallet-memory.ts`, localStorage `acta_last_wallet`: the wallet's name and public address only) and reconnected on load with a silent connect, which a wallet answers only if it already trusts the site. Disconnecting forgets it. The wallet panel lists it first, marked "Last used".

**Market prices and APR**: The market page uses the configured RFQ backend’s `GetTokenMarketsInfo.reference_price` and indicative premiums, refreshed together every 30 seconds. APR uses the existing SDK formula and is unavailable for stale indicatives. The backend owns oracle access; the frontend has no direct Hermes integration.

**Trade (Easy mode)**: `/trade` is one sentence the user fills in: "I believe [asset] will be [above/below] [price] on [date]. If I deposit [amount], I get paid ≈$X now." A price chart and the order details sit underneath. Selling: `above` sells a cash-secured put and `below` sells a covered call; right means the deposit comes back, wrong means it converts at the strike. Buying: `above` buys a call and `below` a put, exercised only by a deposit before expiry; or a spread, which takes no deposit, loses at most the premium and pays at most its width: `above` is a call spread, `below` a put spread or a cash put down to zero. A call is never offered without its upper leg. `?asset=` preselects an asset.
- `src/lib/trade/` - pure logic shared with the market page: `thesis.ts` (direction mapping, outcome math, all Easy copy), `strikes.ts` (expiries, strikes and APR from a snapshot), `sizing.ts` (size rule, deposit and quantity conversion), `assets.ts`, `format.ts`
- `src/components/trade/easy/` - the sentence, the chart (CoinGecko history via `/api/market/history`) and the order details
- `src/components/rfq/use-token-markets-snapshot.ts` and `use-quote-request.ts` - the 30s snapshot refresh and the quote request lifecycle, used by both trade pages
- `docs/taker-buy-integration.md` - buy flow end to end: side, quote ranking, signing, wallet-paid deposit, portfolio states, backend contract, where to add things

**Markets**: Assets and per-strategy cap utilization come from the RFQ backend's earn summary. The market page reads live strikes, indicative premiums and reference prices through `GetTokenMarketsInfo`. `src/lib/markets.ts` contains shared display formatting only.

**Vaults**: `/earn` lists vaults by category and `/earn/[vault]` shows one, read from the vault HTTP API (`/api/v1/vaults`, `/vaults/{pda}`, `/cycles`) through `@acta-markets/ts-sdk/http`:
- `src/lib/vaults/` - API client, contract rules, depositor transactions, plus `registry.ts` (name, curator and category by vault PDA, which the backend does not serve), `metrics.ts` (30d avg APR, Sharpe ratio, drawdown, from completed cycles only) and `presentation.ts` (status, sort order, block copy)
- `src/components/vaults/` - polling hooks (`use-vaults.ts`), the grid, the vault page and the deposit/withdraw modal
- `docs/vaults-integration.md` - data sources, polling budget and UI rules
- `NEXT_PUBLIC_VAULTS_SAMPLE=1` swaps in fixture vaults from `src/lib/vaults/sample-data.json` in development (loaded on demand by `sample.ts`); production builds ignore it

**Share cards**: A confirmed trade, the Portfolio's Net P&L card and each open position with a uPnL (its uPnL figure is the button) can be shared as a 1200x675 image, with Download, Copy image and Share on X; a touch device that can share files gets the system share sheet instead.
- The card travels in a link. `/share?c=…` is the page a post links to: its metadata names the card's image, so the post shows the picture. `/share/card?c=…` draws that image on the server with `next/og` (`s=2` for a sharp file); the app's own preview, the saved file and the post's picture are that one image. Both live outside `/api` because robots.txt closes `/api/` to the crawlers that build link previews.
- `src/lib/share/` - `card.ts` (what a card says: `tradeShareCard`, `pnlShareCard`, `positionShareCard`), `params.ts` (the card in a link, and the check on the way back in), `card-image.tsx` (the drawing), `server-assets.ts` (fonts from Google Fonts and public images, fetched once per server instance), `render.ts` (the app fetching the image), `actions.ts` (clipboard, download, X post link, referral link)
- `src/components/share/share-card.tsx` - `ShareButton`, `ShareCardPanel`, `ShareCardModal`
- Anyone can write a card link by hand. `decodeShareCard` therefore accepts only the app's own labels and product names and text shaped like a price, a rate, a date or a view; a new label or product name has to be added there (a test fails until it is). A made-up number still gets through, so never describe a card as verified.
- The "Devnet" tag is decided by the server that draws the card, never by the link; keep that, test funds must not read as real money
- `/dev/share` shows every card

**Site metadata**: what a page says about itself in a tab, a search result and a link preview comes from `src/lib/site-metadata.ts`.
- A page states its title, one line and its address through `pageMetadata({ title, description, path, image, index })`; the site's name, the canonical link, `og:url` and the picture follow. On devnet the name is "Acta Devnet" and every description ends "Devnet: test funds only." (from `IS_MAINNET`), and `siteOrigin()` is always `https://devnet.acta.markets` there, never the Vercel project's production address.
- A page that sets any `openGraph` field replaces the layout's whole set, picture included. So never set `openGraph` by hand on a page: use `pageMetadata`, which always names a picture.
- Preview pictures are named, not file-convention images: `src/lib/site-images.ts` says what each shows (`site`, `trade`, `earn`, `agent`), `src/lib/site-image.tsx` draws it in the share card's frame (`cardFrame` in `src/lib/share/card-image.tsx`), `/og/[name]` serves it. No rate goes on a picture: the lineup's rates are assumptions.
- `index: false` on pages that are one wallet's own or not offered (`/portfolio`, `/referrals`, `/spreads`, `/trade2`); `/data-room` is noindex in its layout. The sitemap (`getSitemapUrls`) leaves out `/` while the app is on, because it redirects to `/trade`.
- Icons: `icon.svg`, `apple-icon.tsx`, `/app-icon/[size]` (PNG; the manifest's icons) and `favicon.ico`, which is the 16/32/48 PNGs in one file. After changing the logomark run `node scripts/make-favicon.mjs` with the dev server up. `manifest.ts` is the web manifest.
- `not-found.tsx` and `error.tsx` exist at the root and inside `(app)`; both draw `src/components/site/status-view.tsx`. `/dev/states` shows them (`?missing=1` triggers a real `notFound()`).
- A new top-level file route (an icon, a manifest, a picture) must be added to `DOCS_RESERVED_PATHS` in `src/middleware.ts`, or the docs host rewrites it to a guide page.

**Rewards**: `/rewards` shows the season the backend is running: its leagues, each league's rules as a checklist, the trader and clan boards, and a connected wallet's own standing and awards. It is read from the SDK's seasons API (`currentSeason`, `seasonBoard`, `seasonSubject`, `seasonAwards` on `ActaHttpClient`), with no sign-in: a wallet's points are looked up by its address.
- `src/lib/rewards/` - `api.ts` (the calls; a 404 is "no season" or "no points", not a failure), `view.ts` (everything the page says, pure and tested), `source.ts` (the only place live and sample data split), `sample-season.ts` (a made-up season in the wire's shape, from the leagues draft of 14 Nov 2026)
- `src/components/rewards/` - `use-season.ts` (polling hooks and the page's choices), `rewards-parts.tsx` (presentational pieces), `rewards-view.tsx`, `rewards-client.tsx`
- A rule's title and description are the backend's words, shown as they come. A rule's `points` and a cap's `max` are CEL formulas: a figure is shown only when the formula is a plain number, otherwise "Varies". Never parse or print the formula.
- The page is the trader's (`role: "taker"`). A drop is labelled "test funds" on devnet (from `IS_MAINNET`); prize pools are not shown, the `pool` transform's unit is not stated.
- Sample mode is for development only: `NEXT_PUBLIC_REWARDS_SAMPLE=1` or `/rewards?sample=1`, never in a production build, and the page says "Sample data". `/dev/rewards` shows every state.
- Not served by the backend, so not in the app: eligibility (X or mainnet wallet), naming or joining a clan, feedback, drop history.

**Sign-in and onboarding**: the modal that asks a wallet to sign in is also the first-run welcome. `src/components/onboarding/sign-in-onboarding.tsx` (mounted in `(app)/layout.tsx`) watches the RFQ connection and drives `sign-in-modal.tsx`; `src/lib/onboarding.ts` holds the rules (`signInView`).
- The prompt goes up 800 ms into `authenticating`, so a resumed session never flashes it. A sign-in that ends without a signature shows "Sign-in was not completed" with Try again.
- The welcome is the prompt's next state, never a modal of its own: only after a signature just given, only for a wallet that has never traded (`referralInfo.status === "pending"`), once per wallet and backend (localStorage `acta_welcome_seen:<backend>:<wallet>`), and never over the invite gate.
- A first sign-in lands on Trade (`firstSignInDestination`): when the welcome comes up anywhere else in the app the visitor is taken to `/trade` once, with the welcome over it. A returning trader stays where they signed in.
- Test funds are shown as the chain reports them (`useTokenBalance`), "Arriving" until then; no amount is promised in copy. The funds step exists on devnet only.
- `/dev/sign-in` shows every state.

**State and persistence**: every piece of state has one of four homes (`src/lib/state/`). Pick the home before writing the state.
- **Server data** lives in the shared query cache (TanStack Query, `query-client.ts`), one copy per read, shared by every page and kept across navigation. A read for display goes through `useResource` (`use-resource.ts`); with `persist: true` it is also saved to IndexedDB (database `acta-state`, one entry per read) and shown on the next visit until a fresh read replaces it. Data the socket pushes (positions, referral info, the earn summary) is kept with `remember` and read with `useRemembered` (`remembered.ts`).
- **Keys** are `[backend, scope, resource, ...]` (`keys.ts`): `publicKey(...)` for data anyone sees, `walletKey(wallet, ...)` for a wallet's own. The backend is first so devnet and mainnet never mix; the wallet is second so `forgetWallet` drops everything of one wallet, which disconnecting does (it also clears that wallet's session).
- **Last-known data is for display only.** Nothing read back from the device may build an order, size a deposit or move funds. A read on the money path stays on `usePolled` (`src/components/vaults/use-vaults.ts`), which caches nothing, or on this session's own socket data; `isLive` in `freshness.ts` is the test an action must pass. Saving is opt-in per read, so a quote or a signing payload cannot be written by accident: never add `persist` to one.
- **Trade's first screen** is drawn from what the device kept: the asset list, the selected asset's market snapshot and the fee schedule (`src/lib/trade/last-known.ts`; `primeTrade()` starts the reads as the page's code loads). `sentence-trade.tsx` uses `liveSnapshot ?? lastKnown` to draw and `liveSnapshot` alone to enable the button, which reads "Updating prices..." until then. Keep that split: a new use of the snapshot that reaches a quote must take `liveSnapshot`. A saved premium older than 10 minutes shows as no price; a saved snapshot older than a day is not used.
- **Identity and small choices** go in localStorage through `createLocalStore` (`local-store.ts`): versioned, validated on the way back in, shared between tabs, and working in memory when storage refuses. `registry.ts` lists every browser key; a new key is added there first. Examples: the last wallet (`src/lib/wallet-memory.ts`), the session per backend and wallet (`session-store.ts`), view habits (`view-prefs.ts`, `useViewPref`), the Trade setup (`src/lib/trade/draft.ts`).
- **What defines a view** (Trade's asset and direction) is also written to the address with `history.replaceState`, so a link reopens it. The address wins over what was remembered.
- **Money-path state** (quotes, signing payloads, the accepted order) stays in memory. The one exception is the unfinished-order record in `use-rfq-order.ts`, which has its own format and is not part of this system; `UnfinishedTradeNotice` only reads it.
- **Returning wallet**: `expectedAccount` from `useSolana()` is the remembered wallet while it reconnects. Pages render for it from the device copy instead of asking to connect, mark what they show as last-loaded, and offer no action until the wallet is connected and signed in.
- Tests: `src/test/setup.ts` empties the cache, browser storage and the address after each test.

**Agents (MCP)**: an AI agent uses Acta through two MCP servers built from one tool list. Devnet only.
- `src/lib/agent/` - the headless core, no React and no `NEXT_PUBLIC_*` reads: `tools.ts` (the tool list, plain data), `catalog.ts` (input schemas, zod 4), `handlers.ts`, `session.ts` (one lazy venue connection), `markets.ts`, `trade.ts` (quote, limit check, sign, submit, confirm in one call), `positions.ts`, `vaults.ts` (vault reads), `vault-actions.ts` (a wallet's own vault position: deposit, withdraw, cancel and process a request, by the same rules as the app's deposit screen in `src/lib/vaults/rules.ts`), `exercise.ts` (fund a bought option), `send.ts` (a wallet-paid transaction), `limits.ts`, `journal.ts`, `signer.ts` (a key file, or any signer through `ACTA_SIGNER_MODULE`), `mcp.ts` (the MCP server over the catalog), `hosted.ts`, `install.ts` (what the page and docs show: `agentTools`, the one step that adds Acta to each AI tool, and `agentPrompt`, the prompt any other agent follows to connect itself)
- `src/lib/trade/quotes.ts` and `fill.ts` - which quote wins and how a served fill is verified and signed; shared with the web app
- `packages/mcp/` - the server an agent's owner runs on their own machine. The first tool call makes its own devnet wallet in `~/.acta-mcp` (`ACTA_KEYPAIR` or `ACTA_SIGNER_MODULE` override it), so setup needs no key (`npm run build:mcp`, then `node packages/mcp/smoke.mjs` drives it over stdio). Published by hand: `cd packages/mcp && npm publish` (it rebuilds first). After the first publish set `MCP_PUBLISHED` in `install.ts`; bump `version` for each later one
- `packages/sak-plugin/` - the same tools as a Solana Agent Kit v2 plugin (`npm run build:sak`). It has its own `node_modules` (the kit is on zod 3) and its own `tsconfig.json`; the root `tsconfig.json` excludes it, so check it with `npx tsc --noEmit -p packages/sak-plugin`
- `/mcp` - the site's endpoint: read-only tools, no key, served from the backend's HTTP API (`/tokens`, `/tokens/{mint}/markets`, `/earn-summary`, `/vaults`); it opens no WebSocket. `/mcp/server-card` and `/.well-known/ai-catalog.json` point at it
- `/agent` - the page, and its markdown twin (`getAgentMarkdown`). The page is one widget (`src/components/agent/connect-agent.tsx`): ten buttons, two rows of five (nine makers and "Other agents", `PROVIDERS` in `install.ts`), then two steps for the tool picked. Step one has a single thing to press: the tool's install link (the entry to paste is folded under it) or a button that copies the command. The choice is kept in the address (`/agent?tool=hermes&mode=read`), so a link can open on a tool. A new tool is one entry in `agentTools` plus its id under a maker in `PROVIDERS`, with a step that was run or read in the tool's own docs. Keep the grid at two full rows: a new tool goes under its maker or under "Other agents". A maker's mark is a file in `public/images/agent-tools/`, drawn as a mask in the text colour
- A new tool goes in `tools.ts` (with the `area` the page lists it under), `catalog.ts` and `handlers.ts`; tests hold the three to each other and to the trading skill. A tool that moves funds must be `local` and refuse when `limits.readOnly`; one that trades must also take a limit price and go through `checkTrade` and the journal; a vault deposit is counted against the same limits by its dollar value. Everything that takes funds out of the wallet (a trade, a vault deposit, an option's funding) is admitted by `reserveSpend` in `limits.ts`: the limit check and the journal line in one step under `journal.lock`, right before the step that cannot be taken back. Never check a limit in one place and write the journal in another. A dry run and a preview run `checkSpend` too. A trade runs through the SDK's `tradeRfq`; the reservation happens in its `lookupTables` hook, before signing. Once a fill has been submitted, only `OrderUpdate` `failed` is a failure; anything else is `unknown`, settled later by `settleJournal`: the venue's `expired` closes it, and an old order the venue cannot place is looked up on chain and among the positions
- Nothing from the venue reaches an agent as raw text: use `plainText` and `plainSymbol` (`errors.ts`)
- `docs-site/quickstart/mcp.md` is the public description; `docs/agent-readiness.md` the inventory

**Tokens**: Centralized token configuration in `src/lib/tokens.ts`:
- Token mints for mainnet/devnet (switched via `NEXT_PUBLIC_SOLANA_NETWORK`)
- Token metadata (decimals, logos)
- Helper functions: `getToken()`, `getTokenMint()`, `getTokenLogo()`

**Database**: MongoDB via `src/lib/mongodb.ts` with global connection caching for dev HMR.

**RFQ Infrastructure**: WebSocket client using `@acta-markets/ts-sdk` (see `package.json` for the pinned version):
- `src/lib/rfq-client.ts` - Thin wrapper around SDK's `ActaWsClient`
- `src/components/rfq/rfq-provider.tsx` - Shared React connection, discovery and RFQ request state; token metadata is bound to its underlying mint and request ID
- `src/components/market/use-rfq-order.ts` - Persists selected order identity per wallet and RFQ backend through reload, and whether its signature was sent. After same-credential resume, `GetMyActiveRfqs` can authorize repeating `AcceptQuote` for the same pending order to retrieve its signing payload. Submitted transactions are never replayed; `GetOrderStatus` reconciles execution.
- Connects via `NEXT_PUBLIC_RFQ_WS_URL` env variable
- Auth flow: `connectAnonymous()` → user clicks connect → `authenticate(walletAuthProvider)`
- Challenge is human-readable text signed as UTF-8 bytes

### Quote flow modes (for rollback)

- **Current mode (fresh on click)**:
  - Easy mode and the market page show indicative APR/premium only.
  - RFQ quote is requested when `Get quote` (Easy) or `Deposit` (market page) is clicked.
  - While waiting, CTA shows `Getting quote...`.
  - Modal opens only after matching quote arrives.

- **Previous mode (prefetch on page)**:
  - Quote requested automatically when price + size are selected.
  - Quote refreshed periodically (every 30s, faster when stale).
  - Deposit reused prefetched quote and opened modal immediately with locked values.
  - If rollback needed, restore quote prefetch effects in `src/components/rfq/use-quote-request.ts`.

## Key Conventions

- Path alias: `@/*` maps to `src/*`
- Design system primitives: `src/components/ui/` (Button, Card, Badge, Container, Input)
- Page sections: `src/components/sections/`
- Dark mode: class-based via Tailwind (`darkMode: "class"`)
- Theme colors are CSS variables (`--accent-primary`, `--bg-*`, `--text-*`) defined in `src/app/globals.css`; reference them via Tailwind utilities (e.g. `bg-accent-primary`).
- Neobrutalist shadows: `shadow-neo`, `shadow-neo-hover`, `shadow-neo-sm`
