import { fileURLToPath } from 'node:url'
import { playwright } from '@vitest/browser-playwright'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Standalone browser-runner config (does NOT inherit vite.config.ts). It needs
// the React plugin so .tsx/JSX transforms under the browser runner, and the
// "@" → src alias to match the app build. React component tests (React Testing
// Library on Chromium) live in src/ui/**/*.browser.test.{ts,tsx}.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: ['src/ui/**/*.browser.test.{ts,tsx}'],
    setupFiles: ['./src/ui/test-setup.browser.ts'],
    browser: {
      enabled: true,
      provider: playwright(),
      // https://vitest.dev/config/browser/playwright
      instances: [
        { name: 'chromium', browser: 'chromium' },
      ],
      locators: {
        testIdAttribute: 'id',
      },
    },
  },
})
