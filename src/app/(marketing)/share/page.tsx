/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { ActaLogo } from "@/components/acta-logo";
import { IS_MAINNET } from "@/lib/network";
import { DEVNET_TAG, type ShareCard } from "@/lib/share/card";
import { SHARE_CARD_SIZE } from "@/lib/share/card-image";
import { decodeShareCard, shareImagePath } from "@/lib/share/params";

type Props = { searchParams: { c?: string | string[] } };

function readCard(searchParams: Props["searchParams"]): ShareCard | null {
  const c = Array.isArray(searchParams.c) ? searchParams.c[0] : searchParams.c;
  return decodeShareCard(c, { tag: IS_MAINNET ? null : DEVNET_TAG });
}

/** This deployment's own address, as the visitor reached it: a preview image must load from here, not from the production site. */
function requestOrigin(): string {
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * The page a shared link opens, and the page a post's preview is built from: its metadata names
 * the card's image, so X, Telegram and the rest show the picture with the link. One person's
 * card is not a page for a search engine, so it is kept out of the index.
 */
export function generateMetadata({ searchParams }: Props): Metadata {
  const card = readCard(searchParams);
  if (!card) return { title: "Shared from Acta", robots: { index: false } };
  const title = `${card.eyebrow} ${card.title}`;
  const description = [card.caption, ...card.stats.map((s) => `${s.label} ${s.value}`)].filter(Boolean).join(" · ");
  const image = { url: `${requestOrigin()}${shareImagePath(card)}`, width: SHARE_CARD_SIZE.width, height: SHARE_CARD_SIZE.height, alt: card.alt };
  return {
    title,
    description,
    robots: { index: false },
    openGraph: { title, description, type: "website", images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default function SharePage({ searchParams }: Props) {
  const card = readCard(searchParams);
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[850px] flex-col items-start gap-8 px-6 py-16 max-md:px-3 max-md:py-8">
      <Link href="/" aria-label="Acta home">
        <ActaLogo />
      </Link>
      {card ? (
        <img
          src={shareImagePath(card)}
          alt={card.alt}
          width={SHARE_CARD_SIZE.width}
          height={SHARE_CARD_SIZE.height}
          className="block h-auto w-full"
        />
      ) : (
        <p className="font-mono text-base leading-[1.55] tracking-[-0.02em] text-content-secondary">This link does not hold a card.</p>
      )}
      <div className="flex flex-col items-start gap-4">
        <p className="max-w-[540px] font-mono text-base leading-[1.55] tracking-[-0.02em] text-content-secondary">
          {card?.tag ? "Made on devnet with test funds. " : ""}
          Say where a price will be on a date, and get paid or pay a premium for it.
        </p>
        <Link
          href="/"
          className="inline-flex h-10 items-center justify-center bg-accent-primary px-5 font-mono text-base font-medium tracking-[-0.02em] text-bg-primary transition-colors hover:bg-accent-deep"
        >
          Open Acta
        </Link>
      </div>
    </main>
  );
}
