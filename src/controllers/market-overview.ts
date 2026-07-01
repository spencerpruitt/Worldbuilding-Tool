import { openSurface } from "@/ui/app-shell/registry";
import type { Burg } from "../generators/burgs-generator";

/**
 * open — the preserved trigger seam for the Market Overview surface.
 *
 * The signature is unchanged from the legacy jQuery-UI version so the caller
 * (markets-overview) keeps working untouched. The body now just validates the
 * market and dispatches into the App shell, which mounts the React
 * <MarketOverview> surface; the legacy HTML/`.dialog()` rendering is gone. All
 * world data is read (and the market rename is performed) inside the surface
 * through the World-State accessor.
 */
export function open(marketId: number): void {
  if (customization) return;

  const market = Markets.get(marketId);
  if (!market) {
    tip("Invalid market. The selected market does not exist", true, "error", 5000);
    return;
  }

  // Match the legacy guard: a market whose center burg was removed is invalid and
  // must not open (its owner/name would otherwise be fabricated).
  const centerBurg = pack.burgs[market.centerBurgId] as Burg | undefined;
  if (!centerBurg || centerBurg.removed) {
    tip("Invalid market. The selected market has no center burg", true, "error", 5000);
    return;
  }

  openSurface("market-overview", { marketId, anchor: "#marketsOverview" });
}
