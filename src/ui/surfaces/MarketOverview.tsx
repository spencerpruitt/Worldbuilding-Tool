import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { lazy } from "@/lazy-loaders";
import { rn } from "@/utils/numberUtils";
import { formatPrice } from "@/utils/unitUtils";
import { csvField } from "../csv";
import { Panel } from "../Panel";
import { type SortDirection, SortHeader, sortableHeaderClass } from "../SortHeader";
import { useWorldVersion } from "../use-world-version";
import {
  getCustomerBuyPrice,
  getCustomerSellPrice,
  getGood,
  getGoodStroke,
  getMarket,
  getMarketBurgCount,
  getMarketCellCount,
  getMarketCenterBurg,
  getMarketDefaultName,
  getMarketName,
  getMarketOwnerState,
  renameMarket
} from "../world-state";

interface MarketOverviewProps {
  /** Registry-supplied id of the market to show (from the `open()` seam). */
  marketId: number;
  /** CSS selector the panel anchors near on open. */
  anchor?: string;
  onClose: () => void;
}

// Which column the goods table is sorted by. Good sorts by name (alphabetically),
// Stock/Price sort numerically — matching the legacy header `data-sortby` values
// and the `applySorting` name/number split. Direction is the shared SortDirection.
type SortKey = "good" | "stock" | "price";

// One rendered goods line: the good's swatch color/stroke/icon, name, and the
// market's rounded stock/price for it (rounded the way the legacy `addLines` did).
interface GoodRow {
  goodId: number;
  name: string;
  color: string;
  stroke: string;
  icon: string;
  stock: number;
  price: number;
}

/**
 * MarketOverview — the Market Stock surface for a single market, at parity with
 * the legacy jQuery-UI dialog.
 *
 * Presentational, reading all world data through the World-State accessor (never
 * raw `window.pack`) and re-reading whenever the world changes (it subscribes via
 * `useWorldVersion`, so an edit elsewhere shows immediately). It renames the market
 * through the accessor's `renameMarket` (the one mutation the accessor exposes);
 * the rename updates this surface's own title via local re-render and deliberately
 * does not broadcast a world change (see ADR-0004 / `renameMarket`). Side-effects
 * that are not world data — the CSV download, the coat-of-arms render, opening the
 * deals surface — call the existing window globals / lazy seam directly, exactly as
 * the legacy controller did.
 *
 * Remounted per open (App keys it by the registry token), so the sort/percentage
 * view state resets each open the way the legacy dialog did.
 */
export function MarketOverview({ marketId, anchor, onClose }: MarketOverviewProps) {
  // Local re-read (Refresh button); does not broadcast a world change.
  const [refreshCount, refresh] = useReducer(count => count + 1, 0);
  // Subscribe to the global world-change signal so edits elsewhere re-read.
  const worldVersion = useWorldVersion();

  const market = getMarket(marketId);
  const centerBurg = market ? getMarketCenterBurg(market) : undefined;

  const [nameInput, setNameInput] = useState(() => market?.name ?? "");
  const [sortKey, setSortKey] = useState<SortKey>("stock");
  const [sortDirection, setSortDirection] = useState<SortDirection>("down");

  // Re-sync the controlled rename input from world state ONLY on an external world
  // change (a legacy edit that bumped the version), not on local typing — renames
  // don't bump the version, so this never clobbers what the user is typing. Keeps
  // the field correct if markets are regenerated while the surface is open.
  const syncedVersion = useRef(worldVersion);
  useEffect(() => {
    if (worldVersion !== syncedVersion.current) {
      syncedVersion.current = worldVersion;
      setNameInput(market?.name ?? "");
    }
  }, [worldVersion, market]);

  // The per-good pass (name/stroke/owner lookups) is memoized so sort-direction
  // toggles — which do not change this data — don't redo it. refreshCount and
  // worldVersion are deliberate cache-busters: the body reads mutable world
  // globals via the accessor, so a Refresh or any world change must re-read.
  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshCount and worldVersion are intentional cache-busters for the accessor reads below.
  const { rows, cellCount, burgCount, totalStock, ownerState } = useMemo(() => {
    if (!market) {
      return { rows: [] as GoodRow[], cellCount: 0, burgCount: 0, totalStock: 0, ownerState: undefined };
    }
    const goodRows: GoodRow[] = [];
    for (const [goodId, marketGood] of Object.entries(market.goods)) {
      const good = getGood(Number(goodId));
      if (!good) continue;
      goodRows.push({
        goodId: good.i,
        name: good.name,
        color: good.color,
        stroke: getGoodStroke(good.color),
        icon: good.icon,
        stock: rn(marketGood.stock, 2),
        price: rn(marketGood.price, 2)
      });
    }
    const stockTotal = Object.values(market.goods).reduce((sum, marketGood) => sum + marketGood.stock, 0);
    return {
      rows: goodRows,
      cellCount: getMarketCellCount(market),
      burgCount: getMarketBurgCount(market),
      totalStock: rn(stockTotal, 2),
      ownerState: getMarketOwnerState(market)
    };
  }, [market, refreshCount, worldVersion]);

  const sortedRows = useMemo(() => {
    const direction = sortDirection === "down" ? -1 : 1;
    return [...rows].sort((first, second) => {
      if (sortKey === "good") return first.name.localeCompare(second.name) * direction;
      return (first[sortKey] - second[sortKey]) * direction;
    });
  }, [rows, sortKey, sortDirection]);

  const coaId = ownerState ? `stateCOA${ownerState.i}` : "";

  // Render the owning state's coat-of-arms into the shared SVG defs after paint,
  // matching the legacy `COArenderer.trigger`. It is a renderer side-effect (not
  // world data), so it calls the window global directly, guarded for its absence.
  useEffect(() => {
    if (ownerState && typeof COArenderer !== "undefined") {
      COArenderer.trigger(coaId, ownerState.coa);
    }
  }, [ownerState, coaId]);

  function handleNameChange(event: React.ChangeEvent<HTMLInputElement>): void {
    const value = event.target.value;
    setNameInput(value);
    if (market) renameMarket(market, value);
  }

  function handleNameReset(): void {
    setNameInput("");
    if (market) renameMarket(market, "");
  }

  // Clicking a header sorts by its column. Re-clicking the active column flips
  // direction; a fresh column starts ascending for names and descending for
  // numbers — matching the legacy sort toggle.
  function handleSort(key: SortKey): void {
    if (key === sortKey) {
      setSortDirection(current => (current === "down" ? "up" : "down"));
      return;
    }
    setSortKey(key);
    setSortDirection(key === "good" ? "up" : "down");
  }

  function handleOpenDeals(): void {
    lazy.marketDealsOverview().then(module => module.open(marketId));
  }

  // CSV is built in world order (the `rows` array, not the sorted view) with each
  // field escaped, then handed to the window download globals — same columns as
  // the legacy `downloadStockCsv` (Good, Stock, Buy Price, Sell Price).
  function handleExport(): void {
    const header = "Good,Stock,Buy Price,Sell Price";
    const lines = rows.map(row => {
      const buyPrice = rn(getCustomerBuyPrice(row.price), 2);
      const sellPrice = rn(getCustomerSellPrice(row.price), 2);
      return [csvField(row.name), String(row.stock), String(buyPrice), String(sellPrice)].join(",");
    });
    const csv = `${[header, ...lines].join("\n")}\n`;
    downloadFile(csv, `${getFileName("Market")}.csv`);
  }

  function headerClassName(key: SortKey): string {
    return sortableHeaderClass(key === sortKey, key === "good", sortDirection);
  }

  const title = market ? `Market Stock: ${getMarketName(market)}` : "Market Stock";

  // Guard the invalid cases the legacy overview refused to render (rather than
  // showing a fabricated Neutrals owner / `Market {i}` name): the market was
  // deleted, or its center burg was removed, underneath an open surface. The
  // explicit condition also narrows `market` to defined for the render below.
  if (!market || !centerBurg || centerBurg.removed) {
    const message = market ? "This market's center burg no longer exists." : "This market no longer exists.";
    return (
      <Panel title={title} anchor={anchor} onClose={onClose}>
        <div>{message}</div>
      </Panel>
    );
  }

  return (
    <Panel title={title} anchor={anchor} onClose={onClose}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: "0.4em" }}>
        <div className="label">Name:</div>
        <input
          data-tip="Type to rename the market. Clear the field to reset to the default name"
          autoCorrect="off"
          spellCheck={false}
          style={{ width: "11em", marginLeft: "0.3em" }}
          value={nameInput}
          placeholder={getMarketDefaultName(market)}
          onChange={handleNameChange}
        />
        <button
          type="button"
          data-tip="Reset to the default name (center burg name)"
          className="icon-ccw pointer"
          style={{ marginLeft: "0.3em" }}
          aria-label="Reset market name"
          onClick={handleNameReset}
        />
      </div>
      <div className="header" style={{ gridTemplateColumns: "2.5em 9em 5.5em 3.2em" }}>
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
          label="Stock"
          sortKey="stock"
          className={headerClassName("stock")}
          dataTip="Click to sort by stock"
          onSort={handleSort}
        />
        <SortHeader
          label="Price"
          sortKey="price"
          className={headerClassName("price")}
          dataTip="Click to sort by price"
          onSort={handleSort}
        />
      </div>
      <div className="table" style={{ maxHeight: "40em" }}>
        {sortedRows.length > 0 ? (
          sortedRows.map(row => (
            <div
              key={row.goodId}
              className="states marketGood"
              data-good={row.name}
              data-stock={row.stock}
              data-price={row.price}
            >
              <svg data-tip="Good icon" width="2em" height="2em" className="goodIcon" role="img" aria-label={row.name}>
                <title>{row.name}</title>
                <circle cx="50%" cy="50%" r="42%" fill={row.color} stroke={row.stroke} />
                <use href={`#${row.icon}`} x="10%" y="10%" width="80%" height="80%" />
              </svg>
              <div data-tip="Good name" className="goodName">
                {row.name}
              </div>
              <div data-tip="Good stock" className="marketGoodStock">
                {row.stock}
              </div>
              <div data-tip="Good price" className="marketGoodPrice">
                {formatPrice(row.price)}
              </div>
            </div>
          ))
        ) : (
          <div>No market goods available</div>
        )}
      </div>
      <div className="totalLine">
        <div style={{ marginLeft: "5px" }}>Cells: {cellCount}</div>
        <div style={{ marginLeft: "12px" }}>Burgs: {burgCount}</div>
        <div style={{ marginLeft: "12px" }}>Stock: {totalStock}</div>
      </div>
      <div style={{ marginBottom: "0.3em" }}>
        {ownerState ? (
          <>
            <svg className="coaIcon" viewBox="0 0 200 200" role="img" aria-label="State coat of arms">
              <title>State coat of arms</title>
              <use href={`#${coaId}`} />
            </svg>
            <b>Owner:</b> {ownerState.fullName || ownerState.name}
          </>
        ) : null}
      </div>
      <div>
        <button
          type="button"
          className="icon-cw"
          data-tip="Refresh the Overview screen"
          aria-label="Refresh"
          onClick={refresh}
        />
        <button
          type="button"
          className="icon-list-bullet"
          data-tip="View market deals"
          aria-label="View market deals"
          onClick={handleOpenDeals}
        />
        <button
          type="button"
          className="icon-download"
          data-tip="Save market deals data as a text file (.csv)"
          aria-label="Export as CSV"
          onClick={handleExport}
        />
      </div>
    </Panel>
  );
}
