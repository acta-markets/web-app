import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEVNET_NOTE, SITE_LINE, buildPageMetadata, describe as describeSite, siteName, siteOrigin, tradeTitle } from "./site-metadata";

const devnet = { mainnet: false, origin: "https://devnet.acta.markets" };
const mainnet = { mainnet: true, origin: "https://beta.acta.markets" };

describe("what the site calls itself", () => {
  it("says Devnet in its name on devnet, and only there", () => {
    expect(siteName(false)).toBe("Acta Devnet");
    expect(siteName(true)).toBe("Acta");
  });

  it("closes every devnet description with the test-funds note, so a preview never reads as real money", () => {
    expect(describeSite("Income vaults.", false)).toBe(`Income vaults. ${DEVNET_NOTE}`);
    expect(describeSite("Income vaults.", true)).toBe("Income vaults.");
  });

  it("is the devnet site on a devnet build, whatever address the Vercel project calls production", () => {
    // tests run as a devnet build: no network variable is set
    expect(siteOrigin()).toBe("https://devnet.acta.markets");
  });
});

describe("a page's metadata", () => {
  it("names the page's own address on its own site, for the canonical link and the preview", () => {
    const meta = buildPageMetadata({ title: "Trade", description: "Say where a price will be.", path: "/trade" }, devnet);
    expect(meta.alternates?.canonical).toBe("https://devnet.acta.markets/trade");
    expect(meta.openGraph).toMatchObject({ url: "https://devnet.acta.markets/trade", siteName: "Acta Devnet", type: "website" });
  });

  it("gives the preview a whole title, since a preview shows it without the tab's suffix", () => {
    expect(buildPageMetadata({ title: "Trade", path: "/trade" }, devnet).openGraph?.title).toBe("Trade | Acta Devnet");
    expect(buildPageMetadata({ title: "Trade", path: "/trade" }, mainnet).openGraph?.title).toBe("Trade | Acta");
    expect(buildPageMetadata({ path: "/" }, mainnet).openGraph?.title).toBe(`Acta: ${SITE_LINE}`);
  });

  it("carries the devnet note in the description and the preview alike", () => {
    const meta = buildPageMetadata({ title: "Earn", description: "Income vaults.", path: "/earn" }, devnet);
    expect(meta.description).toBe(`Income vaults. ${DEVNET_NOTE}`);
    expect(meta.openGraph?.description).toBe(meta.description);
    expect(buildPageMetadata({ title: "Earn", description: "Income vaults.", path: "/earn" }, mainnet).description).toBe("Income vaults.");
  });

  it("writes the root's address without a trailing slash", () => {
    expect(buildPageMetadata({ path: "/" }, mainnet).alternates?.canonical).toBe("https://beta.acta.markets");
  });

  it("keeps a page out of search only when asked to", () => {
    expect(buildPageMetadata({ title: "Portfolio", path: "/portfolio", index: false }, devnet).robots).toEqual({ index: false, follow: false });
    expect(buildPageMetadata({ title: "Trade", path: "/trade" }, devnet).robots).toBeUndefined();
  });

  it("always names a picture, since a page's preview fields replace the layout's, picture included", () => {
    const images = (input: Parameters<typeof buildPageMetadata>[0], env = devnet) => buildPageMetadata(input, env).openGraph?.images;
    expect(images({ title: "Partners", path: "/partners" })).toEqual([
      { url: "/og/site", width: 1200, height: 630, alt: "Acta Devnet: options and curated yield vaults on Solana" },
    ]);
    expect(images({ title: "Trade", path: "/trade", image: "trade" })).toMatchObject([{ url: "/og/trade" }]);
    expect(images({ title: "Earn", path: "/earn", image: "earn" }, mainnet)).toMatchObject([
      { url: "/og/earn", alt: "Earn on Acta: income vaults on jitoSOL, USDC and TSLA" },
    ]);
  });
});

describe("the Trade title for a link that preselects an asset", () => {
  it("names a token the app knows, written the app's way", () => {
    expect(tradeTitle("btc")).toBe("Trade BTC");
    expect(tradeTitle(["SOL", "BTC"])).toBe("Trade SOL");
  });

  it("names LST, and in the P0 edition does not name jitoSOL, which that build leaves out", () => {
    expect(tradeTitle("lst")).toBe("Trade LST");
    expect(tradeTitle("JITOSOL")).toBe("Trade jitoSOL");
    expect(tradeTitle("JITOSOL", "p0")).toBe("Trade");
    expect(tradeTitle("jitosol", "p0")).toBe("Trade");
    expect(tradeTitle("LST", "p0")).toBe("Trade LST");
  });

  it("ignores anything else, so a link cannot write its own title", () => {
    expect(tradeTitle(undefined)).toBe("Trade");
    expect(tradeTitle("NOTATOKEN")).toBe("Trade");
    expect(tradeTitle("BTC is going to zero")).toBe("Trade");
    expect(tradeTitle("<script>")).toBe("Trade");
  });
});

describe("favicon.ico", () => {
  // made by scripts/make-favicon.mjs from the site's own icon route
  const file = readFileSync(join(process.cwd(), "src/app/favicon.ico"));

  it("is an icon file holding the three tab sizes", () => {
    expect(file.readUInt16LE(0)).toBe(0);
    expect(file.readUInt16LE(2)).toBe(1);
    expect(file.readUInt16LE(4)).toBe(3);
    expect([0, 1, 2].map((i) => file.readUInt8(6 + i * 16))).toEqual([16, 32, 48]);
  });

  it("points each entry at a PNG inside the file", () => {
    for (const i of [0, 1, 2]) {
      const size = file.readUInt32LE(6 + i * 16 + 8);
      const offset = file.readUInt32LE(6 + i * 16 + 12);
      expect(offset + size).toBeLessThanOrEqual(file.length);
      expect(file.subarray(offset, offset + 8).toString("hex")).toBe("89504e470d0a1a0a");
    }
  });
});
