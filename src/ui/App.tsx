/**
 * App — the app-wide React shell (the "Minimal shell").
 *
 * Phase 0 of the React re-platform (ADR-0002 / ADR-0003): this root component
 * owns zero surfaces yet. It renders nothing so the legacy app stays visually
 * and behaviorally identical while React is stood up in the build. Surfaces
 * (the <Panel> frame, Compare Prices, and later chrome) are added in subsequent
 * slices, at which point this shell grows an open-surface registry.
 *
 * Uses the automatic JSX runtime — no `import React` required.
 */
export function App() {
  return null;
}
