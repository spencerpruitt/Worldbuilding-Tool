import { useEffect, useMemo, useState } from "react";
import { clearHighlight, highlight } from "@/renderers/draw-trade-animation";
import type { TradeBatch } from "@/renderers/trade-animation";
import { rn } from "@/utils/numberUtils";
import { formatPrice } from "@/utils/unitUtils";
import { Panel } from "../Panel";
import { type SortDirection, SortHeader, sortableHeaderClass } from "../SortHeader";
import { useWorldVersion } from "../use-world-version";
import { getBurg, getGood, getGoodStroke } from "../world-state";

interface TradeDetailsProps {
  /** The trade batch to detail (from the `open()` seam; carried as opaque props). */
  batch: TradeBatch;
  /** CSS selector the panel anchors near on open. */
  anchor?: string;
  onClose: () => void;
}

// Sort columns match the legacy header `data-sortby` values. good sorts
// alphabetically; units/price/value sort numerically. Default is units-descending
// (the header ships `icon-sort-number-down` on Units).
type SortKey = "good" | "units" | "price" | "value";

// One rendered line: a good aggregated across every deal in the batch — total
// units, average unit price (value / units), and total value.
interface TradeRow {
  goodId: number;
  name: string;
  color: string;
  stroke: string;
  icon: string;
  units: number;
  price: number;
  value: number;
}

/**
 * TradeDetails — the Trade surface for a single trade batch (a start→end burg
 * route), at parity with the legacy jQuery-UI dialog.
 *
 * Presentational: it reads goods/burgs through the World-State accessor and the
 * route path through the `TradeAnimation` global, aggregates the batch's deals by
 * good, and computes the route distance. While it is open it highlights the route
 * on the map (a renderer side-effect run in an effect, torn down on unmount — the
 * build-on-open / destroy-on-close shape). Clicking a summary end zooms to that
 * burg. Remounted per open (App keys it by the registry token).
 */
export function TradeDetails({ batch, anchor, onClose }: TradeDetailsProps) {
  const worldVersion = useWorldVersion();

  const [sortKey, setSortKey] = useState<SortKey>("units");
  const [sortDirection, setSortDirection] = useState<SortDirection>("down");

  const startBurg = getBurg(batch.startBurgId);
  const endBurg = getBurg(batch.endBurgId);

  // The route path between the two burgs, via the trade-animation renderer. It is
  // resolved once for this batch and NOT re-run on world-version bumps: the route
  // (geography/roads) does not change on economy edits, and findRoutePath is a full
  // Dijkstra whose fresh result would otherwise re-fire the highlight effect and
  // flicker the on-map route on every unrelated edit (legacy computed it once).
  const path = useMemo(() => {
    if (!startBurg || !endBurg || typeof TradeAnimation === "undefined") return null;
    return TradeAnimation.findRoutePath(startBurg.cell, endBurg.cell);
  }, [startBurg, endBurg]);

  // Highlight the route on the map while this surface is open; clear it on unmount
  // or when the route changes — matching the legacy highlight()/clearHighlight().
  useEffect(() => {
    if (path) highlight(path.points);
    return () => clearHighlight();
  }, [path]);

  // Aggregate the batch's deals by good (total units + total value).
  // biome-ignore lint/correctness/useExhaustiveDependencies: worldVersion intentionally re-reads the accessor.
  const { rows, totalUnits, totalValue } = useMemo(() => {
    const combined = new Map<number, { units: number; value: number }>();
    let unitsSum = 0;
    let valueSum = 0;
    for (const deal of batch.deals) {
      const entry = combined.get(deal.good) ?? { units: 0, value: 0 };
      entry.units += deal.units;
      entry.value += deal.units * deal.price;
      combined.set(deal.good, entry);
      unitsSum += deal.units;
      valueSum += deal.units * deal.price;
    }
    const tradeRows: TradeRow[] = [];
    for (const [goodId, { units, value }] of combined) {
      const good = getGood(goodId);
      if (!good) continue;
      tradeRows.push({
        goodId,
        name: good.name,
        color: good.color,
        stroke: getGoodStroke(good.color),
        icon: good.icon,
        units: rn(units, 2),
        price: rn(units ? value / units : 0, 2),
        value: rn(value, 2)
      });
    }
    return { rows: tradeRows, totalUnits: unitsSum, totalValue: valueSum };
  }, [batch, worldVersion]);

  const sortedRows = useMemo(() => {
    const direction = sortDirection === "down" ? -1 : 1;
    return [...rows].sort((first, second) => {
      if (sortKey === "good") return first.name.localeCompare(second.name) * direction;
      return (first[sortKey] - second[sortKey]) * direction;
    });
  }, [rows, sortKey, sortDirection]);

  // Route length in map units → display distance (× distanceScale). The raw length
  // is rounded to 2 decimals BEFORE scaling, matching the legacy `rn(rn(len,2) * scale)`.
  const distance = useMemo(() => {
    if (!path) return 0;
    const length = path.points.reduce((sum, point, index) => {
      if (index === 0) return 0;
      const previous = path.points[index - 1];
      return sum + Math.hypot(point[0] - previous[0], point[1] - previous[1]);
    }, 0);
    return rn(rn(length, 2) * distanceScale);
  }, [path]);

  function handleSort(key: SortKey): void {
    if (key === sortKey) {
      setSortDirection(current => (current === "down" ? "up" : "down"));
      return;
    }
    setSortKey(key);
    setSortDirection(key === "good" ? "up" : "down");
  }

  function headerClassName(key: SortKey): string {
    return sortableHeaderClass(key === sortKey, key === "good", sortDirection);
  }

  function handleZoom(end: "start" | "end"): void {
    const burg = end === "start" ? startBurg : endBurg;
    if (burg) zoomTo(burg.x, burg.y, 8, 1500);
  }

  const title = startBurg && endBurg ? `Trade: ${startBurg.name} to ${endBurg.name}` : "Trade";

  if (!batch?.deals?.length || !startBurg || !endBurg || !path) {
    return (
      <Panel title={title} anchor={anchor} onClose={onClose}>
        <div>This trade route is no longer available.</div>
      </Panel>
    );
  }

  // The counterparty label for an end: "market" when that side is a market,
  // otherwise the burg's group ("burg" by default) — matching legacy getClientType.
  const firstDeal = batch.deals[0];
  const sellerType = firstDeal.sellerType === "market" ? "market" : startBurg.group || "burg";
  const buyerType = firstDeal.buyerType === "market" ? "market" : endBurg.group || "burg";

  return (
    <Panel title={title} anchor={anchor} onClose={onClose}>
      <div className="totalLine">
        <span>
          <b>Seller</b>: {startBurg.name} {sellerType}{" "}
          <button
            type="button"
            className="icon-dot-circled pointer"
            data-tip="Zoom to start"
            aria-label="Zoom to seller"
            onClick={() => handleZoom("start")}
          />
        </span>
        <span style={{ marginLeft: "5px" }}>
          <b>Buyer</b>: {endBurg.name} {buyerType}{" "}
          <button
            type="button"
            className="icon-dot-circled pointer"
            data-tip="Zoom to end"
            aria-label="Zoom to buyer"
            onClick={() => handleZoom("end")}
          />
        </span>
      </div>
      <div className="header" style={{ gridTemplateColumns: "2.5em 10em 5em 5.5em 3.6em" }}>
        <div />
        <SortHeader
          label="Good"
          sortKey="good"
          className={headerClassName("good")}
          dataTip="Click to sort by good"
          onSort={handleSort}
          style={{ marginLeft: 0 }}
        />
        <SortHeader
          label="Units"
          sortKey="units"
          className={headerClassName("units")}
          dataTip="Click to sort by units"
          onSort={handleSort}
        />
        <SortHeader
          label="Price"
          sortKey="price"
          className={headerClassName("price")}
          dataTip="Click to sort by unit price"
          onSort={handleSort}
        />
        <SortHeader
          label="Value"
          sortKey="value"
          className={headerClassName("value")}
          dataTip="Click to sort by value"
          onSort={handleSort}
        />
      </div>
      <div className="table" style={{ maxHeight: "30em" }}>
        {sortedRows.map(row => (
          <div
            key={row.goodId}
            className="states tradeDeal"
            data-good={row.name}
            data-units={row.units}
            data-price={row.price}
            data-value={row.value}
          >
            <svg data-tip="Good icon" width="2em" height="2em" className="goodIcon" role="img" aria-label={row.name}>
              <title>{row.name}</title>
              <circle cx="50%" cy="50%" r="42%" fill={row.color} stroke={row.stroke} />
              <use href={`#${row.icon}`} x="10%" y="10%" width="80%" height="80%" />
            </svg>
            <div data-tip="Good name" className="goodName">
              {row.name}
            </div>
            <div className="goodUnits">{row.units}</div>
            <div className="goodPrice">{formatPrice(row.price)}</div>
            <div className="goodValue">{formatPrice(row.value)}</div>
          </div>
        ))}
      </div>
      <div className="totalLine">
        <div style={{ marginLeft: "5px" }}>
          Distance: {distance} {distanceUnitInput.value}
        </div>
        <div style={{ marginLeft: "12px" }} data-tip="Total traded units">
          Units: {rn(totalUnits, 2)}
        </div>
        <div style={{ marginLeft: "12px" }} data-tip="Total deal value">
          Value: {formatPrice(totalValue)}
        </div>
      </div>
    </Panel>
  );
}
