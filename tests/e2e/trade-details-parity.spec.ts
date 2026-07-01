import path from "path";
import {expect, test} from "@playwright/test";
import {collectConsoleErrors} from "./helpers/console-errors";

// Slice 8 parity check: Trade Details is a React surface reached through the real
// trigger seam its caller uses (`lazy.tradeDetails().then(m => m.open(batch))`),
// and the legacy static dialog markup (`#tradeDetails`) is gone. A trade batch is
// built from the demo map's real deals via the same TradeAnimation the renderer
// uses.
test.describe("Trade Details parity (React surface)", () => {
  test("opens via the real seam with a real batch; legacy markup is gone", async ({context, page}) => {
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
    const legacyExists = await page.evaluate(() => document.getElementById("tradeDetails") !== null);
    expect(legacyExists).toBe(false);

    // Build a real batch the way the trade-animation renderer does, then confirm the
    // demo map actually produced one (so the assertions below are meaningful).
    const hasBatch = await page.evaluate(() => {
      const deals = (window as any).pack.deals ?? [];
      const batches = (window as any).TradeAnimation.getDealBatches(deals);
      (window as any).__testBatch = batches[0];
      return Boolean(batches[0]);
    });
    expect(hasBatch).toBe(true);

    // Trigger the surface exactly as the renderer's batch click does.
    await page.evaluate(() => (window as any).lazy.tradeDetails().then((m: any) => m.open((window as any).__testBatch)));

    // The React Panel opened: a dialog titled "Trade: … to …" is visible with the
    // seller/buyer summary and an aggregated goods table.
    const dialog = page.getByRole("dialog", {name: /^Trade: .+ to .+/});
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Seller")).toBeVisible();
    await expect(dialog.getByText("Buyer")).toBeVisible();
    await expect(dialog.locator(".tradeDeal").first()).toBeVisible();

    expect(errors.critical()).toEqual([]);
  });
});
