import { openSurface } from "@/ui/app-shell/registry";

/**
 * open — the preserved trigger seam for the Compare Prices surface.
 *
 * The signature is unchanged from the legacy jQuery-UI version so both callers
 * (goods-editor, markets-overview) keep working untouched. The body now just
 * dispatches into the App shell, which mounts the React <ComparePrices> surface;
 * the legacy HTML/`.dialog()` rendering is gone. World data is read inside the
 * surface through the World-State accessor.
 */
export function open(goodId?: number, anchor = "#marketsOverview"): void {
  openSurface("compare-prices", { goodId, anchor });
}
