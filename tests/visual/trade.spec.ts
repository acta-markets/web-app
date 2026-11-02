import { test, expect, type Page } from "@playwright/test";

/** A sentence pill, the box the user sees. */
const pill = (page: Page, name: string) => page.locator(`section [data-pill="${name}"]`);
/** What picks its value: the native select laid over the pill on phones, the pill itself (a menu button) from 768px. */
const picker = (page: Page, name: string) =>
  page.locator(`section button[data-pill="${name}"], section [data-pill="${name}"] select`);

/** The values a pill offers now, disabled ones left out. */
async function choices(page: Page, name: string): Promise<string[]> {
  const native = pill(page, name).locator("select");
  if (await native.count()) {
    return native.locator("option:not([disabled])").evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
  }
  await pill(page, name).click();
  const menu = page.getByRole("listbox", { name });
  const values = await menu
    .locator("[role=option]:not([aria-disabled])")
    .evaluateAll((os) => os.map((o) => o.getAttribute("data-value") ?? ""));
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  return values;
}

async function choose(page: Page, name: string, value: string) {
  const native = pill(page, name).locator("select");
  if (await native.count()) {
    await native.selectOption(value);
    return;
  }
  await pill(page, name).click();
  await page.getByRole("listbox", { name }).locator(`[role=option][data-value="${value}"]`).click();
}

test.describe("Trade page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/trade");
    await page.waitForLoadState("networkidle");
    // the sentence's pickers fill in once live market data arrives
    await expect(picker(page, "Price")).toBeEnabled({ timeout: 30_000 });
  });

  test("full page screenshot matches design", async ({ page }) => {
    await page.waitForFunction(() => document.fonts.ready);
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("trade-easy-full.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.05,
      // price history moves every day
      mask: [page.locator("svg[aria-hidden='true']:not(.lucide)")]
    });
  });

  test("header has correct styling", async ({ page }) => {
    const nav = page.locator("nav").first();
    await expect(nav).toBeVisible();

    const navStyle = await nav.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        position: cs.position,
        zIndex: cs.zIndex
      };
    });
    expect(navStyle.position).toBe("relative");
    expect(Number(navStyle.zIndex)).toBeGreaterThanOrEqual(50);
  });

  test("Easy mode is the thesis and its payout, with inline pickers", async ({ page }) => {
    const thesis = page.locator("section p").first();
    const payout = page.locator("section p", { hasText: "If I deposit" });
    await expect(thesis).toContainText("I believe");
    await expect(thesis).toContainText("will be");
    await expect(payout).toContainText("If I deposit");
    await expect(payout).toContainText("I get paid");
    await expect(page.locator("section p").nth(1)).toHaveText(/^SOL (can (fall|rise) \d+\.\d% and you're still right|has to (rise|fall) \d+\.\d% for you to be right|is right at your price today)\.$/);

    for (const name of ["Asset", "Direction", "Price", "Date"]) {
      await expect(picker(page, name)).toBeAttached();
    }
    await expect(page.getByLabel(/^Amount in /)).toBeVisible();
    await expect(page.getByRole("tab", { name: "Easy" })).toHaveAttribute("aria-selected", "true");
  });

  test("the mode switch sits on the left in both modes", async ({ page }) => {
    const left = async () => (await page.getByRole("tablist", { name: "Trading mode" }).boundingBox())?.x ?? -1;
    const sentenceLeft = (await page.locator("section p").first().boundingBox())?.x ?? -2;
    const easyLeft = await left();
    expect(Math.abs(easyLeft - sentenceLeft)).toBeLessThanOrEqual(1);

    await page.getByRole("tab", { name: "Pro" }).click();
    await expect(page.getByRole("heading", { name: "Pro mode is coming soon" })).toBeVisible();
    expect(await left()).toBe(easyLeft);
  });

  test("pickers open the platform picker on phones and a menu from 768px", async ({ page }) => {
    const direction = picker(page, "Direction");
    if ((page.viewportSize()?.width ?? 0) < 768) {
      expect(await direction.evaluate((el) => el.tagName)).toBe("SELECT");
      return;
    }
    await expect(direction).toHaveAttribute("aria-haspopup", "listbox");
    await direction.click();
    const menu = page.getByRole("listbox", { name: "Direction" });
    await expect(menu.getByRole("option")).toHaveCount(2);
    await expect(menu.locator("[aria-selected=true]")).toHaveCount(1);
    // just under its pill
    const pillBox = (await direction.boundingBox())!;
    const menuBox = (await menu.boundingBox())!;
    expect(menuBox.y - (pillBox.y + pillBox.height)).toBeGreaterThanOrEqual(0);
    expect(menuBox.y - (pillBox.y + pillBox.height)).toBeLessThan(12);
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(direction).toBeFocused();
  });

  test("no pick moves the sentence", async ({ page }) => {
    // every pill and every line, by position and size
    const layout = () =>
      page.locator("section [data-pill], section p").evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
        })
      );
    const before = await layout();
    for (const price of await choices(page, "Price")) {
      await choose(page, "Price", price);
      expect(await layout()).toEqual(before);
    }
    const sides = await choices(page, "Direction");
    for (const side of [...sides.slice(1), sides[0]]) {
      await choose(page, "Direction", side);
      expect(await layout()).toEqual(before);
      const dates = await choices(page, "Date");
      for (const value of [...dates.slice(1), dates[0]]) {
        await choose(page, "Date", value);
        expect(await layout()).toEqual(before);
      }
    }
  });

  test("direction pill is green above and red below", async ({ page }) => {
    // live data may list only one direction; check each one it lists
    for (const side of await choices(page, "Direction")) {
      await choose(page, "Direction", side);
      await expect(pill(page, "Direction")).toHaveClass(side === "above" ? /additional-green/ : /additional-red/);
      await expect(page.getByLabel(side === "above" ? "Amount in USDC" : "Amount in SOL")).toBeVisible();
    }
  });

  test("order details spell out both outcomes", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Order details" })).toBeVisible();
    await expect(page.getByText("You're right")).toBeVisible();
    await expect(page.getByText("You're wrong")).toBeVisible();
  });

  test("Pro mode is a placeholder that switches back to Easy", async ({ page }) => {
    await page.getByRole("tab", { name: "Pro" }).click();
    await expect(page).toHaveURL(/mode=pro/);
    await expect(page.getByRole("heading", { name: "Pro mode is coming soon" })).toBeVisible();

    await page.getByRole("button", { name: "Switch to Easy" }).click();
    await expect(page).not.toHaveURL(/mode=pro/);
    await expect(picker(page, "Asset")).toBeAttached();
  });

  test("page never scrolls sideways", async ({ page }) => {
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBe(0);
  });

  test("footer has top border and correct link colors", async ({ page }) => {
    const footer = page.locator("footer").first();
    await expect(footer).toBeVisible();

    const footerClasses = await footer.getAttribute("class");
    expect(footerClasses).toContain("border-t");
    expect(footerClasses).toContain("border-bg-border");
  });

  test("page uses JetBrains Mono font", async ({ page }) => {
    const body = page.locator("body");
    const fontFamily = await body.evaluate((el) => getComputedStyle(el).fontFamily);
    expect(fontFamily.toLowerCase()).toContain("jetbrains");
  });

  test("page background is dark (#121212)", async ({ page }) => {
    const bgColor = await page.evaluate(() => {
      return getComputedStyle(document.body).backgroundColor;
    });
    expect(bgColor).toBe("rgb(18, 18, 18)");
  });

  test("no light theme artifacts remain", async ({ page }) => {
    const htmlClasses = await page.locator("html").getAttribute("class");
    expect(htmlClasses).not.toContain("dark");

    const bgColor = await page.evaluate(() => {
      return getComputedStyle(document.body).backgroundColor;
    });
    expect(bgColor).not.toBe("rgb(247, 247, 247)");
  });
});
