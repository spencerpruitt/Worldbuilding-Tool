import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Good } from "@/generators/goods-generator";
import type { Market } from "@/generators/markets-generator";
import { ComparePrices, resetPersistedGood } from "./ComparePrices";

// A small world stubbed via the same window.X bridge the accessor reads (see
// world-state.test.ts). Two goods and two markets are enough to exercise the
// dropdown, sorting, percentage, and CSV behaviors.
const iron: Good = { i: 0, name: "Iron", tags: [], value: 5, unit: "unit", icon: "", color: "#aaa" };
const grain: Good = { i: 1, name: "Grain", tags: [], value: 2, unit: "unit", icon: "", color: "#bbb" };

const harbor: Market = {
  i: 0,
  centerBurgId: 10,
  color: "#ff0000",
  goods: { 0: { stock: 12, price: 4 }, 1: { stock: 3, price: 1 } }
};
const inland: Market = {
  i: 1,
  centerBurgId: 20,
  color: "#00ff00",
  goods: { 0: { stock: 5, price: 9 }, 1: { stock: 8, price: 2 } }
};

const globalScope = globalThis as Record<string, unknown>;

beforeEach(() => {
  // Reset the module-level persisted good so selection does not leak between tests.
  resetPersistedGood();
  globalScope.pack = { goods: [iron, grain], markets: [harbor, inland] };
  globalScope.Goods = { get: (id: number) => [iron, grain].find(good => good.i === id) };
  globalScope.Markets = { getName: (market: Market) => `Market ${market.i}` };
});

afterEach(() => {
  globalScope.pack = undefined;
  globalScope.Goods = undefined;
  globalScope.Markets = undefined;
  globalScope.downloadFile = undefined;
  globalScope.getFileName = undefined;
});

// Market names of the currently rendered rows, in DOM (sorted) order.
function renderedMarketNames(container: HTMLElement): (string | null)[] {
  return Array.from(container.querySelectorAll(".states")).map(row => row.getAttribute("data-market"));
}

// Stock cell text of the currently rendered rows, in DOM order.
function renderedStockCells(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('.states div[data-type="stock"]')).map(cell => cell.textContent ?? "");
}

describe("<ComparePrices>", () => {
  it("renders one row per market with the selected good's stock and price", () => {
    const { container } = render(<ComparePrices goodId={0} onClose={() => {}} />);

    // Default sort is Stock descending, so the higher-stock harbor comes first.
    expect(renderedMarketNames(container)).toEqual(["Market 0", "Market 1"]);
    expect(renderedStockCells(container)).toEqual(["12", "5"]);
    expect(screen.getByText("🟡 4")).toBeTruthy();
    expect(screen.getByText("🟡 9")).toBeTruthy();
  });

  it("switches the compared good when the dropdown changes", () => {
    const { container } = render(<ComparePrices goodId={0} onClose={() => {}} />);

    const select = screen.getByRole("combobox") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "1" } });

    // Grain: harbor stock 3, inland stock 8 -> Stock descending puts inland first.
    expect(renderedMarketNames(container)).toEqual(["Market 1", "Market 0"]);
    expect(renderedStockCells(container)).toEqual(["8", "3"]);
  });

  it("toggles the stock column between absolute values and percentages", () => {
    const { container } = render(<ComparePrices goodId={0} onClose={() => {}} />);

    const percentageButton = screen.getByLabelText("Toggle percentage view");
    fireEvent.click(percentageButton);

    // Iron total stock is 12 + 5 = 17; 12/17 -> 70.59%, 5/17 -> 29.41%.
    expect(renderedStockCells(container)).toEqual(["70.59%", "29.41%"]);

    fireEvent.click(percentageButton);
    expect(renderedStockCells(container)).toEqual(["12", "5"]);
  });

  it("exports a CSV matching the legacy format via the download globals", () => {
    const download = vi.fn();
    globalScope.downloadFile = download;
    globalScope.getFileName = (name?: string) => name ?? "";

    render(<ComparePrices goodId={0} onClose={() => {}} />);
    fireEvent.click(screen.getByLabelText("Export as CSV"));

    const expectedCsv = "Market,Stock (Iron),Price (Iron)\nMarket 0,12,4\nMarket 1,5,9\n";
    expect(download).toHaveBeenCalledWith(expectedCsv, "Compare_Prices_Iron.csv");
  });

  it("reorders rows when a column header is clicked", () => {
    const { container } = render(<ComparePrices goodId={0} onClose={() => {}} />);

    // Default is Stock descending; clicking Stock toggles to ascending.
    fireEvent.click(container.querySelector('[data-sortby="stock"]') as HTMLElement);
    expect(renderedMarketNames(container)).toEqual(["Market 1", "Market 0"]);
  });

  it("defaults to the first good (alphabetically) when opened without a goodId", () => {
    const { container } = render(<ComparePrices onClose={() => {}} />);

    // Grain sorts before Iron, so it is the default selection.
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("1");
    expect(container.querySelectorAll(".states").length).toBe(2);
    expect(screen.queryByText("Select a good")).toBeNull();
  });

  it("falls back to the first good when opened with an id that no longer exists", () => {
    const { container } = render(<ComparePrices goodId={999} onClose={() => {}} />);

    // 999 resolves to no good, so the surface shows the first good's full table
    // instead of a blank panel (legacy rebuildGoodSelect guard).
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("1");
    expect(container.querySelectorAll(".states").length).toBe(2);
  });

  it("remembers the last-selected good across reopens without a goodId", () => {
    // Grain (id 1) is the alphabetical default; pick Iron (id 0) so a remembered
    // selection is distinguishable from the first-good fallback.
    const first = render(<ComparePrices goodId={1} onClose={() => {}} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "0" } });
    first.unmount();

    // Reopen without a goodId (the markets-overview path): it returns to Iron,
    // not the alphabetical first good — matching the legacy persistent selection.
    render(<ComparePrices onClose={() => {}} />);
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("0");
  });

  it("quotes a market name containing a comma so the CSV row stays intact", () => {
    const download = vi.fn();
    globalScope.downloadFile = download;
    globalScope.getFileName = (name?: string) => name ?? "";
    globalScope.Markets = { getName: (market: Market) => (market.i === 0 ? "Port, North" : `Market ${market.i}`) };

    render(<ComparePrices goodId={0} onClose={() => {}} />);
    fireEvent.click(screen.getByLabelText("Export as CSV"));

    const expectedCsv = 'Market,Stock (Iron),Price (Iron)\n"Port, North",12,4\nMarket 1,5,9\n';
    expect(download).toHaveBeenCalledWith(expectedCsv, "Compare_Prices_Iron.csv");
  });
});
