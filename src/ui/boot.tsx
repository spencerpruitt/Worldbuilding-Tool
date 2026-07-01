import { createRoot } from "react-dom/client";
import { App } from "./App";

/**
 * boot — mounts the single, app-wide React root.
 *
 * This is the ONLY `createRoot` call in the app: the end-state single-root
 * mounting shape adopted from slice one so nothing is ripped out at cutover.
 * It renders the Minimal shell <App/> into the `#react-root` node, guarding for
 * the node's existence so the legacy app is unaffected if the mount point is
 * ever absent (e.g. an alternate host document).
 *
 * After the render is queued it marks the mount node with `data-react-booted`.
 * The Minimal shell renders nothing, so this attribute is the only observable
 * signal that React actually booted — it lets the boot e2e distinguish "booted"
 * from "never booted" (an empty `#react-root` alone cannot).
 */
const container = document.getElementById("react-root");
if (container) {
  const root = createRoot(container);
  root.render(<App />);
  container.dataset.reactBooted = "true";
}
