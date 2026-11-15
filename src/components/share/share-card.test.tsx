import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tradeShareCard, type TradeShareInput } from "@/lib/share/card";
import { ShareCardModal, ShareCardPanel } from "./share-card";

const draw = vi.hoisted(() => ({ render: vi.fn() }));
vi.mock("@/lib/share/render", () => ({ SHARE_CARD_SIZE: { width: 1200, height: 675 }, renderShareCard: draw.render }));

const input: TradeShareInput = {
  asset: "BTC", thesis: "BTC will be above $64,500 on Nov 20", side: "sell", typeLabel: "Cash-secured put", aprPct: 36.52,
  premium: "38.72 USDC", deposit: "6,450.00 USDC", breakEven: null, maxGain: null, expires: "Nov 20", devnet: false, nowMs: Date.UTC(2026, 10, 16),
};
const card = tradeShareCard(input, { amounts: true });
const privateCard = tradeShareCard(input, { amounts: false });

const write = vi.fn();

beforeEach(() => {
  draw.render.mockReset().mockImplementation(async () => new Blob(["png"], { type: "image/png" }));
  URL.createObjectURL = vi.fn(() => "blob:card");
  URL.revokeObjectURL = vi.fn();
  write.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal("ClipboardItem", class { constructor(public items: Record<string, Blob>) {} });
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { write } });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("ShareCardPanel", () => {
  it("shows the drawn card with its words as alt text, and holds the buttons until it is drawn", async () => {
    render(<ShareCardPanel card={card} url="https://acta.test/?ref=TIM" />);
    expect(screen.getByRole("status", { name: "Drawing your card" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Download" }) as HTMLButtonElement).disabled).toBe(true);
    const img = await screen.findByRole("img");
    expect(img.getAttribute("alt")).toBe(card.alt);
    expect((screen.getByRole("button", { name: "Copy image" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("posts the card's words and the link to X, and copies the image to paste there", async () => {
    render(<ShareCardPanel card={card} url="https://acta.test/?ref=TIM" />);
    await screen.findByRole("img");
    const link = screen.getByRole("link", { name: "Share on X" });
    const href = new URL(link.getAttribute("href")!);
    expect(href.searchParams.get("text")).toBe(card.text);
    expect(href.searchParams.get("url")).toBe("https://acta.test/?ref=TIM");
    expect(link.getAttribute("target")).toBe("_blank");
    fireEvent.click(link);
    await screen.findByText("Image copied. Paste it into your post.");
    expect(write).toHaveBeenCalledOnce();
  });

  it("says to download when the image cannot be copied", async () => {
    write.mockRejectedValue(new Error("denied"));
    render(<ShareCardPanel card={card} />);
    await screen.findByRole("img");
    fireEvent.click(screen.getByRole("button", { name: "Copy image" }));
    await screen.findByText("Copying is not available here. Download the image instead.");
  });

  it("redraws without amounts when asked, and only offers that when there is such a card", async () => {
    const { unmount } = render(<ShareCardPanel card={card} />);
    expect(screen.queryByRole("tab", { name: "Without amounts" })).toBeNull();
    unmount();

    render(<ShareCardPanel card={card} privateCard={privateCard} />);
    await screen.findByRole("img");
    fireEvent.click(screen.getByRole("tab", { name: "Without amounts" }));
    await waitFor(() => expect(screen.getByRole("img").getAttribute("alt")).toBe(privateCard.alt));
    expect(draw.render).toHaveBeenLastCalledWith(privateCard, expect.anything());
    expect(new URL(screen.getByRole("link", { name: "Share on X" }).getAttribute("href")!).searchParams.get("text")).toBe(privateCard.text);
  });

  it("still lets the words be posted when the image cannot be drawn", async () => {
    draw.render.mockRejectedValue(new Error("no canvas"));
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ShareCardPanel card={card} />);
    await screen.findByText(/The image could not be made in this browser/);
    expect(screen.getByRole("link", { name: "Share on X" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Download" }) as HTMLButtonElement).disabled).toBe(true);
    quiet.mockRestore();
  });
});

describe("ShareCardModal", () => {
  it("is a dialog named for what is shared, and closes", async () => {
    const onClose = vi.fn();
    render(<ShareCardModal open onClose={onClose} title="Share your P&L" card={card} />);
    expect(screen.getByRole("dialog", { name: "Share your P&L" })).toBeTruthy();
    await screen.findByRole("img");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
