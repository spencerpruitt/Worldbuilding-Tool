import { registerSurface, type SurfaceComponent } from "../app-shell/registry";
import { ComparePrices } from "./ComparePrices";
import { MarketDeals } from "./MarketDeals";
import { MarketOverview } from "./MarketOverview";
import { TradeDetails } from "./TradeDetails";

/**
 * Surface registration — the one place that binds each `SurfaceId` to its React
 * component. Importing this module (App does, for its side effect) registers them
 * all; adding a surface is a single `registerSurface` line here plus its id in the
 * `SurfaceId` union. Components are widened to `SurfaceComponent` because their
 * opened-with props arrive at runtime from `openSurface` and cannot be tied to the
 * id statically (the id is the compile-checked part).
 */
registerSurface("compare-prices", ComparePrices as SurfaceComponent);
registerSurface("market-overview", MarketOverview as unknown as SurfaceComponent);
registerSurface("market-deals", MarketDeals as unknown as SurfaceComponent);
registerSurface("trade-details", TradeDetails as unknown as SurfaceComponent);
