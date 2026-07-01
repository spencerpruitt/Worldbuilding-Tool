import { type ComponentType, useSyncExternalStore } from "react";
import { closeSurface, getOpenSurfaces, subscribe } from "./app-shell/registry";
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
 * bound to `closeSurface`. Uses the automatic JSX runtime — no `import React`.
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

  return (
    <>
      {openSurfaces.map(({ id, props }) => {
        const Surface = SURFACE_COMPONENTS[id];
        if (!Surface) {
          // A surface was opened by an id with no registered component (a typo or
          // a surface not added to SURFACE_COMPONENTS). Warn so the trigger does
          // not silently do nothing, then skip it.
          console.warn(`No React surface registered for id "${id}"`);
          return null;
        }
        return <Surface key={id} {...props} onClose={() => closeSurface(id)} />;
      })}
    </>
  );
}
