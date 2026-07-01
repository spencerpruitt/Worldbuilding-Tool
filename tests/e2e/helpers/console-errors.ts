import type {Page} from "@playwright/test";

// Shared console/pageerror collector for the e2e specs (react-boot, load-map).
// Attach it BEFORE the navigation whose errors you want to capture, then read
// the accumulator after the app settles. `critical()` filters out the expected
// external noise (fonts, analytics, failed third-party resource loads) that the
// app cannot control.
export function collectConsoleErrors(page: Page): {critical: () => string[]} {
  const errors: string[] = [];

  page.on("pageerror", error => {
    const message = error?.message || String(error);
    if (message) errors.push(`pageerror: ${message}`);
  });
  page.on("console", msg => {
    if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
  });

  const critical = () =>
    errors.filter(
      e =>
        !e.includes("fonts.googleapis.com") &&
        !e.includes("google-analytics") &&
        !e.includes("googletagmanager") &&
        !e.includes("Failed to load resource")
    );

  return {critical};
}
