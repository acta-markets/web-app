# Design system, in the repo

This is the Figma handoff for Acta's design system, committed so the source of truth
travels with the code instead of living only in a Figma file and a chat.

- `handoff/colors_and_type.css` — every colour, spacing, radius and type class as CSS
  custom properties. This is the file the brand checker parses.
- `handoff/preview/` — one HTML page per token group, the same cards the designer used.
- `handoff/ui_kits/` — the reconstructed app and landing components from the handoff.
- `handoff/assets/` — logomark, wordmark, texture and the token marks that were shipped.
- `handoff/README.md`, `handoff/SKILL.md` — the designer's own rules, verbatim.

Not committed: the handoff's landing prototypes and uploads (about sixteen megabytes of
screenshots and ASCII art), which belong to a design archive rather than to the app repo.

## Checking a change against it

    BRAND_REPO=$PWD node ~/projects/brand-agent/bin/brand-review.js \
      --handoff "$PWD/design/handoff" --base origin/devnet

That prints a hardcode scan of the diff and a verdict. Exit 0 means on brand, 1 means
values outside the system, 2 means the checker could not read the handoff (not a pass).
