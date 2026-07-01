import { type ComponentType, useEffect, useSyncExternalStore } from "react";
import { closeSurface, getOpenSurfaces, subscribe } from "./app-shell/registry";
import { ErrorBoundary } from "./ErrorBoundary";
import { ComparePrices } from "./surfaces/ComparePrices";

/**
 * App — the app-wide React shell.
 *
 * It owns no surfaces of its own; it subscribes to the app-shell registry and
 * renders whichever surfaces are currently open. Opening a surface flips this
 * state and mounts its subtree; closing it renders null for that id, which
 * unmounts the subtree. There is NO per-surface `createRoot` — the single root
 * from boot.tsx is the only root, so this is the end-state mounting shape.
 *
 * Each surface component wraps itself in a <Panel> (owning its own title and
 * anchor); App just supplies the props it was opened with plus an `onClose`
 * bound to `closeSurface`, and isolates it in an <ErrorBoundary> so one surface
 * crashing cannot blank the single-root tree. Uses the automatic JSX runtime.
 */

// Every surface takes at least an onClose; individual surfaces widen this with
// their own opened-with props. `unknown`-widened so the registry can carry any
// surface's props.
type SurfaceComponent = ComponentType<{ onClose: () => void } & Record<string, unknown>>;

// The known surfaces, keyed by registry id. Grows one entry per migrated surface.
const SURFACE_COMPONENTS: Record<string, SurfaceComponent> = {
  "compare-prices": ComparePrices as SurfaceComponent
};

export function App() {
  const openSurfaces = useSyncExternalStore(subscribe, getOpenSurfaces, getOpenSurfaces);

  // Reap any surface opened under an id with no registered component (a typo, or
  // a surface wired through openSurface but not added to SURFACE_COMPONENTS).
  // Closing it here keeps the store from carrying a zombie entry that would
  // otherwise re-warn on every render.
  useEffect(() => {
    for (const { id } of openSurfaces) {
      if (!SURFACE_COMPONENTS[id]) {
        console.warn(`No React surface registered for id "${id}"; closing it`);
        closeSurface(id);
      }
    }
  }, [openSurfaces]);

  return (
    <>
      {openSurfaces.map(({ id, props, token }) => {
        const Surface = SURFACE_COMPONENTS[id];
        if (!Surface) return null;
        // Key by (id, token) so re-opening a surface remounts it fresh, resetting
        // its in-panel view state the way the legacy dialogs did on every open.
        return (
          <ErrorBoundary key={`${id}:${token}`} label={id}>
            <Surface {...props} onClose={() => closeSurface(id)} />
          </ErrorBoundary>
        );
      })}
    </>
  );
}
