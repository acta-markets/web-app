# Acta Design System — skill

When the user wants to design inside the Acta product surface (Earn, Earn-Market, Portfolio, landing, emails):

## Start here
- Read `README.md` for content fundamentals, visual foundations, iconography.
- Link `colors_and_type.css` as the source of truth for color + type tokens.
- Mount `ui_kits/app/Primitives.jsx`, `Layout.jsx`, `Markets.jsx` in your demo HTML to get `Header`, `Hero`, `StrategyTiles`, `MarketCard`, `MarketsTable`, `Button`, `Tag`, `InfoBox`, `Tabs`, `TokenAvatar`, `DepositSheet`, `Toast`, and the icon set.
- Use `preview/*.html` as reference cards when choosing tokens or components.

## Non-negotiables
- Flat `#121212` canvas, `#282828` hairline borders, **0 radius** on every surface except pill tags and token circles.
- Type: Space Grotesk SemiBold for headlines, JetBrains Mono for everything else, Geist Medium as a neutral UI fallback. `-0.02em` tracking.
- Accent: single desaturated forest-green `#2AA286` / `#078568` / `#80C9B6`. Orange `#FF611B` is **reserved for BTC**.
- Copy: sentence case, terse, finance-literate. No emoji. Typographic arrows `↗ ↘ »` as label ornaments only.
- No gradients, no drop shadows, no rounded cards. `backdrop-filter: blur(8–16)` allowed only over the hero texture.
- Icons: 1.5px stroke monochrome line icons, 24px default.

## Patterns
- **Card = border + flat fill.** Tight inner padding, dense typographic hierarchy.
- **Tables are first-class.** Acta is fundamentally a table-and-number app — reach for `MarketsTable` before reinventing.
- **Numbers are monospace**, always. Ranges use en-dash (`12%–34%`).
- **Primary CTA** = solid `#2AA286`, white foreground. Hover darkens to `#078568`.
- **Selected tile** = `rgba(42,162,134,0.2)` fill + `#2AA286` border + `#80C9B6` foreground.

## Don't
- Don't round cards. Don't add emoji. Don't introduce a second accent color. Don't add drop shadows. Don't use serif or sans-serif besides the three families above. Don't ship the dashed purple annotation borders from the Figma.
