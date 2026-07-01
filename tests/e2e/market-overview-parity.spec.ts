import path from "path";
import {expect, test} from "@playwright/test";
import {collectConsoleErrors} from "./helpers/console-errors";

// Slice 7 parity check: Market Overview is a React surface reached through the
// real trigger seam its caller uses (`lazy.marketOverview().then(m =>
// m.open(marketId))`), it reflects live world state (renaming updates the title),
// and the legacy static dialog markup (`#marketOverview`) is gone. Loads the demo
// map so there is real world data (markets/goods/states) to render.
test.describe("Market Overview parity (React surface)", () => {
  test("opens via the real seam, renames live, and the legacy markup is gone", async ({context, page}) => {
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
    const legacyExists = await page.evaluate(() => document.getElementById("marketOverview") !== null);
    expect(legacyExists).toBe(false);

    // Trigger the surface exactly as the markets-overview market-row click does —
    // the real code path, opening the first real market.
    await page.evaluate(() => {
      const market = (window as any).pack.markets.find(Boolean);
      return (window as any).lazy.marketOverview().then((m: any) => m.open(market.i));
    });

    // The React Panel opened: a dialog titled "Market Stock: …" is visible.
    const dialog = page.getByRole("dialog", {name: /^Market Stock: /});
    await expect(dialog).toBeVisible();

    // It renders the goods table, the summary line, and the owner line.
    await expect(dialog.locator(".marketGood").first()).toBeVisible();
    expect(await dialog.locator(".marketGood").count()).toBeGreaterThan(0);
    await expect(dialog.getByText(/^Cells: /)).toBeVisible();
    await expect(dialog.getByText(/^Burgs: /)).toBeVisible();
    await expect(dialog.getByText(/^Stock: /)).toBeVisible();
    await expect(dialog.getByText("Owner:")).toBeVisible();

    // The Refresh / View deals / Export controls are present.
    await expect(dialog.getByRole("button", {name: "Refresh"})).toBeVisible();
    await expect(dialog.getByRole("button", {name: "View market deals"})).toBeVisible();
    await expect(dialog.getByRole("button", {name: "Export as CSV"})).toBeVisible();

    // Reactivity/parity: typing a custom name updates the live title (the rename
    // goes through the accessor, which signals a world change).
    const nameInput = dialog.getByRole("textbox");
    await nameInput.fill("E2E Test Harbor");
    await expect(page.getByRole("dialog", {name: "Market Stock: E2E Test Harbor"})).toBeVisible();

    // Resetting clears the custom name (title falls back to the default).
    await dialog.getByRole("button", {name: "Reset market name"}).click();
    await expect(nameInput).toHaveValue("");

    // No critical console/page errors during the whole flow.
    expect(errors.critical()).toEqual([]);
  });
});
