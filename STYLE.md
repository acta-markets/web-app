# STYLE.md

House rules for Acta's visual system and landing-page copy. Applies to any agent or
person editing `src/app/(marketing)/*` or `src/components/landing/*`. The app routes
(`(app)`, `src/components/app-ui/*`) share the design tokens but not the copy rules.

Read this before writing copy or a new section. Most of it exists because something
went wrong once.

---

## 1. Copy rules

### Banned words

These do not appear in landing-page copy. They describe the mechanism; the page sells
the outcome.

`strike` · `call` · `put` · `RFQ` · `European` · `expiry` · `premium range` · `APY` ·
`Phantom` · `without touching`

**Standing exceptions**, and the only ones:

| word | where it is allowed |
|---|---|
| `options` | naming the venue, e.g. "on its own options venue". Acta is a yield-vault product **on top of** an options venue, never the reverse. |
| `leverage` | only in the exact phrase `No leverage, no liquidations` |
| `put` | only in the CTA headline `Put your assets to work.` |
| `target` | four places only: the How-it-works Pro line, the yield-source paragraph, and FAQ items 2 and 3 |

Anything not on the exception list is a deliberate decision, not a drive-by edit.
Adding one means updating this table.

### No dashes

No em dashes (`—`) and no en dashes (`–`) anywhere in copy. Use a comma, a period, or
"and". This includes copy inside JSX and inside `*.ts` config files.

### Numbers

- **Never invent a figure.** No TVL, volume, premium paid, or yield that did not come
  from the desk. If you need one and do not have it, leave a `TODO(tim):` and ship
  without it.
- **Never hardcode a total.** A headline rate is computed from its parts. See
  `totalApr()` in `src/lib/landing-vaults.ts`. The `~18%` on the SOL card is
  `staking + premium`, never the literal `18`.
- **A rate never appears without its caveat in the same component.** Wherever the SOL
  headline rate renders, `CAP_NOTE` renders with it.
- A vault carries its own `riskNote`. Do not reuse one vault's caveat on another: the
  "one week in twelve" cadence is measured on SOL and is false for USDC and xTSLA. No
  note is better than a wrong note.

### Names render verbatim

Asset names and tickers are names, not labels. Never apply `uppercase` to them:
`xTSLA` must not render as `XTSLA`. Uppercase styling is for labels only: status
badges, section markers, eyebrow text.

### Voice

Sentence case. No marketing filler. Say the thing and stop. If a sentence restates
what the headline directly above it already said, cut it.

---

## 2. Visual system

Do not introduce new fonts, colours, dependencies, images, or analytics. Everything
below already exists.

### Type

| | |
|---|---|
| Headings | `font-space` (Space Grotesk) |
| Body, labels, buttons, all UI text | `font-mono` (JetBrains Mono) |

The body default is **mono**, not sans. That is intentional.

Standard scales:

```
section h2      clamp(44px, 7vw, 80px)   lineHeight 0.95   tracking -0.03em
big stat/rate   clamp(40px, 6vw, 54px)   lineHeight 0.95   tracking -0.03em
card title      clamp(32px, 3.4vw, 40px) lineHeight 1      tracking -0.03em
body copy       16px  lineHeight 1.55  tracking -0.02em
micro/caption   12px  tracking -0.02em
eyebrow/label   11px  uppercase  tracking 0.12em
```

### Colour

Use the CSS variables in `globals.css` through Tailwind utilities: `bg-bg-primary`,
`text-content-secondary`, `border-bg-border`, `text-accent-secondary`. Never hardcode a
theme colour.

The literal hexes below are the exception, because they are chart and accent values
with no token:

```
#2AA286  green   live dot, staking bar
#80C9B6  mint    accent, premium bar, section markers
#FF60BD  pink    curators marker, step 02
#FF8A3C  orange  step 03
```

### Shape

- `borderRadius: 0` everywhere. No rounded corners.
- No drop shadows on landing components.
- Structure is drawn with 1px `border-bg-border` lines, never with gaps or cards that
  float.

### Layout

```
standard container   mx-auto w-full max-w-[850px] max-xl:px-[71px] max-lg:px-6 max-md:px-3
section spacing      py-[120px] max-md:py-20
anchored section     scroll-mt-[88px] max-md:scroll-mt-[76px]
```

The `850px` container is the page's spine. Every section heading lines up on it. A
wider container makes that section's h2 visibly break the alignment, so do not widen
one without a reason.

`scroll-mt` exists because the header is sticky (68px desktop, 60px mobile). Any
section with an `id` needs it or its heading lands under the header.

### Grids

Divider lines with no gaps, sized per breakpoint by index. Do **not** use
`gap-px` with a coloured parent background: a grid whose last row is short renders the
empty cell as a solid block.

```tsx
// wrapper
<div className="grid auto-rows-fr grid-cols-1 border-t border-bg-border md:grid-cols-2">
  {items.map((item, i) => (
    <div className={`border-b border-bg-border ${i % 2 !== 0 ? "md:border-l" : ""}`}>
```

`auto-rows-fr` is what makes every card the same height across rows.

For a 3-column layout the index maths needs both breakpoints:

```tsx
const mdLeft = i % 2 !== 0;   // 2 columns at md
const lgLeft = i % 3 !== 0;   // 3 columns at lg
// md:border-l when mdLeft, lg:border-l when lgLeft && !mdLeft, lg:border-l-0 when mdLeft && !lgLeft
```

### Components

Server components by default. `landing-faq.tsx` is the only `"use client"` file on the
landing page; keep it that way. Reuse `SectionMarker`, `LandingButton` and `LandingBar`
from `landing-primitives.tsx` rather than restyling inline.

Smooth anchor scrolling comes from `html { scroll-behavior: smooth }` in `globals.css`,
guarded by `prefers-reduced-motion`. It is there so anchor buttons can stay plain `<a>`
tags and the page can stay server-rendered.

---

## 3. Before you commit

### Measure headline text, do not eyeball it

The hero column is **720px**. A headline that overflows it wraps to an extra line and
the hero silently breaks. Measure in the browser at the real font before choosing a
size:

```js
const h1 = document.querySelector('h1');
const probe = document.createElement('span');
probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font-weight:600;letter-spacing:-0.04em;';
probe.style.fontFamily = getComputedStyle(h1).fontFamily;
document.body.appendChild(probe);
probe.style.fontSize = '96px';
probe.textContent = 'Your headline';
probe.getBoundingClientRect().width;   // must be <= 720
```

Rough envelope: at 140px a line holds about 11 characters; at 96px, about 16.

### Check the copy that actually ships

Grep the served HTML, not the diff. Banned words hide in metadata, in collapsed FAQ
answers and in strings assembled at runtime.

```bash
curl -s localhost:3000/ \
  | grep -oiE '\b(options?|strikes?|calls?|puts?|RFQ|European|expiry|APY|leverage|Phantom)\b' \
  | sort | uniq -c
```

Every hit must be on the exceptions table above. Check for `—` and `–` in the same pass.

### Check three widths

375, 768 and 1440. `document.documentElement.scrollWidth === clientWidth` at each, the
h1 within two lines at 1440, and grid dividers closing correctly on a short last row.

### Do not run `next build` against a live dev server

`next build` overwrites `.next/`, and the running dev server then 404s every
`/_next/static/*` asset. The page loads with no CSS and looks catastrophically broken
for reasons that have nothing to do with your change. Stop dev first, or let CI build.

### Housekeeping

`tsconfig.tsbuildinfo` is tracked and churns on every build. Stage explicit paths;
never `git add -A`.
