import {expect, test} from "@playwright/test";
import {collectConsoleErrors} from "./helpers/console-errors";

// Verifies the Phase 0 foundation: a single app-wide React root boots alongside
// the legacy app. The <App> shell renders nothing yet, so booting is observed
// via the `data-react-booted` marker that boot.tsx sets after createRoot — this
// distinguishes "React actually booted" from "the static #react-root div merely
// exists in index.html". Error listeners are attached before the single
// navigation so any boot-time error is captured.
test.describe("React foundation boot", () => {
  test("mounts a single #react-root and boots React without errors", async ({context, page}) => {
    await context.clearCookies();

    const errors = collectConsoleErrors(page);

    await page.goto("/");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    // Exactly one app-wide mount node (the end-state single-root shape).
    await expect(page.locator("#react-root")).toBeAttached();
    expect(await page.locator("#react-root").count()).toBe(1);

    // React actually booted: boot.tsx set the marker after rendering <App/>.
    await expect(page.locator("#react-root")).toHaveAttribute("data-react-booted", "true");

    // Booting React must not perturb the legacy app: no critical errors.
    expect(errors.critical()).toEqual([]);
  });
});
