import type { Burg } from "@/generators/burgs-generator";
import type { Good } from "@/generators/goods-generator";
import type { Market } from "@/generators/markets-generator";
import type { State } from "@/generators/states-generator";

/**
 * World-State accessor — the single typed wrapper over the `window.X` bridge that
 * React surfaces read world data through, plus the world-change signal they react to.
 *
 * Components must never touch raw `window.pack` / `Goods` / `Markets`; they call
 * these functions instead. That keeps the bridge dependency in one place, so when
 * a real store lands only this module changes, not the surfaces.
 *
 * Reads are still plain reads off the bridge (guarded for an absent world —
 * `[]`/`undefined` — the same defensive shape the legacy overviews use, so a
 * surface opened before a world is populated renders an empty state instead of
 * throwing during render and tearing down the shell). What changed in Slice 7 is
 * reactivity: instead of read-on-open snapshots, surfaces subscribe to a single
 * global world VERSION and re-read through these same getters whenever it bumps.
 *
 * The version is a monotonic counter, not a copy of the data. `notifyWorldChanged`
 * bumps it after any economy mutation (a converted surface's own edit, or a legacy
 * editor call site retrofitted to signal); `subscribeWorld` + `getWorldVersion`
 * are shaped for React's `useSyncExternalStore` (see `use-world-version.ts`). This
 * is the seam a real per-entity store would slot behind later: only this module
 * and the mutation call sites would change, never the surfaces. See ADR-0004.
 */

let worldVersion = 0;
const worldListeners = new Set<() => void>();

/**
 * Signal that world data changed so subscribed surfaces re-read. A single global
 * counter (not per-entity) is deliberate at this scale — see ADR-0004.
 */
export function notifyWorldChanged(): void {
  worldVersion += 1;
  for (const listener of worldListeners) listener();
}

/**
 * Subscribe to world-change signals. Returns an unsubscribe function. Shaped for
 * `useSyncExternalStore`'s `subscribe` argument.
 */
export function subscribeWorld(listener: () => void): () => void {
  worldListeners.add(listener);
  return () => {
    worldListeners.delete(listener);
  };
}

/**
 * The current world version — a stable snapshot between changes, which
 * `useSyncExternalStore` relies on to avoid re-render loops. It is an opaque
 * change token: only its equality across renders is meaningful, not its value.
 */
export function getWorldVersion(): number {
  return worldVersion;
}

/** The full goods list (`pack.goods`), or an empty list if no world is loaded. */
export function getGoods(): Good[] {
  return pack?.goods ?? [];
}

/** The full goods list sorted alphabetically by name (the canonical goods order). */
export function getGoodsSortedByName(): Good[] {
  return [...getGoods()].sort((first, second) => first.name.localeCompare(second.name));
}

/** The full markets list (`pack.markets`), or an empty list if no world is loaded. */
export function getMarkets(): Market[] {
  return pack?.markets ?? [];
}

/** A good by id, or undefined if none exists (`Goods.get`). */
export function getGood(id: number): Good | undefined {
  return Goods?.get(id);
}

/** A market's display name (`Markets.getName`). */
export function getMarketName(market: Market): string {
  return Markets ? Markets.getName(market) : "";
}

/**
 * A market's stock/price entry for a good, or undefined if the market does not
 * stock it (`market.goods[good.i]`).
 */
export function getMarketGood(market: Market, good: Good): { stock: number; price: number } | undefined {
  return market.goods?.[good.i];
}

/** A market's swatch color (`market.color`). */
export function getMarketColor(market: Market): string {
  return market.color;
}

/** A market by id, or undefined if none exists (`Markets.get`). */
export function getMarket(id: number): Market | undefined {
  return Markets?.get(id);
}

/** A good swatch's stroke color for a fill color (`Goods.getStroke`). */
export function getGoodStroke(color: string): string {
  return Goods ? Goods.getStroke(color) : "";
}

/** A market's center burg (`pack.burgs[market.centerBurgId]`), or undefined. */
export function getMarketCenterBurg(market: Market): Burg | undefined {
  return pack?.burgs?.[market.centerBurgId];
}

/**
 * A market's default (unnamed) label — its center burg's name, or `Market {i}`
 * when the burg is missing. This is the placeholder shown when no custom name is
 * set; the effective display name is `getMarketName`.
 */
export function getMarketDefaultName(market: Market): string {
  return pack?.burgs?.[market.centerBurgId]?.name || `Market ${market.i}`;
}

/** How many cells belong to a market (`pack.cells.market`). */
export function getMarketCellCount(market: Market): number {
  const cellMarkets = pack?.cells?.market;
  if (!cellMarkets) return 0;
  let count = 0;
  for (const marketId of cellMarkets) {
    if (marketId === market.i) count += 1;
  }
  return count;
}

/** How many non-removed burgs belong to a market (`pack.burgs`). */
export function getMarketBurgCount(market: Market): number {
  const burgs = pack?.burgs;
  if (!burgs) return 0;
  // Count in place rather than filter().length so a large-world recompute
  // allocates no throwaway array (matches getMarketCellCount above).
  let count = 0;
  for (const burg of burgs) {
    if (burg && !burg.removed && burg.market === market.i) count += 1;
  }
  return count;
}

/**
 * The state that owns a market, resolved through the market's center burg
 * (`pack.states[centerBurg.state]`). Falls back to the neutral state (0), matching
 * the legacy overview.
 */
export function getMarketOwnerState(market: Market): State | undefined {
  const centerBurg = pack?.burgs?.[market.centerBurgId];
  return pack?.states?.[centerBurg?.state ?? 0];
}

/** The price a customer pays to buy from a market (`Markets.customerBuyPrice`). */
export function getCustomerBuyPrice(price: number): number {
  return Markets ? Markets.customerBuyPrice(price) : price;
}

/** The price a customer receives selling to a market (`Markets.customerSellPrice`). */
export function getCustomerSellPrice(price: number): number {
  return Markets ? Markets.customerSellPrice(price) : price;
}

/**
 * Rename a market (or reset to the default when the name is blank). This is the
 * one mutation the accessor exposes so far — it lives here, with the reads, so
 * surfaces never touch `market.name` directly.
 *
 * It deliberately does NOT call `notifyWorldChanged`: renaming is metadata that
 * does not change any surface's rows/cells/burgs, and the input fires per
 * keystroke, so a global bump here would re-scan and re-render every open surface
 * on every character (a perf regression the legacy rename — which only retitled —
 * never had). The renaming surface re-renders from its own input state; other
 * surfaces pick up the new name on their next read/Refresh, matching the legacy
 * dialogs, which never cross-updated live either.
 */
export function renameMarket(market: Market, name: string): void {
  market.name = name.trim() || undefined;
}
