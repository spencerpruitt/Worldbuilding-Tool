import { useMemo, useReducer, useState } from "react";
import { rn } from "@/utils/numberUtils";
import { formatPrice } from "@/utils/unitUtils";
import { csvField } from "../csv";
import { Panel } from "../Panel";
import { type SortDirection, SortHeader, sortableHeaderClass } from "../SortHeader";
import { useWorldVersion } from "../use-world-version";
import { getBurg, getGood, getGoodStroke, getMarket, getMarketDeals, getMarketName } from "../world-state";

interface MarketDealsProps {
  /** Registry-supplied id of the market whose deals to show (from the `open()` seam). */
  marketId: number;
  /** CSS selector the panel anchors near on open. */
  anchor?: string;
  onClose: () => void;
}

// Sort columns match the legacy header `data-sortby` values. good/direction/
// counterparty sort alphabetically; units/income sort numerically. The deals
// surface has no default-sorted column, so it starts unsorted (natural order).
type SortKey = "good" | "direction" | "counterparty" | "units" | "income";
type DealFilter = "all" | "local" | "global";

// One deal line: the good swatch, the in/out direction, the counterparty (a burg
// or another market, with its center-burg name + coords for zoom), the traded
// units/price, and the signed net income for this market. `hasGood` is false for a
// deal whose good was deleted (legacy rendered nothing for it but still counted it
// in the footer); `hasParty` is false when the counterparty burg cannot resolve
// (legacy did not zoom for it).
interface DealRow {
  id: number;
  hasGood: boolean;
  goodName: string;
  color: string;
  stroke: string;
  icon: string;
  direction: "in" | "out";
  counterpartyType: "burg" | "market";
  partyName: string;
  hasParty: boolean;
  partyX: number;
  partyY: number;
  units: number;
  price: number;
  net: number;
}

// The alphabetical sort key for a text column, matching the legacy `data-*`
// attributes `applySorting` sorted on (counterparty was `type_name`). Module-level
// so it is a stable reference across renders.
function sortText(row: DealRow, key: "good" | "direction" | "counterparty"): string {
  if (key === "good") return row.goodName;
  if (key === "direction") return row.direction;
  return `${row.counterpartyType}_${row.partyName}`;
}

/**
 * MarketDeals — the Market Deals surface for a single market, at parity with the
 * legacy jQuery-UI dialog.
 *
 * Presentational: it reads deals and world data through the World-State accessor
 * (never raw `window.pack`), re-reads on any world change via `useWorldVersion`,
 * and performs side-effects — zoom-to-party, CSV download — through the existing
 * window globals. Remounted per open (App keys it by the registry token), so the
 * filter/sort view state resets each open the way the legacy dialog did.
 */
export function MarketDeals({ marketId, anchor, onClose }: MarketDealsProps) {
  const [refreshCount, refresh] = useReducer(count => count + 1, 0);
  const worldVersion = useWorldVersion();

  const [filter, setFilter] = useState<DealFilter>("all");
  // No column is sorted until the user clicks a header (legacy parity — the deals
  // header ships no default `icon-sort` indicator).
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("down");

  const market = getMarket(marketId);

  // Build one row per deal (world order, unfiltered). Every deal gets a row —
  // even one whose good was deleted — so the footer count/net match the legacy
  // controller, which counted such deals though it rendered no line for them.
  // refreshCount and worldVersion are deliberate cache-busters.
  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshCount and worldVersion intentionally re-read the accessor.
  const rows = useMemo(() => {
    if (!market) return [] as DealRow[];
    return getMarketDeals(marketId).map(deal => {
      const good = getGood(deal.good);
      const isMarketSeller = deal.sellerType === "market" && deal.seller === marketId;
      const counterpartyId = isMarketSeller ? deal.buyer : deal.seller;
      const counterpartyType = isMarketSeller ? deal.buyerType : deal.sellerType;
      const partyBurgId = counterpartyType === "burg" ? counterpartyId : getMarket(counterpartyId)?.centerBurgId;
      const party = partyBurgId ? getBurg(partyBurgId) : undefined;
      return {
        id: deal.i,
        hasGood: Boolean(good),
        goodName: good?.name ?? "",
        color: good?.color ?? "",
        stroke: good ? getGoodStroke(good.color) : "",
        icon: good?.icon ?? "",
        direction: isMarketSeller ? "out" : "in",
        counterpartyType,
        partyName: party?.name ?? "",
        hasParty: Boolean(party),
        partyX: party?.x ?? 0,
        partyY: party?.y ?? 0,
        units: rn(deal.units, 2),
        price: rn(deal.price, 2),
        net: rn(deal.units * deal.price * (isMarketSeller ? 1 : -1), 2)
      } satisfies DealRow;
    });
  }, [market, marketId, refreshCount, worldVersion]);

  // Local = deals with a burg counterparty; global = deals with another market.
  const filteredRows = useMemo(() => {
    if (filter === "all") return rows;
    const wantedType = filter === "local" ? "burg" : "market";
    return rows.filter(row => row.counterpartyType === wantedType);
  }, [rows, filter]);

  const sortedRows = useMemo(() => {
    if (!sortKey) return filteredRows;
    const direction = sortDirection === "down" ? -1 : 1;
    return [...filteredRows].sort((first, second) => {
      if (sortKey === "units" || sortKey === "income") {
        const value = sortKey === "units" ? first.units - second.units : first.net - second.net;
        return value * direction;
      }
      const firstKey = sortText(first, sortKey);
      const secondKey = sortText(second, sortKey);
      return firstKey.localeCompare(secondKey) * direction;
    });
  }, [filteredRows, sortKey, sortDirection]);

  // Footer count/net cover all filtered deals (good-less included, legacy parity);
  // the table renders only deals with a resolvable good (legacy rendered no line
  // for a good-less deal).
  const dealCount = filteredRows.length;
  const netFlow = filteredRows.reduce((sum, row) => sum + row.net, 0);
  const renderedRows = sortedRows.filter(row => row.hasGood);

  function handleSort(key: SortKey): void {
    if (key === sortKey) {
      setSortDirection(current => (current === "down" ? "up" : "down"));
      return;
    }
    setSortKey(key);
    const alphabetical = key === "good" || key === "direction" || key === "counterparty";
    setSortDirection(alphabetical ? "up" : "down");
  }

  function headerClassName(key: SortKey): string {
    const alphabetical = key === "good" || key === "direction" || key === "counterparty";
    return sortableHeaderClass(key === sortKey, alphabetical, sortDirection);
  }

  // Zoom to the counterparty — but only when its burg resolved, matching the legacy
  // `if (party)` guard (an unresolved party must not yank the map to (0,0)).
  function handleZoom(row: DealRow): void {
    if (row.hasParty) zoomTo(row.partyX, row.partyY, 8, 2000);
  }

  // CSV covers ALL of this market's deals (unfiltered) with a good, in world order,
  // matching the legacy downloadDealsCsv columns Id,Good,Type,Client,Units,Price,Net.
  // Built from the same `rows` the table derives, so the two never disagree.
  function handleExport(): void {
    const header = "Id,Good,Type,Client,Units,Price,Net";
    const lines = rows
      .filter(row => row.hasGood)
      .map(row =>
        [
          String(row.id),
          csvField(row.goodName),
          row.direction,
          csvField(row.partyName),
          String(row.units),
          String(row.price),
          String(row.net)
        ].join(",")
      );
    const csv = `${[header, ...lines].join("\n")}\n`;
    downloadFile(csv, `${getFileName(`Market_${marketId}_Deals`)}.csv`);
  }

  const title = market ? `${getMarketName(market)} Market Deals` : "Market Deals";

  if (!market) {
    return (
      <Panel title={title} anchor={anchor} onClose={onClose}>
        <div>This market no longer exists.</div>
      </Panel>
    );
  }

  return (
    <Panel title={title} anchor={anchor} onClose={onClose}>
      <div className="header" style={{ gridTemplateColumns: "2em 6.8em 4em 10em 4em 4em" }}>
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
          label="Type"
          sortKey="direction"
          className={headerClassName("direction")}
          dataTip="Click to sort by deal type"
          onSort={handleSort}
        />
        <SortHeader
          label="Counterparty"
          sortKey="counterparty"
          className={headerClassName("counterparty")}
          dataTip="Click to sort by counterparty"
          onSort={handleSort}
        />
        <SortHeader
          label="Units"
          sortKey="units"
          className={headerClassName("units")}
          dataTip="Click to sort by units"
          onSort={handleSort}
        />
        <SortHeader
          label="Income"
          sortKey="income"
          className={headerClassName("income")}
          dataTip="Click to sort by income"
          onSort={handleSort}
        />
      </div>
      <div className="table" style={{ maxHeight: "30em" }}>
        {renderedRows.length > 0 ? (
          renderedRows.map(row => {
            const incomeColor = row.net >= 0 ? "#2a6" : "#c44";
            const backColor = row.net >= 0 ? "#dff0d8" : "#f2dede";
            return (
              <div
                key={row.id}
                className="states marketDeal"
                data-id={row.id}
                data-good={row.goodName}
                data-direction={row.direction}
                data-units={row.units}
                data-counterparty={`${row.counterpartyType}_${row.partyName}`}
                data-income={row.net}
              >
                <svg
                  data-tip="Good icon"
                  width="1.3em"
                  height="1.3em"
                  className="goodIcon"
                  role="img"
                  aria-label={row.goodName}
                >
                  <title>{row.goodName}</title>
                  <circle cx="50%" cy="50%" r="42%" fill={row.color} stroke={row.stroke} />
                  <use href={`#${row.icon}`} x="10%" y="10%" width="80%" height="80%" />
                </svg>
                <div data-tip="Good name" className="goodName">
                  {row.goodName}
                </div>
                <div>
                  <span className="marketBadge" style={{ background: backColor, color: incomeColor }}>
                    {row.direction.toUpperCase()}
                  </span>
                </div>
                <button
                  type="button"
                  className="marketDealParty pointer"
                  data-tip="Click to zoom"
                  onClick={() => handleZoom(row)}
                >
                  <div
                    className={row.counterpartyType === "burg" ? "icon-dot-circled" : "icon-store"}
                    style={{
                      display: "inline-block",
                      width: "0.8em",
                      ...(row.counterpartyType === "market" ? { fontSize: "0.85em" } : {})
                    }}
                  />
                  <div style={{ display: "inline-block", width: "6.8em" }}>{row.partyName}</div>
                </button>
                <div className="marketDealUnits">{row.units}</div>
                <div className="marketDealIncome" style={{ color: incomeColor }}>
                  {formatPrice(row.net)}
                </div>
              </div>
            );
          })
        ) : (
          <div>No market deals recorded</div>
        )}
      </div>
      <div className="totalLine">
        <div style={{ marginLeft: "5px" }} data-tip="Deals count">
          Deals: {dealCount}
        </div>
        <div style={{ marginLeft: "12px" }} data-tip="Net flow for this market">
          Net Flow: {formatPrice(rn(netFlow, 2))}
        </div>
      </div>
      <div>
        <button
          type="button"
          className="icon-cw"
          data-tip="Refresh the Deals screen"
          aria-label="Refresh"
          onClick={refresh}
        />
        <button
          type="button"
          className="icon-download"
          data-tip="Save market deals data as a text file (.csv)"
          aria-label="Export as CSV"
          onClick={handleExport}
        />
        <select
          data-tip="Filter deals by scope"
          aria-label="Filter deals by scope"
          style={{ marginLeft: "8px" }}
          value={filter}
          onChange={event => setFilter(event.target.value as DealFilter)}
        >
          <option value="all">All</option>
          <option value="local">Local</option>
          <option value="global">Global</option>
        </select>
      </div>
    </Panel>
  );
}
