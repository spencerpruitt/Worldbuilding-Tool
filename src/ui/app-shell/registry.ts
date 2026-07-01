import type { ComponentType } from "react";

/**
 * App-shell surface registry — the single source of truth for BOTH which React
 * surfaces exist (id → component) and which are currently open.
 *
 * This is the seam that owns mounting for the whole re-platform: surfaces are
 * opened and closed by id, never by touching `createRoot` (the one root lives
 * in boot.tsx). A surface is added by calling `registerSurface(id, component)`
 * once (see `surfaces/index.ts`); `<App>` looks the component up by id and
 * renders the open ones. Ids are the `SurfaceId` union, so `openSurface` /
 * `registerSurface` reject a typo'd id at compile time. The open-state store is
 * a plain module-level singleton with a subscribe/emit interface shaped for
 * React's `useSyncExternalStore`.
 *
 * This tracks UI existence + open/close state only — it is deliberately separate
 * from world DATA (the world-State accessor and its reactivity, ADR-0004).
 */

/**
 * Every registered surface id. Adding a surface adds its id here (giving the
 * `open()` seam a compile-time-checked id) and a `registerSurface` call.
 */
export type SurfaceId = "compare-prices" | "market-overview" | "market-deals" | "trade-details";

/** Props handed to a surface when it is opened. Shape is surface-specific. */
export type SurfaceProps = Record<string, unknown>;

/**
 * A surface component: takes at least an `onClose`, widened with the opened-with
 * props (which arrive at runtime from `openSurface`, so they cannot be tied to
 * the id statically — the id itself is the compile-checked part).
 */
export type SurfaceComponent = ComponentType<{ onClose: () => void } & Record<string, unknown>>;

const surfaceComponents = new Map<SurfaceId, SurfaceComponent>();

/** Register the component that renders a surface id. Called once per surface. */
export function registerSurface(id: SurfaceId, component: SurfaceComponent): void {
  surfaceComponents.set(id, component);
}

/** The component registered for a surface id, or undefined if none is. */
export function getSurfaceComponent(id: SurfaceId): SurfaceComponent | undefined {
  return surfaceComponents.get(id);
}

/**
 * An open surface: its registry id, the props it was opened with, and a `token`
 * that increments on every `openSurface` call. The token lets `<App>` key each
 * surface by (id, token) so re-opening an already-open surface remounts it
 * fresh — matching the legacy dialogs, which rebuilt their content and reset
 * their view on every `open()`. Without it, re-opening with unchanged props
 * would be a no-op and the surface would keep its stale in-panel state.
 */
export interface OpenSurface {
  id: SurfaceId;
  props: SurfaceProps;
  token: number;
}

let openSurfaces: OpenSurface[] = [];
let nextToken = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/**
 * Open (or re-open) a surface. Re-opening an already-open surface replaces its
 * entry (fresh props + a new token) instead of duplicating it. Always produces a
 * new snapshot array so subscribers (and `useSyncExternalStore`) see the change.
 */
export function openSurface(id: SurfaceId, props: SurfaceProps = {}): void {
  const withoutExisting = openSurfaces.filter(surface => surface.id !== id);
  openSurfaces = [...withoutExisting, { id, props, token: nextToken++ }];
  emit();
}

/** Close a surface by id. No-op (and no notification) if it is not open. */
export function closeSurface(id: SurfaceId): void {
  const isOpen = openSurfaces.some(surface => surface.id === id);
  if (!isOpen) return;
  openSurfaces = openSurfaces.filter(surface => surface.id !== id);
  emit();
}

/**
 * Close every open surface. This is the React counterpart to the legacy
 * `closeDialogs()`: since migrated surfaces are React panels (not jQuery `.dialog`
 * elements), the legacy call no longer reaches them, so the map-load path calls
 * this too — otherwise a panel from the previous world would linger after loading a
 * different `.map`. No-op (and no notification) when nothing is open.
 */
export function closeAllSurfaces(): void {
  if (openSurfaces.length === 0) return;
  openSurfaces = [];
  emit();
}

/**
 * The current snapshot of open surfaces. The reference is stable until the set
 * of open surfaces actually changes, which `useSyncExternalStore` relies on to
 * avoid infinite re-render loops.
 */
export function getOpenSurfaces(): OpenSurface[] {
  return openSurfaces;
}

/** Subscribe to open/close changes. Returns an unsubscribe function. */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
