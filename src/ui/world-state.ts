import type { Good } from "@/generators/goods-generator";
import type { Market } from "@/generators/markets-generator";

/**
 * World-State accessor — the single typed, READ-ONLY wrapper over the `window.X`
 * bridge that React surfaces read world data through.
 *
 * Components must never touch raw `window.pack` / `Goods` / `Markets`; they call
 * these functions instead. That keeps the bridge dependency in one place, so
 * when a real store / reactivity model lands (Slice 7) only this module changes,
 * not the surfaces. Read-on-open snapshot semantics for now: no subscription,
 * no reactivity, and no mutation — reads only.
 *
 * The surface exposed here is exactly what Compare Prices reads. Reads are
 * guarded for an absent world (empty list / undefined) — the same defensive
 * shape the legacy overviews use (e.g. `pack.goods || []` in charts-overview) —
 * so a surface opened before a world is populated renders an empty state rather
 * than throwing during render and tearing down the shell.
 */

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
