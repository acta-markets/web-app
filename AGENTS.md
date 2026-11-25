# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

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

### Hard rule: the `devnet` branch targets devnet

Every build of the `devnet` branch talks to the devnet backend (`wss://devnet-api.acta.markets`) on Solana devnet. It never talks to `beta-api` or mainnet.

- `next.config.mjs` enforces this: when `VERCEL_GIT_COMMIT_REF` is `devnet` it forces `NEXT_PUBLIC_SOLANA_NETWORK=devnet` and blanks `NEXT_PUBLIC_RFQ_WS_URL`, `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_SOLANA_RPC_URL`, so the Vercel project's Preview variables cannot redirect it. `src/lib/devnet-branch-env.test.ts` guards it.
- Do not remove or weaken that override, and do not add a network or backend variable that bypasses it. A new `NEXT_PUBLIC_*` variable that selects a network or backend must be added to the override.
- Why: `devnet` follows the devnet backend's wire format, which can be ahead of beta. Pointed at `beta-api`, the SDK rejects the handshake and the app shows "This app requires the WS 1.0.0 API".
- Locally, keep `.env.local` on devnet while working on this branch.

## Architecture

**Next.js 14 App Router** with two route groups:
- `(marketing)` - Landing page at `/`
- `(app)` - Protected app routes: `/earn` (vaults), `/earn/[vault]`, `/trade` (Earn | Profit modes), `/trade2` (UI experiments; `/market/[asset]` redirects to `/trade?asset=…` — the old market page retired into the trade page), `/portfolio`

**Middleware** (`middleware.ts`) gates app routes based on `NEXT_PUBLIC_APP_ENABLED`. When disabled, app routes redirect to landing but `/api/whitelist` remains accessible.

**Wallet**: Solana Wallet Standard via `@wallet-standard/react`:
- `src/components/solana/solana-wallet-provider.tsx` - Wallet context provider
- `src/components/solana/solana-connect-button.tsx` - Connect button component
- Supports Phantom, Solflare, and other Wallet Standard wallets

**Market prices and APR**: The trade page uses the configured RFQ backend’s `GetTokenMarketsInfo.reference_price` and indicative premiums, refreshed together every 30 seconds. APR uses the existing SDK formula and is unavailable for stale indicatives; indicatives price the sell side only — buys say "the quoted premium" until an RFQ returns. The backend owns oracle access; the frontend has no direct Hermes integration.

**Trade (Earn | Profit)**: `/trade` is sentence-first: one editable belief — "I believe [asset] will be [above/below] [price] on [date]." — drives everything. As the sentence changes, the thesis chart highlights that strike. Below the sentence: an amount field with balance, a one-line summary (Earn: "You earn ≈$X now · risk $Y"; Profit: "You pay the quoted premium · max loss: the premium"), and a single Trade button that requests the RFQ quote. **Earn** (default, no param) sells the belief — above is a cash-secured put, below a covered call; right means the deposit comes back, wrong converts at the strike. **Profit** (`?mode=profit`) pays the premium — above buys a call, below buys a put; exercised only by a deposit before expiry. No greeks, no strike tables, no spread pickers: view → amount → confirm. `?asset=` preselects an asset; legacy `?mode=pro|easy` fall through to Earn.
- `src/lib/trade/` - pure trade logic: `thesis.ts` (strategies, direction mapping, outcome math, all copy), `strikes.ts` (expiries, strikes and APR from a snapshot), `sizing.ts` (size rule, deposit and quantity conversion), `assets.ts`, `format.ts`
- `src/components/trade/sentence/` - `sentence-trade.tsx` (the one sentence UI for both modes), `thesis-sentence.tsx` (the belief line), `thesis-chart.tsx` (the chart; CoinGecko history via `/api/market/history`)
- `src/components/rfq/use-token-markets-snapshot.ts` and `use-quote-request.ts` - the 30s snapshot refresh and the quote request lifecycle
- `docs/taker-buy-integration.md` - buy flow end to end: side, quote ranking, signing, wallet-paid deposit, portfolio states, backend contract, where to add things

**Markets**: Assets and per-strategy cap utilization come from the RFQ backend's earn summary. Live strikes, indicative premiums and reference prices come through `GetTokenMarketsInfo`. `src/lib/markets.ts` contains shared display formatting only.

**Vaults**: `/earn` lists vaults by category and `/earn/[vault]` shows one, read from the vault HTTP API (`/api/v1/vaults`, `/vaults/{pda}`, `/cycles`, `/exposure`) through `@acta-markets/ts-sdk/http`:
- `src/lib/vaults/` - API client, depositor transactions (contract rules come from the SDK's `flows`), plus `registry.ts` (display metadata from the backend, sample-mode fixtures, fallbacks), `metrics.ts` (return and TVL chart series from completed cycles; headline metrics are the backend's `performance`) and `presentation.ts` (APR, status, sort order, exposure, block copy)
- `src/components/vaults/` - polling hooks (`use-vaults.ts`), the grid, the vault page and the deposit/withdraw modal
- `docs/vaults-integration.md` - data sources, polling budget and UI rules
- `NEXT_PUBLIC_VAULTS_SAMPLE=1` swaps in fixture vaults from `src/lib/vaults/sample-data.json` in development (loaded on demand by `sample.ts`); production builds ignore it

**Agents (MCP)**: an AI agent uses Acta through two MCP servers built from one tool list. Devnet only.
- `src/lib/agent/` - the headless core, no React and no `NEXT_PUBLIC_*` reads: `tools.ts` (the tool list, plain data), `catalog.ts` (input schemas, zod 4), `handlers.ts`, `session.ts` (one lazy venue connection), `markets.ts`, `trade.ts` (quote, limit check, sign, submit, confirm in one call), `positions.ts`, `vaults.ts` (vault reads), `vault-actions.ts` (a wallet's own vault position: deposit, withdraw, cancel and process a request, by the same rules as the app's deposit screen in `src/lib/vaults/rules.ts`), `exercise.ts` (fund a bought option), `send.ts` (a wallet-paid transaction), `limits.ts`, `journal.ts`, `signer.ts` (a key file, or any signer through `ACTA_SIGNER_MODULE`), `mcp.ts` (the MCP server over the catalog), `hosted.ts`, `install.ts` (what the page and docs show: `agentTools`, the one step that adds Acta to each AI tool, and `agentPrompt`, the prompt any other agent follows to connect itself)
- `src/lib/trade/quotes.ts` and `fill.ts` - which quote wins and how a served fill is verified and signed; shared with the web app
- `packages/mcp/` - the server an agent's owner runs on their own machine. The first tool call makes its own devnet wallet in `~/.acta-mcp` (`ACTA_KEYPAIR` or `ACTA_SIGNER_MODULE` override it), so setup needs no key (`npm run build:mcp`, then `node packages/mcp/smoke.mjs` drives it over stdio). Published by hand: `cd packages/mcp && npm publish` (it rebuilds first). After the first publish set `MCP_PUBLISHED` in `install.ts`; bump `version` for each later one
- `packages/sak-plugin/` - the same tools as a Solana Agent Kit v2 plugin (`npm run build:sak`). It has its own `node_modules` (the kit is on zod 3) and its own `tsconfig.json`; the root `tsconfig.json` excludes it, so check it with `npx tsc --noEmit -p packages/sak-plugin`
- `/mcp` - the site's endpoint: read-only tools, no key, a venue session per request closed when the reply's body ends. `/mcp/server-card` and `/.well-known/ai-catalog.json` point at it
- `/agent` - the page, and its markdown twin (`getAgentMarkdown`). The page is one widget (`src/components/agent/connect-agent.tsx`): ten buttons, two rows of five (nine makers and "Other agents", `PROVIDERS` in `install.ts`), then two steps for the tool picked. A new tool is one entry in `agentTools` plus its id under a maker in `PROVIDERS`, with a step that was run or read in the tool's own docs. Keep the grid at two full rows: a new tool goes under its maker or under "Other agents". A maker's mark is a file in `public/images/agent-tools/`, drawn as a mask in the text colour
- A new tool goes in `tools.ts`, `catalog.ts` and `handlers.ts`; tests hold the three to each other and to the trading skill. A tool that moves funds must be `local` and refuse when `limits.readOnly`; one that trades must also take a limit price and go through `checkTrade` and the journal; a vault deposit is counted against the same limits by its dollar value
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
