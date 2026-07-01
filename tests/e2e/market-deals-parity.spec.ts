import path from "path";
import {expect, test} from "@playwright/test";
import {collectConsoleErrors} from "./helpers/console-errors";

// Slice 8 parity check: Market Deals is a React surface reached through the real
// trigger seam its caller uses (`lazy.marketDealsOverview().then(m =>
// m.open(marketId))`), and the legacy static dialog markup (`#marketDeals`) is
// gone. Loads the demo map so there is real world data to render.
test.describe("Market Deals parity (React surface)", () => {
  test("opens via the real seam; controls render; legacy markup is gone", async ({context, page}) => {
    await context.clearCookies();

    const errors = collectConsoleErrors(page);

    await page.goto("/");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    await page.waitForSelector("#mapToLoad", {state: "attached"});
    const fileInput = page.locator("#mapToLoad");
    const mapFilePath = path.join(__dirname, "../fixtures/demo.map");
    await fileInput.setInputFiles(mapFilePath);

    await page.waitForFunction(() => (window as any).mapId !== undefined, {timeout: 120000});
    await page.waitForTimeout(500);

    // The legacy static dialog markup must be gone (bridge/dialog census drops by one).
    const legacyExists = await page.evaluate(() => document.getElementById("marketDeals") !== null);
    expect(legacyExists).toBe(false);

    // Trigger the surface exactly as the market-overview "View deals" action does,
    // opening the first real market.
    await page.evaluate(() => {
      const market = (window as any).pack.markets.find(Boolean);
      return (window as any).lazy.marketDealsOverview().then((m: any) => m.open(market.i));
    });

    // The React Panel opened: a dialog titled "… Market Deals" is visible.
    const dialog = page.getByRole("dialog", {name: /Market Deals$/});
    await expect(dialog).toBeVisible();

    // The filter dropdown and the refresh / export controls are present.
    await expect(dialog.getByRole("combobox")).toBeVisible();
    await expect(dialog.getByRole("button", {name: "Refresh"})).toBeVisible();
    await expect(dialog.getByRole("button", {name: "Export as CSV"})).toBeVisible();

    // The deals table is present (rows, or the empty-state message).
    await expect(dialog.locator(".table")).toBeVisible();

    expect(errors.critical()).toEqual([]);
  });
});
