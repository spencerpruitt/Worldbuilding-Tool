import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  // Mirror the "@" → src alias from vite.config.ts / tsconfig so tests resolve
  // runtime "@/..." imports the same way the app build does.
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  },
  test: {
    root: "./src",
    setupFiles: ["./test-setup.ts"],
    environment: "node",
    // React component tests run on the browser runner (vitest.browser.config.ts),
    // not here — keep the Node runner from picking them up.
    exclude: [...configDefaults.exclude, "**/*.browser.test.{ts,tsx}"]
  }
});
