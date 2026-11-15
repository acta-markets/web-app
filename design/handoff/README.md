# Acta Design System

Acta is a **structured yield and options protocol on Solana**. Its core product is an **RFQ-based European-style options venue with on-chain settlement**, targeting both DeFi and TradFi audiences. Key positioning: chain-agnostic execution, outcome-based onboarding, and Solana as a volatility layer.

## Products represented

- **Acta App** — the trading & yield web app. Surfaces:
  - **Earn** — deposit an asset, pick call or put, get yield if your target doesn't hit.
  - **Earn Market** — per-market detail with deposit flow, price picker, strategy math.
  - **Portfolio** — positions, transactions, balances.

One product surface; desktop (1440), tablet (992, 768) and mobile (375) breakpoints are all defined in the Figma.

## Sources

- **Figma** — mounted virtual filesystem (`Acta - App.fig`). Primary source of truth. Pages:
  - `/UI-kit/` — Colors + Typography specimens
  - `/Design-system/` — Button, Tag, Tabs, Toaster, Tables, Info-box, Deposit-input, Context-menu, Chart, Icons, Header & footer, Tokens-cards
  - `/Design/` — full product screens (Earn, Earn-Market, Portfolio), all breakpoints
  - `/x-Meta/` — cover + shared utility components
- **No codebase** attached. All recreations are based on the Figma pseudocode + render screenshots.

---

## Content Fundamentals

Acta's copy is **terse, literal, and finance-literate**. It assumes the reader understands options, APR, notional, maturity, premium, etc. It doesn't over-explain and it doesn't soften.

- **Tone:** calm, declarative, structured. No hype, no exclamation points, no "let's".
- **Voice:** second-person imperative where useful ("Deposit the asset and earn premium"), otherwise neutral-descriptive. Product speaks as "you", not "we".
- **Casing:** sentence case everywhere — page titles, buttons, table headers. Exceptions: ticker symbols (SOL, USDC, BTC, jitoSOL), asset names mixed-case as branded (jitoSOL, JLP).
- **Numbers:** always monospace via JetBrains Mono. APR values use `%`, sizes use `k`/`K`/`M` suffixes, prices use `$` prefix. Ranges use en-dash: `12%–34%`.
- **Microcopy examples from the Figma:**
  - Hero headline: `Earn`
  - Hero subtitle: `Get instant yield on your assets`
  - Call tile: `Calls ↗ — Deposit the asset and earn premium. If spot finishes above your selected price, you sell there, otherwise you keep your asset`
  - Put tile: `Puts ↘ — Deposit USDC and earn premium. If spot finishes below your selected price, you buy the asset there, otherwise you keep your USDC`
  - Link: `How it works »` (uses a chevron ornament, not an arrow icon)
  - Primary CTA: `Connect`, `Open market`, `Deposit`
  - Table headers: `Asset`, `Type`, `Min APR`, `Max APR`, `Cap filled`, `Maturity`, `Size`, `Notional`, `Outcome`
- **No emoji.** The only "emoji-ish" glyphs are typographic arrows (`↗`, `↘`, `»`, `›`) used as sparing ornaments in labels.
- **Labels are lowercase or Title Case-free.** "Cap filled" not "Cap Filled". "Min APR" not "min apr".

---

## Visual Foundations

### Color vibe
Dark, near-black canvas. A single **desaturated forest-green** (`#078568` → `#2AA286`) as the accent — used for primary CTAs, positive deltas, selected states, and thin progress bars. Neutrals are cool black and bright off-white. One orange spot color (`#FF611B`) appears only for the Bitcoin glyph. The overall feel is **terminal / Bloomberg-terminal / trading-desk**, not glossy Web3.

### Type
- **Headlines** — Space Grotesk SemiBold. Used for display sizes (40/48/64/114). Tight letter-spacing (`-0.02em`).
- **Body, numbers, nav, labels** — JetBrains Mono Regular/Medium/Bold at 12/14/16/20/24. This is by far the most-used family (442× vs 159×). Monospace gives the product its trading-terminal feel.
- **Occasional UI labels** — Geist Medium 16 (neutral sub-labels in the typography tables).
- There is **no serif** in the system. No script. No handwriting.

### Backgrounds
- Flat `#121212` for 99% of surfaces.
- The Earn hero uses a **mix-blend `hard-light`** composite: a duplicated, mirrored logomark silhouette, layered against a high-contrast grain/noise PNG (`assets/hero-texture.png`). Subtle, almost invisible — it looks like a watermark.
- No gradients. No animated backgrounds. No glassmorphic blobs. (There IS `backdrop-filter: blur(8–16px)` on info boxes and table wrappers over the hero region — this is the only "glass" in the system, and it's extremely restrained.)

### Borders
- `1px solid #282828` — every card, table, tile, input, tab container.
- Corners are sharp. **No `border-radius` on cards, tables, or tabs.** The only rounded elements are: pill-shaped tags (`border-radius: 999px`), asset token circles, and primary buttons (implicit rounding looks like ~0px or a hairline — treat as **0px default**, with tokens on token cards being full circles).
- The Figma uses dashed `#8A38F5` borders as **design-mode-only annotation guides** (to show component regions in the design-system page). These are NOT part of the product. Never ship them.

### Shadows
Almost none. The design leans on **border + flat surface** for elevation, not shadow. Two shadow tokens do exist:
- `0 0 0 1px rgba(18,18,18,0.32)` — ambient frame shadow, barely visible.
- `0 1px 2px rgba(16,24,40,0.06)` — utility shadow for floating elements (context menus, toasts). Very subtle.

### Spacing & radii
- Grid unit: 4px. Common steps: 4, 8, 12, 16, 20, 24, 40.
- Outer frame padding: **40px** on desktop frames.
- Card inner padding: **16px** (mobile-ish) to **20px / 24px** (desktop).
- Radii: `0px` (cards/tables/buttons/inputs by default), `5px` (design annotation frames — ignore), `999px` (tags, circular tokens).

### Animation
- Not heavily specified. The vibe is **minimal motion**: opacity fades and color swaps, ~120-160ms ease-out. No bouncing, no spring overshoot, no parallax. Think terminal-fast.
- Hover = lighter background (e.g. `rgba(240,240,240,0.1)` → `0.15`) or accent border.
- Press = one-shade-darker fill.

### Transparency & blur
- Alpha-overlaid `white-500/400/300/200/100` (i.e. `rgba(240,240,240,0.1 → 0.5)`) used as low-emphasis surface tints.
- `backdrop-filter: blur(8px)` and `blur(16px)` used on tables and info-boxes when they overlap the hero noise-texture — prevents the texture from bleeding through.
- Alpha-black (`rgba(18,18,18,0.8)`) is used on scrolled sticky headers.

### Layout rules
- Max content width ~ 1200–1280 on the 1440 canvas. Content is center-gutter-aligned.
- Header is fixed / sticky; becomes `rgba(18,18,18,0.8) + backdrop-blur` when scrolled.
- Footer is flat, bottom-pinned, contains logo + nav links.
- Heavy use of **table layouts** with hairline `#282828` dividers — at product scale, Acta is fundamentally a table-and-number app.

### Card treatment
- Flat surface, `#121212` fill or `rgba(18,18,18,0.01)` with backdrop-blur.
- `1px solid #282828` border.
- 0px corner radius.
- No shadow.
- Interior uses tight inner padding + dense typographic hierarchy.

### Imagery vibe
- **One motif:** high-contrast monochrome grainy PNG (`hero-texture.png`) composited with the Acta logomark. Dark, cool, noisy, dithered. Feels like a photocopied archival document.
- No illustrations. No stock photography. No 3D. No iconography beyond utility icons.

---

## Iconography

- **System:** utility-style monochrome line icons at **1.5px stroke**, 24×24 default (also 14/18/20 for table cells). All stroked in `#8A8A8A` (idle) or `#F0F0F0` (active/hover).
- **Source in Figma:** hand-drawn SVG shapes inside `/Design-system/Icons/`. Includes `Trend Down`, `Chevron Right Duo (»)`, `Chevron Down`, `Wallet`, `Menu Close`, `Menu Alt 05` (hamburger), `Exit Outline`, `Sun`.
- **No icon font** in the design. All icons are per-path SVG.
- **Emoji: never.** Unicode arrows `↗ ↘ » ›` are used as typographic ornaments inside labels (e.g. `Calls ↗`, `How it works »`) — these are text, not icons.
- **Token logos** (jitoSOL, JLP, BTC, SOL, USDC) are brand-owned marks, rendered inside a 40×40 white circle. `assets/token-btc.svg` and `assets/sol-mark.png` are copied in; others are placeholder-referenced and should be added if you need them.

Substitutions in this kit:
- Where a specific icon wasn't extractable (chevron, wallet, menu, trend), we re-draw minimal 1.5px stroke SVGs in-place to match. Not from a library. If you want library consistency, **Lucide** is the closest match (same weight/feel).

---

## Files (index)

- `README.md` — this file
- `SKILL.md` — agent skill manifest
- `colors_and_type.css` — CSS variables for all colors + typography tokens + semantic classes
- `fonts/` — webfont references (Google Fonts CDN; no self-hosted files yet — see caveats)
- `assets/` — logomark, wordmark, hero texture, token marks
- `preview/` — design-system cards (one HTML per token group; auto-registered)
- `ui_kits/app/` — high-fidelity React recreation of the Acta web app
  - `index.html` — interactive click-through of the Earn flow
  - `Header.jsx`, `Hero.jsx`, `StrategyTiles.jsx`, `MarketCard.jsx`, `MarketsTable.jsx`, `Footer.jsx`, `Button.jsx`, `Tag.jsx`, `InfoBox.jsx`, `DepositSheet.jsx`, `Tabs.jsx`, `Logo.jsx`, `Icons.jsx`

## Caveats & substitutions

- **Fonts are loaded from Google Fonts CDN.** Acta uses Space Grotesk + JetBrains Mono + Geist — all three are on Google Fonts, so the match is exact. If you have licensed `.woff2` files, drop them in `fonts/` and update `colors_and_type.css`.
- **No codebase attached.** All components are reconstructed from the Figma pseudocode + screenshots, not real production React. Values (px, hex, spacing) are copied verbatim from the Figma.
- **Token logos** — only BTC and SOL marks are copied in. jitoSOL, JLP, USDC are referenced by placeholder circles. Add the real SVGs if you need them.
- **Dashed purple borders** in the Figma are design-time annotation frames, not product chrome. Removed everywhere.
