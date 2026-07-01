import { openSurface } from "@/ui/app-shell/registry";
import type { TradeBatch } from "../renderers/trade-animation";

/**
 * open — the preserved trigger seam for the Trade Details surface.
 *
 * The signature is unchanged from the legacy jQuery-UI version so the caller
 * (the trade-animation renderer's batch click) keeps working untouched. The body
 * now validates the batch and dispatches into the App shell, which mounts the
 * React <TradeDetails> surface; the legacy HTML/`.dialog()` rendering is gone.
 * The surface resolves the route, aggregates the batch's deals, and owns the
 * route highlight for its lifetime (build-on-open / destroy-on-close).
 */
export function open(batch: TradeBatch): void {
  if (!batch?.deals.length) return;

  const startBurg = pack.burgs[batch.startBurgId];
  const endBurg = pack.burgs[batch.endBurgId];
  if (!startBurg || !endBurg) return;

  // Match the legacy guard: if no route can be found, open nothing at all (rather
  // than a fallback panel). The surface re-resolves the same path to render.
  const path = TradeAnimation.findRoutePath(startBurg.cell, endBurg.cell);
  if (!path) return;

  openSurface("trade-details", { batch, anchor: "svg" });
}
