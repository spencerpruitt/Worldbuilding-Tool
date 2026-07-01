# ADR-0003: React + build tooling choices for the UI re-platform foundation

**Status:** Accepted

**Date:** 2026-06-30

**Category:** Implementation

**Affected Areas:** build pipeline (`vite.config.ts`), TypeScript config (`tsconfig.json`),
lint/format config (`biome.json`), the browser test runner (`vitest.browser.config.ts`), a new
`src/ui/` source subtree, and `package.json` dependencies. Implements
[ADR-0002](./adr-0002-ui-replatform-react-webgl.md) and the
[replatform-foundation PRD](../prds/in-progress/replatform-foundation.md) Phase 0.

## Context

ADR-0002 committed to re-platforming the UI chrome on React while preserving the domain core. That
decision named React and a hybrid renderer as the *direction* but deliberately left the concrete
tooling unpinned. The CLAUDE.md axiom "don't introduce new tooling without an ADR" requires those
specifics to be recorded before Phase 0 of the foundation PRD (adding React to the build and
booting an app-wide root) can land.

There is no React in the tree today. The existing stack is already modern and opinionated, which
constrains the choices:

- **Build:** Vite 8, `root: ./src`, esbuild transpile, `@` → `src` alias, `publicDir: ../public`.
- **TypeScript:** `strict`, `isolatedModules`, `moduleResolution: bundler`, `noEmit`,
  `noUnusedLocals`/`noUnusedParameters`. No `jsx` setting yet.
- **Lint/format:** Biome 2.4, `files.includes` scoped to `src/**/*.ts` only (no `.tsx`), pre-commit
  hook runs `biome check`.
- **Tests:** Vitest 4 with two configs — a Node config for unit tests and a browser config
  (`@vitest/browser-playwright`, Chromium) that already sets `locators.testIdAttribute: "id"`.

The choices must fit this stack with minimal churn, match the project's cutting-edge dependency
posture, and honor ADR-0002's stated rationale for React — "ecosystem, documentation, and AI-tooling
coverage." Build speed is not currently a constraint at this repo's size; documentation and
tooling coverage are the priorities for a migration that fresh agents will carry forward.

## Decision

Adopt the following for the React foundation. Each is chosen to be the canonical, best-documented
option that fits the existing Vite/TS/Biome/Vitest stack:

1. **React 19 + ReactDOM 19** (with `@types/react`, `@types/react-dom`), matching the project's
   latest-stable dependency posture (Vite 8, Vitest 4). Use the **automatic JSX runtime** — no
   `import React` needed per file.

2. **Vite React integration via `@vitejs/plugin-react`** (the Babel-based official plugin), added to
   `vite.config.ts` `plugins`. It provides React Fast Refresh (hot reload of components in dev) and
   the automatic-runtime wiring out of the box, and is the most documented / AI-legible option.

3. **TypeScript:** add `"jsx": "react-jsx"` to `tsconfig.json` (automatic runtime). All other strict
   settings stay; `.tsx` files are covered by the existing `include: ["src"]`.

4. **Code home: a new `src/ui/` subtree** for all React chrome (the app root/shell, the World-State
   accessor, the `<Panel>` window frame, and Surface components). This is a subfolder of the existing
   `src/` tree, **not** a new top-level directory, so it needs no separate structural ADR — it is
   recorded here. It sits alongside `src/controllers/` during the migration; controllers shrink as
   surfaces move to `src/ui/`, and the split resolves at cutover.

5. **Styling — reuse existing global CSS for now.** Early surfaces reuse the current global CSS
   classes so they render identically to their legacy counterparts (parity is the goal for the
   tracer). Choosing a styling *system* (CSS Modules, etc.) is explicitly deferred to a later phase
   when a converted surface needs styles the global sheet can't provide.

6. **Component tests — React Testing Library on the existing Vitest browser runner.** Add
   `@testing-library/react` and `@testing-library/user-event`; React component tests run under the
   Chromium browser config (real DOM), consistent with the project's existing browser tests. No
   jsdom / no new test runner is introduced.

7. **Lint/format — extend Biome to `.tsx`.** Change `biome.json` `files.includes` to also match
   `src/**/*.tsx` (Biome 2 lints and formats JSX/TSX). Formatting rules are unchanged.

Interop (how React reads world State off the `window.X` bridge) is set by ADR-0002 and the PRD and is
out of scope here; this ADR pins only the build/tooling stack.

## Alternatives Considered

| Alternative | Pros | Cons |
|---|---|---|
| **(A) `@vitejs/plugin-react` (Babel) — chosen** | Official, canonical, best-documented; Fast Refresh + automatic runtime out of the box; maximal AI-tooling coverage (ADR-0002's stated reason for React) | Babel transform is marginally slower than SWC on large builds |
| (B) `@vitejs/plugin-react-swc` | Faster dev/build transform | Build speed isn't a current constraint; slightly less ubiquitous in docs/examples; another native toolchain in the stack |
| (C) No plugin — rely on esbuild-native JSX | Zero new build dependency | Loses React Fast Refresh; automatic-runtime + HMR wiring becomes manual/undocumented — friction for every agent |
| (D) React 18 instead of 19 | Longer track record | Regresses from the project's latest-stable posture; no benefit for greenfield UI code |
| (E) jsdom + Node Vitest for component tests | No browser needed | Diverges from the project's existing browser-test setup; jsdom is a weaker DOM approximation than the real Chromium already configured |

## Consequences

- **New runtime dependencies:** `react`, `react-dom`. **New dev dependencies:** `@vitejs/plugin-react`,
  `@types/react`, `@types/react-dom`, `@testing-library/react`, `@testing-library/user-event`. Bundle
  size grows by React's runtime — acceptable and expected per ADR-0002; the map/domain core is
  unaffected.
- **Config diffs:** `vite.config.ts` gains the React plugin; `tsconfig.json` gains `"jsx":
  "react-jsx"`; `biome.json` `files.includes` gains `src/**/*.tsx`. These are the Phase 0 build
  changes the PRD's round-trip and app-boot checks must prove harmless.
- **New source subtree** `src/ui/` becomes the home for React chrome; ARCHITECTURE.md should note it
  when Phase 0 lands (React chrome lives in `src/ui/`; `src/controllers/` is the shrinking legacy/TS
  editor layer until cutover).
- **Deferred decisions** (each revisited when a surface forces it): the styling system, and the
  window-frame primitive (hand-rolled `<Panel>` vs a drag/resize library — tracked in the PRD).
- **No superseding:** this ADR refines ADR-0002's implementation and does not change its decision;
  ADR-0002 remains Accepted.
