/* eslint-disable @next/next/no-img-element */
import type { ReactElement, ReactNode } from "react";
import { BRAND_BG, BRAND_FG, logomarkDataUri, wordmarkDataUri } from "@/lib/brand";
import { SHARE_CARD_SIZE, type ShareCard, type ShareTone } from "./card";

export { SHARE_CARD_SIZE };

// The page's tokens (globals.css). An image drawn on the server cannot read CSS variables.
export const QUIET = "#8A8A8A";
export const LINE = "#282828";
const BLOCK = "#282828";
const UP = "#49AA19";
const DOWN = "#FF3347";
const WARN = "#E89A3C";

export const SHARE_FONT_DISPLAY = "Space Grotesk";
export const SHARE_FONT_MONO = "JetBrains Mono";

export const PAD = 64;
const INNER = SHARE_CARD_SIZE.width - PAD * 2;
const TITLE_TOP = 222;
const FIGURE_SIZE = 132;
const STATS_LINE = 462;
const FOOTER_LINE = 596;
/** The bottom line's height: where the picture came from, and when. */
export const FOOTER_HEIGHT = SHARE_CARD_SIZE.height - FOOTER_LINE;

/** JetBrains Mono sets every character 0.6em wide; the tracking takes a little of that back. */
const monoWidth = (text: string, size: number, tracking: number) => text.length * size * (0.6 + tracking);

/** The largest size, from `from` down to `min`, at which a mono line fits `maxWidth`. */
export function fitMono(text: string, maxWidth: number, from: number, min: number, tracking: number): number {
  for (let size = from; size > min; size -= 2) {
    if (monoWidth(text, size, tracking) <= maxWidth) return size;
  }
  return min;
}

/** A mono line cut short with an ellipsis when even its smallest size is too wide. */
export function clipMono(text: string, maxWidth: number, size: number, tracking: number): string {
  if (monoWidth(text, size, tracking) <= maxWidth) return text;
  const room = Math.max(1, Math.floor(maxWidth / (size * (0.6 + tracking))) - 1);
  return `${text.slice(0, room).trimEnd()}…`;
}

/**
 * A sentence's size by its length. The display face is not measured here, so the steps are
 * set from how many of its characters fill the card's width: about 28 a line at 76px.
 */
export function sentenceSize(text: string): number {
  if (text.length <= 46) return 76;
  if (text.length <= 84) return 64;
  if (text.length <= 100) return 54;
  return 46;
}

const toneColour = (tone: ShareTone | undefined) => (tone === "up" ? UP : tone === "down" ? DOWN : BRAND_FG);

/** Mono text at a size, in the picture's own units: the one way small text is set on it. */
export function monoStyle(scale: number, size: number, weight: number, tracking = -0.02) {
  return {
    fontFamily: SHARE_FONT_MONO,
    fontSize: size * scale,
    fontWeight: weight,
    letterSpacing: size * tracking * scale,
    lineHeight: 1,
  };
}

export type CardFrame = {
  width: number;
  height: number;
  scale: 1 | 2;
  /** the word in the top right corner that qualifies the whole picture ("Devnet"), or null */
  tag: string | null;
  /** the bottom line, left and right */
  footer: { left: string; right: string };
  /** what the picture says: elements placed absolutely between the header and the bottom line */
  children: ReactNode[];
};

/**
 * What every picture the site draws of itself shares: the dark ground with its edge, the faint
 * logomark in the corner, the logo, the tag and the bottom line. A share card and a page's
 * link preview are both drawn inside it, so they read as one family. Every length is
 * multiplied by `scale`.
 */
export function cardFrame({ width, height, scale, tag, footer, children }: CardFrame): ReactElement {
  const u = (n: number) => n * scale;
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        width: u(width),
        height: u(height),
        background: BRAND_BG,
        color: BRAND_FG,
        fontFamily: SHARE_FONT_MONO,
      }}
    >
      {/* the logomark, large and faint, running off the bottom right corner */}
      <img
        alt=""
        src={logomarkDataUri(520)}
        width={u(520)}
        height={u(520)}
        style={{ position: "absolute", left: u(width - 400), top: u(height - 330), opacity: 0.035 }}
      />
      {/* an edge, so the picture does not melt into a dark feed */}
      <div style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", border: `${u(2)}px solid ${LINE}`, display: "flex" }} />

      {/* header: the logo, and the tag that qualifies the whole picture */}
      <div style={{ position: "absolute", left: u(PAD), top: u(56), height: u(40), display: "flex", alignItems: "center" }}>
        <img alt="" src={logomarkDataUri(80)} width={u(40)} height={u(40)} />
        <img alt="" src={wordmarkDataUri(160)} width={u(80)} height={u(27.5)} style={{ marginLeft: u(10) }} />
      </div>
      {tag ? (
        <div
          style={{
            position: "absolute",
            right: u(PAD),
            top: u(58),
            height: u(36),
            padding: `0 ${u(14)}px`,
            display: "flex",
            alignItems: "center",
            border: `${u(1)}px solid ${WARN}`,
            color: WARN,
            ...monoStyle(scale, 22, 500),
          }}
        >
          {tag}
        </div>
      ) : null}

      {children}

      {/* footer: where this came from, and when */}
      <div
        style={{
          position: "absolute",
          left: u(PAD),
          top: u(height - FOOTER_HEIGHT),
          width: u(width - PAD * 2),
          height: u(FOOTER_HEIGHT),
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderTop: `${u(1)}px solid ${LINE}`,
          color: QUIET,
          ...monoStyle(scale, 22, 400),
        }}
      >
        <div style={{ display: "flex" }}>{footer.left}</div>
        <div style={{ display: "flex" }}>{footer.right}</div>
      </div>
    </div>
  );
}

export type ShareCardAssets = {
  /** site name printed in the corner */
  host: string;
  /** the asset's logo as a data URI; null draws a plain disc with its letters */
  tokenLogo: string | null;
  scale: 1 | 2;
};

/**
 * The share card as an element for `next/og`. Every length is multiplied by `scale`, so the
 * same layout serves a link preview (1) and a sharp file to save (2).
 */
export function shareCardElement(card: ShareCard, { host, tokenLogo, scale }: ShareCardAssets): ReactElement {
  const u = (n: number) => n * scale;
  const mono = (size: number, weight: number, tracking?: number) => monoStyle(scale, size, weight, tracking);
  const columns = Math.max(3, card.stats.length);
  const cellW = INNER / columns;
  const figureSize = card.titleKind === "figure" ? fitMono(card.title, INNER, FIGURE_SIZE, 56, -0.03) : 0;
  const titleSize = card.titleKind === "sentence" ? sentenceSize(card.title) : 0;
  const captionSize = card.caption ? (card.caption.length <= 46 ? 40 : card.caption.length <= 60 ? 32 : 24) : 0;

  // eyebrow, with the asset's mark when the card is about one
  const eyebrow = (
    <div key="eyebrow" style={{ position: "absolute", left: u(PAD), top: u(158), height: u(36), display: "flex", alignItems: "center", color: QUIET, ...mono(26, 500) }}>
      {card.asset ? (
        tokenLogo ? (
          <img alt="" src={tokenLogo} width={u(36)} height={u(36)} style={{ marginRight: u(14), borderRadius: u(18), background: BRAND_FG }} />
        ) : (
          <div
            style={{
              width: u(36),
              height: u(36),
              marginRight: u(14),
              borderRadius: u(18),
              background: BLOCK,
              color: BRAND_FG,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              ...mono(14, 500),
            }}
          >
            {card.asset.slice(0, 2)}
          </div>
        )
      ) : null}
      {card.eyebrow}
    </div>
  );

  // the one big line
  const title =
    card.titleKind === "figure" ? (
      <div
        key="title"
        style={{
          position: "absolute",
          left: u(PAD),
          top: u(TITLE_TOP),
          height: u(FIGURE_SIZE),
          display: "flex",
          alignItems: "center",
          color: toneColour(card.titleTone),
          ...mono(figureSize, 600, -0.03),
        }}
      >
        {card.title}
      </div>
    ) : (
      <div
        key="title"
        style={{
          position: "absolute",
          left: u(PAD),
          top: u(TITLE_TOP - 8),
          width: u(INNER),
          maxHeight: u(STATS_LINE - TITLE_TOP - 8),
          overflow: "hidden",
          display: "flex",
          fontFamily: SHARE_FONT_DISPLAY,
          fontWeight: 600,
          fontSize: u(titleSize),
          letterSpacing: u(titleSize * -0.03),
          lineHeight: 1.1,
        }}
      >
        {card.title}
      </div>
    );

  // what a headline figure is about, on the one line left above the figures row
  const caption =
    card.titleKind === "figure" && card.caption ? (
      <div
        key="caption"
        style={{
          position: "absolute",
          left: u(PAD),
          top: u(TITLE_TOP + FIGURE_SIZE + 12),
          width: u(INNER),
          height: u(52),
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          fontFamily: SHARE_FONT_DISPLAY,
          fontWeight: 600,
          fontSize: u(captionSize),
          letterSpacing: u(captionSize * -0.03),
          lineHeight: 1.2,
        }}
      >
        {card.caption}
      </div>
    ) : null;

  // the figures, in equal columns
  const stats =
    card.stats.length > 0 ? (
      <div key="stats" style={{ position: "absolute", left: u(PAD), top: u(STATS_LINE), width: u(INNER), height: u(FOOTER_LINE - STATS_LINE), display: "flex", borderTop: `${u(1)}px solid ${LINE}` }}>
        {card.stats.map((stat) => {
          const size = fitMono(stat.value, cellW - 24, 36, 20, -0.02);
          return (
            <div key={stat.label} style={{ width: u(cellW), display: "flex", flexDirection: "column" }}>
              <div style={{ marginTop: u(28), height: u(24), display: "flex", alignItems: "center", color: QUIET, ...mono(22, 500) }}>{stat.label}</div>
              <div style={{ marginTop: u(18), height: u(40), display: "flex", alignItems: "center", color: toneColour(stat.tone), ...mono(size, 600) }}>
                {clipMono(stat.value, cellW - 24, size, -0.02)}
              </div>
            </div>
          );
        })}
      </div>
    ) : null;

  return cardFrame({
    ...SHARE_CARD_SIZE,
    scale,
    tag: card.tag,
    footer: { left: host, right: card.date },
    children: [eyebrow, title, caption, stats],
  });
}
