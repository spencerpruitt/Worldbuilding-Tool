import { useEffect, useMemo, useReducer, useState } from "react";
import { rn } from "@/utils/numberUtils";
import { formatPrice } from "@/utils/unitUtils";
import { Panel } from "../Panel";
import { useWorldVersion } from "../use-world-version";
import {
  getGood,
  getGoodsSortedByName,
  getMarketColor,
  getMarketGood,
  getMarketName,
  getMarkets
} from "../world-state";

// Register the `fill-box` custom element (public/components/fill-box.js) as an
// intrinsic JSX tag so the color swatch renders exactly as the legacy markup did.
declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "fill-box": { fill?: string };
    }
  }
}

interface ComparePricesProps {
  /** Registry-supplied id of the good to compare (from the `open()` seam). */
  goodId?: number;
  /** CSS selector the panel anchors near on open. */
  anchor?: string;
  onClose: () => void;
}

// Which column the table is sorted by, and its direction. Market sorts by name
// (alphabetically), Stock/Price sort numerically — matching the legacy header
// `data-sortby` values and the `applySorting` name/number split.
type SortKey = "market" | "stock" | "price";
type SortDirection = "up" | "down";

// One rendered market line: the swatch color, display name, and the selected
// good's rounded stock/price (rounded the same way the legacy `addLines` did).
interface MarketRow {
  id: number;
  name: string;
  color: string;
  stock: number;
  price: number;
}

/**
 * Quote a CSV field per RFC 4180: wrap in double quotes (doubling any embedded
 * quote) only when it contains a comma, quote, or newline. Fields without those
 * characters — market names, numbers, plain good names — pass through unchanged,
 * so normal exports stay byte-identical to the legacy output while a market name
 * with a comma no longer corrupts the row.
 */
function csvField(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

interface SortHeaderProps {
  label: string;
  sortKey: SortKey;
  className: string;
  dataTip: string;
  onSort: (key: SortKey) => void;
  style?: React.CSSProperties;
}

/**
 * A clickable, keyboard-operable column header. Rendered as a `<div>` (not a
 * `<button>`) so it keeps the legacy grid-cell look while carrying the legacy
 * `data-sortby` marker, `data-tip` tooltip, and `sortable`/`icon-sort-*` classes.
 */
function SortHeader({ label, sortKey, className, dataTip, onSort, style }: SortHeaderProps) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: must stay a grid-cell <div> so the legacy `.header` CSS grid lays it out; keyboard handlers below give it button semantics.
    <div
      role="button"
      tabIndex={0}
      className={className}
      data-sortby={sortKey}
      data-tip={dataTip}
      style={style}
      onClick={() => onSort(sortKey)}
      onKeyDown={event => {
        if (event.key === "Enter" || event.key === " ") onSort(sortKey);
      }}
    >
      {label}&nbsp;
    </div>
  );
}

// The last good the user viewed, persisted across opens at module scope —
// mirroring the legacy module-level `activeGoodId`, which survived dialog
// close/reopen. Reopening without an explicit good returns to this one. A stale
// id from a previous world is harmless: resolveInitialGoodId re-validates it.
let lastGoodId = -1;

/** Reset the persisted good selection. Exists so tests can isolate this module. */
export function resetPersistedGood(): void {
  lastGoodId = -1;
}

/**
 * Resolve which good to select on open. An explicit `goodId` (the goods editor
 * passes one) wins; otherwise return to the last-viewed good (the markets
 * overview passes none, and the legacy dialog remembered the selection); failing
 * both, fall back to the first good sorted by name. Only ever returns a valid id
 * (or -1 when there are no goods).
 */
function resolveInitialGoodId(goodId: number | undefined): number {
  if (goodId !== undefined && goodId >= 0 && getGood(goodId)) return goodId;
  if (getGood(lastGoodId)) return lastGoodId;
  return getGoodsSortedByName()[0]?.i ?? -1;
}

/**
 * ComparePrices — the Compare Prices surface, at full parity with the legacy
 * jQuery-UI dialog.
 *
 * Presentational: it reads all world data through the World-State accessor
 * (never raw `window.pack`) and performs side-effects (CSV download, filename)
 * via the existing window globals, exactly as the legacy controller did. It owns
 * the table's local view state — selected good, sort column/direction, and the
 * absolute/percentage stock mode — as React state rather than DOM mutation.
 *
 * The surface is remounted on every open (App keys it by the registry token), so
 * the transient view state (sort, percentage) resets per open the way the legacy
 * dialog did; the selected good instead persists across opens via `lastGoodId`,
 * matching the legacy `activeGoodId`. The selection is reconciled against the
 * live goods list on every render, so a good deleted between Refreshes falls
 * back to the first good instead of blanking the table.
 */
export function ComparePrices({ goodId, anchor, onClose }: ComparePricesProps) {
  // Bumping this forces a local re-read of world data (Refresh button) by
  // invalidating the memoized rows below. Refresh is a local re-read: it does not
  // broadcast a world change, since nothing actually changed.
  const [refreshCount, refresh] = useReducer(count => count + 1, 0);

  // Subscribe to the global world-change signal so an edit elsewhere (a converted
  // surface or a retrofitted legacy editor) re-reads this table automatically,
  // without the user pressing Refresh. The value is an opaque memo dependency.
  const worldVersion = useWorldVersion();

  // Memoized so an unrelated world change that re-renders this surface does not
  // re-sort the goods list; only a Refresh or a real world change re-reads it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshCount and worldVersion are intentional cache-busters for the accessor read.
  const sortedGoods = useMemo(() => getGoodsSortedByName(), [refreshCount, worldVersion]);

  const [selectedGoodId, setSelectedGoodId] = useState(() => resolveInitialGoodId(goodId));
  const [sortKey, setSortKey] = useState<SortKey>("stock");
  const [sortDirection, setSortDirection] = useState<SortDirection>("down");
  const [showPercentage, setShowPercentage] = useState(false);

  // Persist the current selection so a later reopen returns to it (legacy parity).
  useEffect(() => {
    if (selectedGoodId >= 0) lastGoodId = selectedGoodId;
  }, [selectedGoodId]);

  // Reconcile the selection against the live goods list: if the id does not
  // resolve to a good (the good was deleted before a Refresh), fall back to the
  // first good — the legacy `rebuildGoodSelect` guard.
  const selectedGood = getGood(selectedGoodId) ?? sortedGoods[0];

  // The per-market pass is the expensive work (name/good lookups + reductions
  // across every market); memoize it so sort-direction and percentage toggles —
  // which do not change this data — don't redo it on a large world.
  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshCount and worldVersion are deliberate cache-busters — the body reads mutable world globals via getMarkets(), so Refresh and any world change must invalidate this memo.
  const { rows, totalStock, averagePrice } = useMemo(() => {
    if (!selectedGood) return { rows: [] as MarketRow[], totalStock: 0, averagePrice: 0 };
    const computedRows: MarketRow[] = getMarkets().map(market => {
      const marketGood = getMarketGood(market, selectedGood);
      return {
        id: market.i,
        name: getMarketName(market),
        color: getMarketColor(market),
        stock: rn(marketGood?.stock ?? 0, 2),
        price: rn(marketGood?.price ?? 0, 2)
      };
    });
    const stockTotal = computedRows.reduce((sum, row) => sum + row.stock, 0);
    const priceSum = computedRows.reduce((sum, row) => sum + row.price, 0);
    const avgPrice = computedRows.length > 0 ? rn(priceSum / computedRows.length, 2) : 0;
    return { rows: computedRows, totalStock: stockTotal, averagePrice: avgPrice };
    // refreshCount (local Refresh) and worldVersion (external change) both re-read the world.
  }, [selectedGood, refreshCount, worldVersion]);

  const sortedRows = useMemo(() => {
    const direction = sortDirection === "down" ? -1 : 1;
    return [...rows].sort((first, second) => {
      if (sortKey === "market") return first.name.localeCompare(second.name) * direction;
      return (first[sortKey] - second[sortKey]) * direction;
    });
  }, [rows, sortKey, sortDirection]);

  function handleGoodChange(event: React.ChangeEvent<HTMLSelectElement>): void {
    setSelectedGoodId(Number(event.target.value));
    setShowPercentage(false);
  }

  function handleRefresh(): void {
    setShowPercentage(false);
    refresh();
  }

  // Clicking a header sorts by its column. Re-clicking the active column flips
  // direction; a fresh column starts ascending for names and descending for
  // numbers — matching the legacy `sortLines` toggle.
  function handleSort(key: SortKey): void {
    if (key === sortKey) {
      setSortDirection(current => (current === "down" ? "up" : "down"));
      return;
    }
    setSortKey(key);
    setSortDirection(key === "market" ? "up" : "down");
  }

  // CSV is built from world order (the `rows` array, not the sorted view), with
  // each field escaped, then handed to the window download globals — same output
  // as the legacy `downloadCsv` for names without special characters.
  function handleExport(): void {
    const goodName = selectedGood?.name ?? "Unknown";
    const header = [csvField("Market"), csvField(`Stock (${goodName})`), csvField(`Price (${goodName})`)].join(",");
    const lines = rows.map(row => [csvField(row.name), String(row.stock), String(row.price)].join(","));
    const csv = `${[header, ...lines].join("\n")}\n`;
    downloadFile(csv, `${getFileName(`Compare_Prices_${goodName}`)}.csv`);
  }

  function headerClassName(key: SortKey): string {
    const base = key === "market" ? "sortable alphabetically" : "sortable";
    if (key !== sortKey) return base;
    const type = key === "market" ? "name" : "number";
    return `${base} icon-sort-${type}-${sortDirection}`;
  }

  function stockCellText(stock: number): string {
    if (!showPercentage) return String(stock);
    return totalStock ? `${rn((stock / totalStock) * 100, 2)}%` : "0%";
  }

  return (
    <Panel title="Compare Prices" anchor={anchor} onClose={onClose}>
      <div style={{ display: "flex", alignItems: "center", gap: ".5em", padding: ".2em 0 .4em", fontSize: ".9em" }}>
        <label htmlFor="comparePricesSelect" data-tip="Select good to compare stock across markets">
          Good:
        </label>
        <select
          id="comparePricesSelect"
          style={{ flex: 1, minWidth: "8em" }}
          value={selectedGood?.i ?? ""}
          onChange={handleGoodChange}
        >
          {sortedGoods.map(good => (
            <option key={good.i} value={good.i}>
              {good.name}
            </option>
          ))}
        </select>
      </div>
      <div className="header" style={{ gridTemplateColumns: "1.6em 9em 6em 7em" }}>
        <div />
        <SortHeader
          label="Market"
          sortKey="market"
          className={headerClassName("market")}
          dataTip="Market center burg name. Click to sort"
          onSort={handleSort}
          style={{ marginLeft: 0 }}
        />
        <SortHeader
          label="Stock"
          sortKey="stock"
          className={headerClassName("stock")}
          dataTip="Good stock in this market. Click to sort"
          onSort={handleSort}
        />
        <SortHeader
          label="Price"
          sortKey="price"
          className={headerClassName("price")}
          dataTip="Price for this good. Click to sort"
          onSort={handleSort}
        />
      </div>
      <div className="table" style={{ maxHeight: "40em" }}>
        {selectedGood ? (
          sortedRows.map(row => (
            <div
              key={row.id}
              className="states"
              data-id={row.id}
              data-market={row.name}
              data-stock={row.stock}
              data-price={row.price}
            >
              <fill-box fill={row.color} />
              <div style={{ width: "9em" }}>{row.name}</div>
              <div data-type="stock" style={{ width: "5em" }}>
                {stockCellText(row.stock)}
              </div>
              <div style={{ width: "7em" }}>{formatPrice(row.price)}</div>
            </div>
          ))
        ) : (
          <div>Select a good</div>
        )}
      </div>
      <div className="totalLine">
        <div style={{ marginLeft: "5px" }} data-tip="Total stock of this good across all markets">
          Total Stock:&nbsp;{rn(totalStock, 2)}
        </div>
        <div style={{ marginLeft: "12px" }} data-tip="Average price of this good across markets">
          Avg Price:&nbsp;{formatPrice(averagePrice)}
        </div>
      </div>
      <div>
        <button type="button" className="icon-cw" data-tip="Refresh" aria-label="Refresh" onClick={handleRefresh} />
        <button
          type="button"
          className="icon-percent"
          data-tip="Toggle percentage / absolute values views"
          aria-label="Toggle percentage view"
          onClick={() => setShowPercentage(current => !current)}
        />
        <button
          type="button"
          className="icon-download"
          data-tip="Save data as a CSV file"
          aria-label="Export as CSV"
          onClick={handleExport}
        />
      </div>
    </Panel>
  );
}
