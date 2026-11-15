import { BRAND_BG, BRAND_FG, LOGOMARK_PATH } from "@/lib/brand";
import { getTokenLogo } from "@/lib/tokens";
import type { ShareCard, ShareTone } from "./card";

/** 16:9, the shape a post's image is shown at without cropping. */
export const SHARE_CARD_SIZE = { width: 1200, height: 675 } as const;
/** Drawn at twice the size so text stays sharp on a dense screen. */
const SCALE = 2;

const W = SHARE_CARD_SIZE.width;
const H = SHARE_CARD_SIZE.height;
const PAD = 64;
const INNER = W - PAD * 2;

const TITLE_TOP = 222;
const STATS_LINE = 462;
const FOOTER_LINE = 596;

/** Sentence sizes, largest first, each with the most lines it may take in the space above the figures. */
const SENTENCE_SIZES: ReadonlyArray<readonly [size: number, maxLines: number]> = [[76, 2], [64, 3], [54, 3], [46, 4]];
const SENTENCE_LEADING = 1.1;

type Measure = (text: string) => number;

/** Breaks a sentence into lines no wider than `maxWidth`. A single word wider than that keeps its own line. */
export function wrapLines(measure: Measure, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.trim().split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && measure(next) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** The largest size from `sizes` at which the text fits its line budget; the smallest when none does. */
export function fitSentence(
  measureAt: (size: number) => Measure,
  text: string,
  maxWidth: number,
  sizes: ReadonlyArray<readonly [number, number]> = SENTENCE_SIZES,
): { size: number; lines: string[] } {
  let last = { size: sizes[sizes.length - 1][0], lines: [text] };
  for (const [size, maxLines] of sizes) {
    const lines = wrapLines(measureAt(size), text, maxWidth);
    last = { size, lines: lines.slice(0, maxLines) };
    if (lines.length <= maxLines) return { size, lines };
  }
  return last;
}

/** The largest size, from `from` down to `min`, at which one line fits `maxWidth`. */
export function fitLine(measureAt: (size: number) => Measure, text: string, maxWidth: number, from: number, min: number): number {
  for (let size = from; size > min; size -= 2) {
    if (measureAt(size)(text) <= maxWidth) return size;
  }
  return min;
}

type Palette = {
  bg: string;
  fg: string;
  quiet: string;
  line: string;
  block: string;
  up: string;
  down: string;
  warn: string;
  display: string;
  mono: string;
};

/** The page's own tokens and fonts, read where they are defined, so the card follows the theme. */
function readPalette(): Palette {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  const family = (name: string, fallback: string) => {
    const value = style.getPropertyValue(name).trim();
    return value ? `${value}, ${fallback}` : fallback;
  };
  return {
    bg: token("--bg-primary", BRAND_BG),
    fg: token("--content-primary", BRAND_FG),
    quiet: token("--content-secondary", "#8A8A8A"),
    line: token("--bg-border", "#282828"),
    block: token("--action-primary", "#282828"),
    up: token("--additional-green-primary", "#49AA19"),
    down: token("--additional-red-primary", "#FF3347"),
    warn: token("--additional-orange-primary-deep", "#E89A3C"),
    display: family("--font-space-grotesk", "system-ui, sans-serif"),
    mono: family("--font-jetbrains-mono", "ui-monospace, monospace"),
  };
}

function toneColour(palette: Palette, tone: ShareTone | undefined): string {
  return tone === "up" ? palette.up : tone === "down" ? palette.down : palette.fg;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth > 0 ? img : null);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Waits for the faces the card is set in. A face that never arrives is drawn in its fallback rather than holding the card up. */
async function loadFonts(fonts: readonly string[]): Promise<void> {
  if (!document.fonts?.load) return;
  const all = Promise.all(fonts.map((font) => document.fonts.load(font).catch(() => [])));
  await Promise.race([all, new Promise((resolve) => setTimeout(resolve, 3000))]);
}

type Ctx = CanvasRenderingContext2D;

function setFont(ctx: Ctx, weight: number, size: number, family: string, tracking: number) {
  ctx.font = `${weight} ${size}px ${family}`;
  // not every browser spaces canvas text; where it cannot, the text is drawn a touch wider
  if ("letterSpacing" in ctx) (ctx as Ctx & { letterSpacing: string }).letterSpacing = `${(size * tracking).toFixed(2)}px`;
}

function drawTokenLogo(ctx: Ctx, palette: Palette, logo: HTMLImageElement | null, symbol: string, x: number, y: number, size: number) {
  const r = size / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + r, y + r, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = logo ? palette.fg : palette.block;
  ctx.fillRect(x, y, size, size);
  if (logo) {
    try {
      ctx.drawImage(logo, x, y, size, size);
    } catch {
      // an image the browser cannot rasterise leaves the plain disc
    }
  } else {
    setFont(ctx, 500, size * 0.4, palette.mono, -0.02);
    ctx.fillStyle = palette.fg;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(symbol.slice(0, 2), x + r, y + r + 1);
  }
  ctx.restore();
}

function hLine(ctx: Ctx, palette: Palette, y: number) {
  ctx.fillStyle = palette.line;
  ctx.fillRect(PAD, y, INNER, 1);
}

/**
 * Draws a share card and returns it as a PNG. Browser only: it reads the page's tokens and
 * fonts and draws on a canvas. `host` is the site name printed in the corner.
 */
export async function renderShareCard(card: ShareCard, { host }: { host: string }): Promise<Blob> {
  const palette = readPalette();
  const logoSrc = card.asset ? getTokenLogo(card.asset) : "";
  const [mark, wordmark, tokenLogo] = await Promise.all([
    loadImage("/acta-logomark.svg"),
    loadImage("/acta-wordmark.svg"),
    logoSrc ? loadImage(logoSrc) : Promise.resolve(null),
    loadFonts([`600 64px ${palette.display}`, `600 36px ${palette.mono}`, `500 24px ${palette.mono}`, `400 22px ${palette.mono}`]),
  ]);

  const canvas = document.createElement("canvas");
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot draw the image");
  ctx.scale(SCALE, SCALE);

  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, W, H);

  // the logomark, large and faint, running off the bottom right corner
  ctx.save();
  ctx.translate(W - 400, H - 330);
  ctx.scale(520 / 32.0478, 520 / 32);
  ctx.globalAlpha = 0.035;
  ctx.fillStyle = palette.fg;
  ctx.fill(new Path2D(LOGOMARK_PATH));
  ctx.restore();

  // an edge, so the card does not melt into a dark feed
  ctx.strokeStyle = palette.line;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W - 2, H - 2);

  // header: the logo, and the tag that qualifies the whole card
  const logoH = 40;
  if (mark) ctx.drawImage(mark, PAD, 56, logoH * (mark.naturalWidth / mark.naturalHeight), logoH);
  if (wordmark) {
    const h = logoH * 0.6875;
    ctx.drawImage(wordmark, PAD + logoH + 10, 56 + (logoH - h) / 2, h * (wordmark.naturalWidth / wordmark.naturalHeight), h);
  }
  if (card.tag) {
    setFont(ctx, 500, 22, palette.mono, -0.02);
    const tagW = ctx.measureText(card.tag).width + 28;
    ctx.strokeStyle = palette.warn;
    ctx.lineWidth = 1;
    ctx.strokeRect(W - PAD - tagW + 0.5, 58.5, tagW - 1, 35);
    ctx.fillStyle = palette.warn;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(card.tag, W - PAD - tagW + 14, 77);
  }

  // eyebrow, with the asset's mark when the card is about one
  let eyebrowX = PAD;
  if (card.asset) {
    drawTokenLogo(ctx, palette, tokenLogo, card.asset, PAD, 158, 36);
    eyebrowX += 36 + 14;
  }
  setFont(ctx, 500, 26, palette.mono, -0.02);
  ctx.fillStyle = palette.quiet;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(card.eyebrow, eyebrowX, 177);

  // the one big line
  ctx.textBaseline = "top";
  ctx.fillStyle = toneColour(palette, card.titleTone);
  if (card.titleKind === "figure") {
    const measureAt = (size: number) => {
      setFont(ctx, 600, size, palette.mono, -0.03);
      return (text: string) => ctx.measureText(text).width;
    };
    const size = fitLine(measureAt, card.title, INNER, 132, 56);
    setFont(ctx, 600, size, palette.mono, -0.03);
    ctx.fillText(card.title, PAD - size * 0.03, TITLE_TOP + (132 - size) / 2);
  } else {
    const measureAt = (size: number) => {
      setFont(ctx, 600, size, palette.display, -0.03);
      return (text: string) => ctx.measureText(text).width;
    };
    const { size, lines } = fitSentence(measureAt, card.title, INNER);
    setFont(ctx, 600, size, palette.display, -0.03);
    lines.forEach((line, i) => ctx.fillText(line, PAD, TITLE_TOP + i * size * SENTENCE_LEADING));
  }

  // the figures, in equal columns
  if (card.stats.length > 0) {
    hLine(ctx, palette, STATS_LINE);
    const columns = Math.max(3, card.stats.length);
    const cellW = INNER / columns;
    card.stats.forEach((stat, i) => {
      const x = PAD + i * cellW;
      setFont(ctx, 500, 22, palette.mono, -0.02);
      ctx.fillStyle = palette.quiet;
      ctx.textBaseline = "top";
      ctx.fillText(stat.label, x, STATS_LINE + 28);
      const measureAt = (size: number) => {
        setFont(ctx, 600, size, palette.mono, -0.02);
        return (text: string) => ctx.measureText(text).width;
      };
      const size = fitLine(measureAt, stat.value, cellW - 24, 36, 20);
      setFont(ctx, 600, size, palette.mono, -0.02);
      ctx.fillStyle = toneColour(palette, stat.tone);
      ctx.textBaseline = "alphabetic";
      ctx.fillText(stat.value, x, STATS_LINE + 100);
    });
  }

  // footer: where this came from, and when
  hLine(ctx, palette, FOOTER_LINE);
  setFont(ctx, 400, 22, palette.mono, -0.02);
  ctx.fillStyle = palette.quiet;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(host, PAD, FOOTER_LINE + 40);
  ctx.textAlign = "right";
  ctx.fillText(card.date, W - PAD, FOOTER_LINE + 40);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The image could not be made"))), "image/png");
  });
}
