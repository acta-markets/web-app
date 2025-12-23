# Yuzu Web (Next.js + Tailwind)

This repo ports the original `index.html` landing page into a **Next.js (App Router) + Tailwind + TypeScript** project and extracts a small **design system** out of the repeated neobrutalist patterns.

## Run locally

```bash
npm install
npm run dev
```

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


