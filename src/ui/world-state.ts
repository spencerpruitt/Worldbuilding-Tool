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
 * The surface exposed here is exactly what Compare Prices reads.
 */

/** The full goods list (`pack.goods`). */
export function getGoods(): Good[] {
  return pack.goods;
}

/** The full markets list (`pack.markets`). */
export function getMarkets(): Market[] {
  return pack.markets;
}

/** A good by id, or undefined if none exists (`Goods.get`). */
export function getGood(id: number): Good | undefined {
  return Goods.get(id);
}

/** A market's display name (`Markets.getName`). */
export function getMarketName(market: Market): string {
  return Markets.getName(market);
}

/**
 * A market's stock/price entry for a good, or undefined if the market does not
 * stock it (`market.goods[good.i]`).
 */
export function getMarketGood(market: Market, good: Good): { stock: number; price: number } | undefined {
  return market.goods[good.i];
}

/** A market's swatch color (`market.color`). */
export function getMarketColor(market: Market): string {
  return market.color;
}
