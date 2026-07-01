import {expect, test} from "@playwright/test";
import path from "path";
import {collectConsoleErrors} from "./helpers/console-errors";

// Slice 5 parity check: Compare Prices is a React surface reached through the
// real trigger seam both legacy callers use (`lazy.comparePrices().then(m =>
// m.open())`), and the legacy static dialog markup (`#marketsGoodCompare`) is
// gone. Loads the demo map so there is real world data (markets/goods) for the
// surface to render, mirroring load-map.spec's load pattern.
test.describe("Compare Prices parity (React surface)", () => {
  test("opens the React surface via the real trigger seam; legacy markup is gone", async ({context, page}) => {
    await context.clearCookies();

    const errors = collectConsoleErrors(page);

    await page.goto("/");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    await page.waitForSelector("#mapToLoad", {state: "attached"});

    // Load the demo map exactly as load-map.spec does.
    const fileInput = page.locator("#mapToLoad");
    const mapFilePath = path.join(__dirname, "../fixtures/demo.map");
    await fileInput.setInputFiles(mapFilePath);

    await page.waitForFunction(() => (window as any).mapId !== undefined, {timeout: 120000});
    await page.waitForTimeout(500);

    // The legacy static dialog markup must be gone (bridge/dialog census drops by one).
    const legacyExists = await page.evaluate(() => document.getElementById("marketsGoodCompare") !== null);
    expect(legacyExists).toBe(false);

    // Trigger the surface exactly as the markets-overview button does — the real
    // code path both callers invoke, not a test-only shortcut.
    await page.evaluate(() => (window as any).lazy.comparePrices().then((m: any) => m.open()));

    // The React Panel opened: a dialog titled "Compare Prices" is visible.
    const dialog = page.getByRole("dialog", {name: "Compare Prices"});
    await expect(dialog).toBeVisible();

    // It contains a goods <select> (combobox) and at least one market row.
    const goodsSelect = dialog.getByRole("combobox");
    await expect(goodsSelect).toBeVisible();
    await expect(dialog.locator(".states").first()).toBeVisible();
    const initialRowCount = await dialog.locator(".states").count();
    expect(initialRowCount).toBeGreaterThan(0);

    // The Refresh / percentage / Export controls are present.
    await expect(dialog.getByRole("button", {name: "Refresh"})).toBeVisible();
    await expect(dialog.getByRole("button", {name: "Toggle percentage view"})).toBeVisible();
    await expect(dialog.getByRole("button", {name: "Export as CSV"})).toBeVisible();

    // Changing the good re-renders the table: capture the current rows, pick a
    // different option, and assert the rendered row contents change.
    const optionValues = await goodsSelect.locator("option").evaluateAll(options =>
      (options as HTMLOptionElement[]).map(option => option.value)
    );
    expect(optionValues.length).toBeGreaterThan(1);

    const rowsSnapshot = () => dialog.locator(".states").evaluateAll(nodes => nodes.map(node => node.textContent ?? ""));
    const beforeRows = await rowsSnapshot();

    const currentValue = await goodsSelect.inputValue();
    const nextValue = optionValues.find(value => value !== currentValue);
    expect(nextValue).toBeTruthy();
    await goodsSelect.selectOption(nextValue as string);

    await expect
      .poll(async () => JSON.stringify(await rowsSnapshot()))
      .not.toBe(JSON.stringify(beforeRows));

    // No critical console/page errors during the whole flow.
    expect(errors.critical()).toEqual([]);
  });
});
