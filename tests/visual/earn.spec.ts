import { test, expect } from "@playwright/test";

test.describe("Earn page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/earn");
    await page.waitForLoadState("networkidle");
  });

  test("full page screenshot matches design", async ({ page }) => {
    await page.waitForFunction(() => document.fonts.ready);
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("earn-full.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.05
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

  test("Calls/Puts selector uses correct active state colors", async ({ page }) => {
    // Calls should be active by default — look for the teal-bg div
    const callsButton = page.locator("button").filter({ hasText: "Calls" }).first();
    await expect(callsButton).toBeVisible();

    // The inner div should have teal active styling
    const callsDiv = callsButton.locator("div").first();
    const bgColor = await callsDiv.evaluate((el) => getComputedStyle(el).backgroundColor);
    // rgba(42, 162, 134, 0.2) is the active tab fill
    expect(bgColor).toContain("42");
    expect(bgColor).toMatch(/16[12]/);

    // Click Puts and verify it becomes active
    const putsButton = page.locator("button").filter({ hasText: "Puts" }).first();
    await putsButton.click();
    await page.waitForTimeout(100);

    const putsDiv = putsButton.locator("div").first();
    const putsBg = await putsDiv.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(putsBg).toContain("42");
    expect(putsBg).toMatch(/16[12]/);
  });

  test("Popular cards are visible with correct layout", async ({ page }) => {
    const popularHeading = page.locator("h2").filter({ hasText: "Popular" });
    await expect(popularHeading).toBeVisible();

    // Verify H2 font size (40px)
    const fontSize = await popularHeading.evaluate((el) => getComputedStyle(el).fontSize);
    expect(fontSize).toBe("40px");

    // Check cards exist (220px height token cards)
    const cards = page.locator("[class*='h-\\[220px\\]']");
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("All markets table renders with correct borders", async ({ page }) => {
    const allMarketsHeading = page.locator("h2").filter({ hasText: "All markets" });
    await expect(allMarketsHeading).toBeVisible();

    // Table wrapper should have border-bg-border
    const tableWrapper = allMarketsHeading.locator("~ div").first();
    await expect(tableWrapper).toBeVisible();

    const borderColor = await tableWrapper.evaluate((el) => getComputedStyle(el).borderColor);
    // #282828 = rgb(40, 40, 40)
    expect(borderColor).toBe("rgb(40, 40, 40)");

    // Check rows exist (60px height)
    const rows = tableWrapper.locator("[class*='h-\\[60px\\]']");
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThanOrEqual(1);
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
