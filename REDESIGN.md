# Acta App Redesign

## Status: Planning complete, ready to implement

## Source Files
- **Figma Design**: `https://www.figma.com/design/Mk8zFHC3T2fUqgCB62WBo4/App--Copy-?node-id=152-20576`
- **Figma Design System**: `https://www.figma.com/design/Mk8zFHC3T2fUqgCB62WBo4/App--Copy-?node-id=152-20328`
- **Figma UI Kit**: `https://www.figma.com/design/Mk8zFHC3T2fUqgCB62WBo4/App--Copy-?node-id=301-12049`
- **Figma File Key**: `Mk8zFHC3T2fUqgCB62WBo4`
- **Semantic JSON**: `Acta semantic.json` (in project root)

## User Decisions
- **Theme**: Dark-only (drop light mode entirely)
- **Font**: Switch body font from Space Grotesk to **Inter**
- **Components**: Remove `src/components/ui/` (neo-brutalist), keep only `src/components/app-ui/`
- **Figma MCP**: Configured in `.mcp.json` — use to extract exact layout/spacing/typography specs before implementing

## New Color Palette (from semantic JSON)

### General
| Token | Hex | Alpha | Use |
|-------|-----|-------|-----|
| bg | #121212 | 1 | Page background |
| box-fill | #121212 | 1 | Card/box backgrounds |
| box-stroke | #282828 | 1 | All borders |
| text-primary | #F0F0F0 | 1 | Main text |
| text-secondary | #8A8A8A | 1 | Muted text, labels |
| text-green | #80C9B6 | 1 | Accent text, ghost buttons |
| icon-primary | #F0F0F0 | 1 | Main icons |
| icon-secondary | #8A8A8A | 1 | Muted icons |
| logo-fill | #F0F0F0 | 1 | Logo color |
| header-scrolled-bg | #121212 | 0.80 | Sticky header when scrolled |

### Brand Green
| Token | Hex | Use |
|-------|-----|-----|
| Primary | #2AA286 | Primary button fill, active state fills/strokes |
| Light | #80C9B6 | Ghost text, chart line, active menu text |
| Hover | #078568 | Primary button hover |

### Button Tokens
**Primary**: fill #2AA286, text #121212 → hover fill #078568 → disabled fill #2AA286/30%, text #F0F0F0/50%
**Secondary**: fill #282828/24%, stroke #282828, text #F0F0F0 → hover fill #282828, stroke #F0F0F0/10%→ disabled fill #121212, stroke #282828, text #F0F0F0/25%
**Ghost**: text #80C9B6 → hover text #2AA286 → disabled text #F0F0F0/25%

### Component Tokens
**Tabs** (Default/Hover/Active):
- Default: fill #121212/1%, stroke #282828, text-primary #F0F0F0, text-secondary #8A8A8A
- Hover: fill #282828/24%, stroke #F0F0F0/15%
- Active: fill #2AA286/20%, stroke #2AA286/30%, text-primary #F0F0F0

**Token Card**: Default fill #121212, stroke #282828; Hover fill #282828/24%, stroke #F0F0F0/15%; Bar line #2AA286, bar fill #2AA286/20%

**Table**: stroke #282828, header fill #121212, row fill #121212, cell text primary #F0F0F0, secondary #8A8A8A

**Tag** (Default/Hover/Active): Default stroke #F0F0F0/10%; Hover stroke #F0F0F0/25%; Active fill #2AA286/20%, stroke #2AA286/30%

**Deposit Tabs**: Default stroke #282828; Hover text #80C9B6; Active text #80C9B6, fill #2AA286/20%, stroke #2AA286

**Deposit Input**: fill #282828, stroke #F0F0F0/10%, text-primary #F0F0F0, value #8A8A8A (default) → #F0F0F0 (active/filled)

**Chart**: fill #121212, stroke #282828, line #80C9B6, divider #282828

**Wallet**: Default fill #121212, stroke #282828; Hover fill #282828, stroke #F0F0F0/10%

**Footer**: stroke #282828, link default #8A8A8A, link hover #F0F0F0

**Modal**: fill #121212, stroke #282828, bg overlay #121212/80%

**Menu**: item text #F0F0F0, icon #8A8A8A, hover fill #282828, active text #80C9B6, popup fill #121212, stroke #282828

**Toaster**: fill #121212, stroke #282828, text-primary #F0F0F0, text-error #FF611B, icon-accent #80C9B6, icon-error #FF611B

---

## Implementation Plan

### Phase 1: Foundation — CSS Variables, Tailwind Config, Fonts
1. Replace CSS variables in `src/app/globals.css` (single `:root`, dark-only)
2. Update `tailwind.config.ts` (remove darkMode, neo shadows, legacy colors; add brand-light, error)
3. Switch font to Inter in `src/app/layout.tsx`
4. Remove theme infrastructure: delete `theme-script.tsx`, `theme-toggle.tsx`, `route-theme.tsx`; remove from layouts

### Phase 2: Component Library
1. Move Container to `app-ui/`, delete `src/components/ui/` entirely
2. Update `app-button.tsx` — 3 variants with proper state tokens
3. Update `app-card.tsx` — replace glassmorphism with solid dark fills
4. Update `app-table.tsx` — solid dark fills, #282828 borders
5. Update `app-modal.tsx` — dark overlay and fill
6. Update `app-segmented.tsx` — tab active states with teal
7. Update `app-pill.tsx` — tag tokens with active variant
8. Create `app-input.tsx` — deposit input tokens

### Phase 3: Page Components
1. `app-nav.tsx` — scrolled bg, active/hover link colors
2. `sections/footer.tsx` — border and link colors
3. `earn-client.tsx` — replace white/10, white/5, lime → teal throughout
4. `market-client.tsx` — deposit input, tags, chart container
5. `market-chart.tsx` — chart line #80C9B6, dividers #282828
6. `rfq-flow-modal.tsx` — accent colors → teal
7. `portfolio-client.tsx` — metric cards, chart colors, table tokens
8. `wallet-sidebar.tsx` — wallet tokens
9. `solana-connect-button.tsx` — button colors

### Phase 4: Cleanup
- Remove `class="dark"` from `<html>` if no longer needed
- Remove remaining `.dark` CSS selectors
- Final `npm run build` + `npm run lint`

## Next Step
**Use Figma MCP** to fetch exact layout specs (spacing, typography, border radii, component dimensions) from the 3 Figma pages before starting Phase 1. The semantic JSON only has colors — Figma MCP will give us the rest.

## Critical Files to Modify
1. `src/app/globals.css`
2. `tailwind.config.ts`
3. `src/app/layout.tsx`
4. `src/app/(app)/layout.tsx`
5. `src/app/(marketing)/layout.tsx`
6. `src/components/app-ui/app-button.tsx`
7. `src/components/app-ui/app-card.tsx`
8. `src/components/app-ui/app-table.tsx`
9. `src/components/app-ui/app-modal.tsx`
10. `src/components/app-ui/app-segmented.tsx`
11. `src/components/app-ui/app-pill.tsx`
12. `src/components/app-nav.tsx`
13. `src/components/sections/footer.tsx`
14. `src/components/earn/earn-client.tsx`
15. `src/components/market/market-client.tsx`
16. `src/components/market/market-chart.tsx`
17. `src/components/market/rfq-flow-modal.tsx`
18. `src/components/portfolio/portfolio-client.tsx`
19. `src/components/wallet/wallet-sidebar.tsx`
