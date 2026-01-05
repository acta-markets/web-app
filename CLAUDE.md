# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start development server
npm run build    # Production build
npm run start    # Start production server
npm run lint     # Run ESLint
```

## Environment Setup

Create `.env.local` with:
```bash
MONGODB_URI="<connection_string>"
MONGODB_DB="yuzu"
NEXT_PUBLIC_PRIVY_APP_ID="<privy_app_id>"
NEXT_PUBLIC_APP_ENABLED="true"  # Set "false" to enable landing-only mode
```

## Architecture

**Next.js 14 App Router** with two route groups:
- `(marketing)` - Landing page at `/`
- `(app)` - Protected app routes: `/earn`, `/portfolio`, `/market/[asset]`

**Middleware** (`middleware.ts`) gates app routes based on `NEXT_PUBLIC_APP_ENABLED`. When disabled, app routes redirect to landing but `/api/whitelist` remains accessible.

**Auth**: Privy (`@privy-io/react-auth`) wraps the `(app)` layout via `PrivyAppProvider`.

**Price Feeds**: Pyth Network oracle integration:
- `src/lib/pyth-ids.ts` - Price feed IDs for supported assets
- `/api/pyth/stream` - SSE proxy to Hermes for real-time prices
- `/api/pyth/latest` - Latest price snapshots

**Markets**: Static market definitions in `src/lib/markets.ts` with call/CSP (cash-secured put) types, APR ranges, and price options.

**Database**: MongoDB via `src/lib/mongodb.ts` with global connection caching for dev HMR.

## Key Conventions

- Path alias: `@/*` maps to `src/*`
- Design system primitives: `src/components/ui/` (Button, Card, Badge, Container, Input)
- Page sections: `src/components/sections/`
- Dark mode: class-based via Tailwind (`darkMode: "class"`)
- Custom colors: `yuzu-main` (#CCFF00), `yuzu-accent` (#FF00E5), `yuzu-dark` (#0F0F0F)
- Neobrutalist shadows: `shadow-neo`, `shadow-neo-hover`, `shadow-neo-sm`
