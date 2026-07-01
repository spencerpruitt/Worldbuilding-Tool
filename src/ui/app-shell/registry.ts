/**
 * App-shell surface registry — the single source of truth for which React
 * surfaces are currently open.
 *
 * This is the seam that owns mounting for the whole re-platform: surfaces are
 * opened and closed by id, never by touching `createRoot` (the one root lives
 * in boot.tsx). `<App>` subscribes to this store and renders the open surfaces,
 * so "add a surface" is "register + openSurface", not "wire up new mounting
 * glue". The store is a plain module-level singleton with a subscribe/emit
 * interface shaped for React's `useSyncExternalStore`.
 *
 * This tracks UI open/close state only — it is deliberately separate from world
 * DATA (the deferred world-State store, Slice 7).
 */

/** Props handed to a surface when it is opened. Shape is surface-specific. */
export type SurfaceProps = Record<string, unknown>;

/** An open surface: its registry id plus the props it was opened with. */
export interface OpenSurface {
  id: string;
  props: SurfaceProps;
}

let openSurfaces: OpenSurface[] = [];
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/**
 * Open (or re-open) a surface. Re-opening an already-open surface replaces its
 * props instead of duplicating it, so a second `open()` call just updates the
 * surface with fresh props. Always produces a new snapshot array so subscribers
 * (and `useSyncExternalStore`) see the change.
 */
export function openSurface(id: string, props: SurfaceProps = {}): void {
  const withoutExisting = openSurfaces.filter(surface => surface.id !== id);
  openSurfaces = [...withoutExisting, { id, props }];
  emit();
}

/** Close a surface by id. No-op (and no notification) if it is not open. */
export function closeSurface(id: string): void {
  const isOpen = openSurfaces.some(surface => surface.id === id);
  if (!isOpen) return;
  openSurfaces = openSurfaces.filter(surface => surface.id !== id);
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
