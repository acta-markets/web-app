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
   - Team: `frakt` (`team_J2ROv1pOThoNi7xxlgy6AVPm`)
   - Project: `yuzu-web-76j7` (`prj_e7I8FKtPMxD6cirzUUeHEglKwOvk`)
   - If this changes, rediscover via MCP: `list_teams` -> `list_projects`.

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
MONGODB_DB="yuzu"
NEXT_PUBLIC_PRIVY_APP_ID="<privy_app_id>"
NEXT_PUBLIC_APP_ENABLED="true"  # Set "false" to enable landing-only mode
NEXT_PUBLIC_RFQ_WS_URL="wss://devnet-api.acta.markets"  # RFQ infrastructure WebSocket
NEXT_PUBLIC_SOLANA_NETWORK="mainnet"  # "mainnet" or "testnet" - controls token mints
```

## Architecture

**Next.js 14 App Router** with two route groups:
- `(marketing)` - Landing page at `/`
- `(app)` - Protected app routes: `/earn`, `/portfolio`, `/market/[asset]`

**Middleware** (`middleware.ts`) gates app routes based on `NEXT_PUBLIC_APP_ENABLED`. When disabled, app routes redirect to landing but `/api/whitelist` remains accessible.

**Wallet**: Solana Wallet Standard via `@wallet-standard/react`:
- `src/components/solana/solana-wallet-provider.tsx` - Wallet context provider
- `src/components/solana/solana-connect-button.tsx` - Connect button component
- Supports Phantom, Solflare, and other Wallet Standard wallets

**Price Feeds**: Pyth Network oracle integration:
- `src/lib/pyth-ids.ts` - Price feed IDs for supported assets
- `/api/pyth/stream` - SSE proxy to Hermes for real-time prices
- `/api/pyth/latest` - Latest price snapshots

**Markets**: Static market definitions in `src/lib/markets.ts` with call/CSP (cash-secured put) types, APR ranges, and price options.

**Tokens**: Centralized token configuration in `src/lib/tokens.ts`:
- Token mints for mainnet/testnet (switched via `NEXT_PUBLIC_SOLANA_NETWORK`)
- Pyth price feed IDs
- Token metadata (decimals, logos)
- Helper functions: `getToken()`, `getTokenMint()`, `getTokenLogo()`, `getTokenPythId()`

**Database**: MongoDB via `src/lib/mongodb.ts` with global connection caching for dev HMR.

**RFQ Infrastructure**: WebSocket client using `@acta-markets/ts-sdk@0.0.9-beta`:
- `src/lib/rfq-client.ts` - Thin wrapper around SDK's `ActaWsClient`
- `src/lib/use-rfq.ts` - React hook for component integration
- Connects via `NEXT_PUBLIC_RFQ_WS_URL` env variable
- Auth flow: `connectAnonymous()` → user clicks connect → `authenticate(walletAuthProvider)`
- Challenge is human-readable text signed as UTF-8 bytes

### Quote flow modes (for rollback)

- **Current mode (fresh on Deposit)**:
  - Market page shows indicative APR/premium only.
  - RFQ quote is requested when `Deposit` is clicked.
  - While waiting, CTA shows `Getting quote...`.
  - Modal opens only after matching quote arrives.

- **Previous mode (prefetch on page)**:
  - Quote requested automatically when price + size are selected.
  - Quote refreshed periodically (every 30s, faster when stale).
  - Deposit reused prefetched quote and opened modal immediately with locked values.
  - If rollback needed, restore quote prefetch effects in `src/components/market/market-client.tsx`.

## Key Conventions

- Path alias: `@/*` maps to `src/*`
- Design system primitives: `src/components/ui/` (Button, Card, Badge, Container, Input)
- Page sections: `src/components/sections/`
- Dark mode: class-based via Tailwind (`darkMode: "class"`)
- Custom colors: `yuzu-main` (#CCFF00), `yuzu-accent` (#FF00E5), `yuzu-dark` (#0F0F0F)
- Neobrutalist shadows: `shadow-neo`, `shadow-neo-hover`, `shadow-neo-sm`
