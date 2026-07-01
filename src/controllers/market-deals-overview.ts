import { openSurface } from "@/ui/app-shell/registry";

/**
 * open — the preserved trigger seam for the Market Deals surface.
 *
 * The signature is unchanged from the legacy jQuery-UI version so the caller
 * (market-overview's "View deals" action) keeps working untouched. The body now
 * validates the market and dispatches into the App shell, which mounts the React
 * <MarketDeals> surface; the legacy HTML/`.dialog()` rendering is gone. All world
 * data is read inside the surface through the World-State accessor.
 */
export function open(marketId: number): void {
  const market = Markets.get(marketId);
  if (!market) {
    tip("Invalid market. The selected market does not exist", true, "error", 5000);
    return;
  }

  openSurface("market-deals", { marketId, anchor: "#marketsOverview" });
}
