import { test, expect } from "@playwright/test";

test.describe("Market page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/market/jitoSOL?type=call");
    await page.waitForLoadState("networkidle");
  });

  test("full page screenshot matches design", async ({ page }) => {
    await page.waitForFunction(() => document.fonts.ready);
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("market-full.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.05
    });
  });

  test("breadcrumb renders with correct structure", async ({ page }) => {
    const earnLink = page.locator("a").filter({ hasText: "Earn" }).first();
    await expect(earnLink).toBeVisible();

    const earnClasses = await earnLink.getAttribute("class");
    expect(earnClasses).toContain("text-content-secondary");

    const marketText = page.locator("span").filter({ hasText: /^Market$/ }).first();
    await expect(marketText).toBeVisible();

    const marketClasses = await marketText.getAttribute("class");
    expect(marketClasses).toContain("text-content-primary");
  });

  test("asset name heading exists with Space Grotesk", async ({ page }) => {
    const heading = page.locator("h1").first();
    await expect(heading).toBeVisible();

    const classes = await heading.getAttribute("class");
    expect(classes).toContain("font-space");
    expect(classes).toContain("text-content-primary");
  });

  test("info box uses design system border", async ({ page }) => {
    // Target the spot/cap info card specifically
    const infoBox = page.locator("[class*='border-bg-border'][class*='bg-bg-primary']").first();
    await expect(infoBox).toBeVisible();

    const classes = await infoBox.getAttribute("class");
    expect(classes).toContain("border-bg-border");
    expect(classes).toContain("bg-bg-primary");
  });

  test("active expiry tab has teal styling classes", async ({ page }) => {
    const activeTab = page.locator("button[aria-selected='true']").first();
    await expect(activeTab).toBeVisible();

    const classes = await activeTab.getAttribute("class");
    expect(classes).toContain("bg-accent-primary/20");
    expect(classes).toContain("border-accent-primary/30");
  });

  test("price tabs render 3 options", async ({ page }) => {
    // Price option buttons inside the price selection AppCard
    const priceCard = page.locator("[class*='border-bg-border']").filter({
      hasText: "Choose the price"
    });
    await expect(priceCard).toBeVisible();

    const priceBtns = priceCard.locator("button");
    const count = await priceBtns.count();
    expect(count).toBe(3);

    // First should be active with teal styling
    const firstClasses = await priceBtns.first().getAttribute("class");
    expect(firstClasses).toContain("bg-accent-primary/20");
    expect(firstClasses).toContain("flex-1");
  });

  test("deposit input uses correct background", async ({ page }) => {
    const depositInput = page.locator("[class*='bg-action-primary']").first();
    await expect(depositInput).toBeVisible();

    const classes = await depositInput.getAttribute("class");
    expect(classes).toContain("bg-action-primary");
    expect(classes).toContain("border");
  });

  test("deposit tabs show call/csp options with correct active state", async ({ page }) => {
    const depositJito = page.locator("button").filter({ hasText: "Deposit jitoSOL" });
    const depositUsdc = page.locator("button").filter({ hasText: "Deposit USDC" });

    await expect(depositJito).toBeVisible();
    await expect(depositUsdc).toBeVisible();

    // Active tab (call=jitoSOL) should have teal border
    const activeClasses = await depositJito.getAttribute("class");
    expect(activeClasses).toContain("border-accent-primary");
    expect(activeClasses).toContain("bg-accent-primary/20");
    expect(activeClasses).toContain("text-accent-secondary");
  });

  test("section headings use Space Grotesk", async ({ page }) => {
    const nowHeading = page.locator("h3").filter({ hasText: "Now" });
    await expect(nowHeading).toBeVisible();

    const classes = await nowHeading.getAttribute("class");
    expect(classes).toContain("font-space");

    const expiryHeading = page.locator("h3").filter({ hasText: "Expiry" });
    const expiryClasses = await expiryHeading.getAttribute("class");
    expect(expiryClasses).toContain("font-space");
  });

  test("no gradient outcome backgrounds remain", async ({ page }) => {
    const gradients = await page.evaluate(() => {
      const els = document.querySelectorAll(".outcome-positive, .outcome-negative");
      return els.length;
    });
    expect(gradients).toBe(0);
  });

  test("no lime green yuzu-main colors in SVG elements", async ({ page }) => {
    const limePresent = await page.evaluate(() => {
      const svgEls = document.querySelectorAll("path, line, circle");
      for (const el of svgEls) {
        const stroke = el.getAttribute("stroke") || "";
        const fill = el.getAttribute("fill") || "";
        if (stroke.includes("204,255,0") || fill.includes("204,255,0")) {
          return true;
        }
      }
      return false;
    });
    expect(limePresent).toBe(false);
  });

  test("no old styling classes remain in page", async ({ page }) => {
    const oldClasses = await page.evaluate(() => {
      const html = document.body.innerHTML;
      return {
        whiteSlash10: html.includes("white/10"),
        whiteSlash5: html.includes("white/5"),
        yuzuMain: html.includes("yuzu-main"),
        outcomePos: html.includes("outcome-positive"),
        outcomeNeg: html.includes("outcome-negative")
      };
    });
    expect(oldClasses.whiteSlash10).toBe(false);
    expect(oldClasses.whiteSlash5).toBe(false);
    expect(oldClasses.yuzuMain).toBe(false);
    expect(oldClasses.outcomePos).toBe(false);
    expect(oldClasses.outcomeNeg).toBe(false);
  });

  test("deposit button uses primary variant", async ({ page }) => {
    const depositBtn = page.locator("button").filter({ hasText: "Deposit" }).last();
    await expect(depositBtn).toBeVisible();

    const classes = await depositBtn.getAttribute("class");
    expect(classes).toContain("bg-accent-primary");
  });

  test("chart sidebar renders with teal line colors", async ({ page }) => {
    // Check chart SVG elements use teal, not lime
    const chartLines = page.locator("path[stroke*='128,201,182']");
    const count = await chartLines.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("info boxes for On date section have correct structure", async ({ page }) => {
    const onDateHeading = page.locator("h3").filter({ hasText: /^On / });
    await expect(onDateHeading).toBeVisible();

    // Two info boxes below the heading
    const infoBoxes = onDateHeading.locator("~ div").first().locator("[class*='border-bg-border']");
    const count = await infoBoxes.count();
    expect(count).toBe(2);
  });
});
