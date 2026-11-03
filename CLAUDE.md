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

## Architecture

**Next.js 14 App Router** with two route groups:
- `(marketing)` - Landing page at `/`
- `(app)` - Protected app routes: `/earn` (vaults), `/earn/[vault]`, `/trade` (Easy mode; `?mode=pro` is a placeholder), `/portfolio`, `/market/[asset]` (the previous market page, reached by direct URL)

**Middleware** (`middleware.ts`) gates app routes based on `NEXT_PUBLIC_APP_ENABLED`. When disabled, app routes redirect to landing but `/api/whitelist` remains accessible.

**Wallet**: Solana Wallet Standard via `@wallet-standard/react`:
- `src/components/solana/solana-wallet-provider.tsx` - Wallet context provider
- `src/components/solana/solana-connect-button.tsx` - Connect button component
- Supports Phantom, Solflare, and other Wallet Standard wallets

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
