import { useEffect, useSyncExternalStore } from "react";
import { closeSurface, getOpenSurfaces, getSurfaceComponent, subscribe } from "./app-shell/registry";
import { ErrorBoundary } from "./ErrorBoundary";
// Side-effect import: registers every surface (id → component) with the registry.
import "./surfaces";

/**
 * App — the app-wide React shell.
 *
 * It owns no surfaces of its own; it subscribes to the app-shell registry and
 * renders whichever surfaces are currently open, looking each component up by id
 * via `getSurfaceComponent`. Opening a surface flips this state and mounts its
 * subtree; closing it renders null for that id, which unmounts the subtree. There
 * is NO per-surface `createRoot` — the single root from boot.tsx is the only root,
 * so this is the end-state mounting shape.
 *
 * Each surface component wraps itself in a <Panel> (owning its own title and
 * anchor); App just supplies the props it was opened with plus an `onClose` bound
 * to `closeSurface`, and isolates it in an <ErrorBoundary> so one surface crashing
 * cannot blank the single-root tree. Uses the automatic JSX runtime.
 */
export function App() {
  const openSurfaces = useSyncExternalStore(subscribe, getOpenSurfaces, getOpenSurfaces);

  // Defensive backstop: `SurfaceId` makes a typo'd id a compile error and every id
  // is registered at boot, so this should never fire — but if a surface is somehow
  // open with no registered component, close it rather than leave a zombie entry
  // that would re-warn on every render.
  useEffect(() => {
    for (const { id } of openSurfaces) {
      if (!getSurfaceComponent(id)) {
        console.warn(`No React surface registered for id "${id}"; closing it`);
        closeSurface(id);
      }
    }
  }, [openSurfaces]);

  return (
    <>
      {openSurfaces.map(({ id, props, token }) => {
        const Surface = getSurfaceComponent(id);
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
