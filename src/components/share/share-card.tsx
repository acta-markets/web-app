"use client";

/* eslint-disable @next/next/no-img-element */
import * as React from "react";
import { Share2 } from "lucide-react";
import { AppButton } from "@/components/app-ui/app-button";
import { AppModal } from "@/components/app-ui/app-modal";
import { AppSegmented } from "@/components/app-ui/app-segmented";
import { TYPE_NOTE } from "@/components/app-ui/type-styles";
import { cn } from "@/lib/cn";
import { canCopyImage, canShareFile, copyImage, downloadImage, shareFile, shareNative, xPostUrl } from "@/lib/share/actions";
import type { ShareCard } from "@/lib/share/card";
import { SHARE_CARD_SIZE, renderShareCard } from "@/lib/share/render";

/** The small button that opens a share card, wherever a result is worth showing. */
export function ShareButton({ onClick, label = "Share", className }: { onClick: () => void; label?: string; className?: string }) {
  return (
    <AppButton variant="secondary" onClick={onClick} className={cn("h-8 shrink-0 gap-1.5 px-3 py-0 text-sm", className)}>
      <Share2 aria-hidden="true" className="h-4 w-4" />
      {label}
    </AppButton>
  );
}

type Drawn = { card: ShareCard; blob: Blob; src: string } | { card: ShareCard; blob: null; src: null };

/** Draws the card whenever it changes; `blob` is null while it is being drawn and when drawing failed. */
function useCardImage(card: ShareCard): { drawn: Drawn | null; failed: boolean } {
  const [drawn, setDrawn] = React.useState<Drawn | null>(null);
  React.useEffect(() => {
    let live = true;
    let src: string | null = null;
    renderShareCard(card, { host: window.location.host })
      .then((blob) => {
        if (!live) return;
        src = URL.createObjectURL(blob);
        setDrawn({ card, blob, src });
      })
      .catch((err) => {
        console.error("[Share] card not drawn", err);
        if (live) setDrawn({ card, blob: null, src: null });
      });
    return () => {
      live = false;
      if (src) URL.revokeObjectURL(src);
    };
  }, [card]);
  const current = drawn?.card === card ? drawn : null;
  return { drawn: current, failed: current != null && current.blob == null };
}

function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = React.useState(false);
  React.useEffect(() => setCoarse(window.matchMedia?.("(pointer: coarse)").matches ?? false), []);
  return coarse;
}

/**
 * A share card and what can be done with it: the image as it will be posted, then the buttons.
 *
 * On a computer the main button opens a new post on X with the words and link filled in. X
 * takes no image that way, so the image is put on the clipboard first and the user pastes it.
 * On a phone the system share sheet attaches the image itself.
 */
export function ShareCardPanel({
  card,
  privateCard,
  url,
}: {
  card: ShareCard;
  /** the same card without the figures that give away size; offering it adds the Amounts switch */
  privateCard?: ShareCard;
  /** the link the post carries; this site when left out */
  url?: string;
}) {
  const [amounts, setAmounts] = React.useState<"show" | "hide">("show");
  const active = privateCard && amounts === "hide" ? privateCard : card;
  const { drawn, failed } = useCardImage(active);
  const [notice, setNotice] = React.useState<string | null>(null);
  React.useEffect(() => setNotice(null), [active]);
  const coarse = useCoarsePointer();

  const blob = drawn?.blob ?? null;
  // read after mount: the server has no address to offer, and the two must render the same
  const [origin, setOrigin] = React.useState("");
  React.useEffect(() => setOrigin(window.location.origin), []);
  const link = url ?? origin;
  const file = React.useMemo(() => (blob ? shareFile(blob, active.filename) : null), [blob, active.filename]);
  const native = coarse && file != null && canShareFile(file);

  const copy = async (done: string, missed: string) => {
    if (!blob || !canCopyImage()) return setNotice(missed);
    try {
      await copyImage(blob);
      setNotice(done);
    } catch {
      setNotice(missed);
    }
  };

  return (
    <div className="space-y-4">
      {privateCard ? (
        <AppSegmented
          ariaLabel="Amounts on the card"
          value={amounts}
          onChange={setAmounts}
          options={[
            { value: "show", label: "With amounts" },
            { value: "hide", label: "Without amounts" },
          ]}
          className="w-full"
        />
      ) : null}

      {/* the image's own shape is held while it is drawn, so nothing under it moves */}
      <div style={{ aspectRatio: `${SHARE_CARD_SIZE.width} / ${SHARE_CARD_SIZE.height}` }} className="w-full">
        {drawn?.src ? (
          <img src={drawn.src} alt={active.alt} width={SHARE_CARD_SIZE.width} height={SHARE_CARD_SIZE.height} className="block h-full w-full" />
        ) : failed ? (
          <div className={cn(TYPE_NOTE, "flex h-full items-center justify-center border border-bg-border p-6 text-center text-content-secondary")}>
            The image could not be made in this browser. You can still post the words.
          </div>
        ) : (
          <div role="status" aria-label="Drawing your card" className="h-full w-full animate-pulse bg-action-primary" />
        )}
      </div>

      {/* one line, always there, so a message never pushes the buttons down */}
      <p role="status" className={cn(TYPE_NOTE, "min-h-[20px] text-content-secondary")}>
        {notice}
      </p>

      <div className="flex gap-2 max-md:flex-col [&>*]:flex-1 [&>*]:whitespace-nowrap [&>*]:px-3">
        <AppButton variant="secondary" disabled={!blob} onClick={() => blob && downloadImage(blob, active.filename)}>
          Download
        </AppButton>
        {native && file ? (
          <AppButton
            onClick={() => {
              shareNative(file, active.text, link).catch(() => setNotice("Sharing did not open. Download the image instead."));
            }}
          >
            Share
          </AppButton>
        ) : (
          <>
            <AppButton
              variant="secondary"
              disabled={!blob}
              onClick={() => void copy("Image copied.", "Copying is not available here. Download the image instead.")}
            >
              Copy image
            </AppButton>
            <a
              href={xPostUrl(active.text, link)}
              target="_blank"
              rel="noopener noreferrer"
              // the copy starts while this page still has focus; the new tab opens right after
              onClick={() => void copy("Image copied. Paste it into your post.", "Download the image and attach it to your post.")}
              className="inline-flex h-10 items-center justify-center bg-accent-primary py-2.5 text-base font-medium tracking-[-0.02em] text-bg-primary transition-colors hover:bg-accent-deep focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/40"
            >
              Share on X
            </a>
          </>
        )}
      </div>
    </div>
  );
}

/** The share card in its own modal. */
export function ShareCardModal({
  open,
  onClose,
  title,
  ...panel
}: { open: boolean; onClose: () => void; title: string } & React.ComponentProps<typeof ShareCardPanel>) {
  return (
    <AppModal open={open} onClose={onClose} title={title} showHowItWorks={false} className="max-w-lg">
      <ShareCardPanel {...panel} />
    </AppModal>
  );
}
