import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Good } from "@/generators/goods-generator";
import type { Market } from "@/generators/markets-generator";
import { notifyWorldChanged } from "../world-state";
import { MarketOverview } from "./MarketOverview";

// Open Deals dynamically imports the deals controller via the lazy seam; mock it
// so the component test does not pull in the real (still-legacy) controller.
const openDeals = vi.fn();
vi.mock("@/lazy-loaders", () => ({
  lazy: { marketDealsOverview: () => Promise.resolve({ open: openDeals }) }
}));

// Two goods stocked by one market, plus the burg/state/cell context the overview
// summary and owner line read through the accessor.
const iron: Good = { i: 0, name: "Iron", tags: [], value: 5, unit: "unit", icon: "goodIron", color: "#aaa" };
const grain: Good = { i: 1, name: "Grain", tags: [], value: 2, unit: "unit", icon: "goodGrain", color: "#bbb" };

const harbor: Market = {
  i: 0,
  centerBurgId: 10,
  color: "#ff0000",
  goods: { 0: { stock: 12, price: 4 }, 1: { stock: 3, price: 1 } }
};

const globalScope = globalThis as Record<string, unknown>;

beforeEach(() => {
  openDeals.mockClear();
  harbor.name = undefined;
  const burgs: unknown[] = [];
  burgs[10] = { i: 10, name: "Portford", state: 1, market: 0 };
  burgs[11] = { i: 11, name: "Elsewhere", state: 1, market: 0 };
  globalScope.pack = {
    goods: [iron, grain],
    markets: [harbor],
    burgs,
    states: [
      { i: 0, name: "Neutrals" },
      { i: 1, name: "Ironland", fullName: "Kingdom of Ironland", coa: { shield: "heater" } }
    ],
    cells: { market: [0, 0, 0, 1] }
  };
  globalScope.Goods = {
    get: (id: number) => [iron, grain].find(good => good.i === id),
    getStroke: (color: string) => `stroke-of-${color}`
  };
  globalScope.Markets = {
    getName: (market: Market) => market.name || "Portford",
    customerBuyPrice: (price: number) => price * 1.1,
    customerSellPrice: (price: number) => price * 0.9,
    get: (id: number) => [harbor].find(market => market.i === id)
  };
  globalScope.COArenderer = { trigger: vi.fn() };
});

afterEach(() => {
  globalScope.pack = undefined;
  globalScope.Goods = undefined;
  globalScope.Markets = undefined;
  globalScope.COArenderer = undefined;
  globalScope.downloadFile = undefined;
  globalScope.getFileName = undefined;
});

// Good names of the currently rendered rows, in DOM (sorted) order.
function renderedGoodNames(container: HTMLElement): (string | null)[] {
  return Array.from(container.querySelectorAll(".marketGood")).map(row => row.getAttribute("data-good"));
}

function stockCells(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll(".marketGood .marketGoodStock")).map(cell => cell.textContent ?? "");
}

describe("<MarketOverview>", () => {
  it("renders one row per stocked good, default-sorted by stock descending", () => {
    const { container } = render(<MarketOverview marketId={0} onClose={() => {}} />);

    // Iron stock 12 > Grain stock 3, so Iron leads under Stock-descending sort.
    expect(renderedGoodNames(container)).toEqual(["Iron", "Grain"]);
    expect(stockCells(container)).toEqual(["12", "3"]);
  });

  it("shows the summary (cells, burgs, total stock) and the owning state", () => {
    render(<MarketOverview marketId={0} onClose={() => {}} />);

    expect(screen.getByText("Cells: 3")).toBeTruthy();
    expect(screen.getByText("Burgs: 2")).toBeTruthy();
    expect(screen.getByText("Stock: 15")).toBeTruthy();
    expect(screen.getByText("Kingdom of Ironland")).toBeTruthy();
  });

  it("sorts by good name when the Good header is clicked", () => {
    const { container } = render(<MarketOverview marketId={0} onClose={() => {}} />);

    fireEvent.click(container.querySelector('[data-sortby="good"]') as HTMLElement);
    // Ascending by name: Grain before Iron.
    expect(renderedGoodNames(container)).toEqual(["Grain", "Iron"]);
  });

  it("renames the market through the accessor and updates the title", () => {
    render(<MarketOverview marketId={0} onClose={() => {}} />);

    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Trade Harbor" } });

    expect(harbor.name).toBe("Trade Harbor");
    expect(screen.getByRole("dialog").getAttribute("aria-label")).toBe("Market Stock: Trade Harbor");
  });

  it("resets the market name to the default when the reset control is used", () => {
    harbor.name = "Trade Harbor";
    render(<MarketOverview marketId={0} onClose={() => {}} />);

    fireEvent.click(screen.getByLabelText("Reset market name"));
    expect(harbor.name).toBeUndefined();
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("");
  });

  it("refuses to render a market whose center burg was removed", () => {
    (globalScope.pack as { burgs: Array<{ removed?: boolean }> }).burgs[10].removed = true;
    render(<MarketOverview marketId={0} onClose={() => {}} />);

    expect(screen.getByText("This market's center burg no longer exists.")).toBeTruthy();
    expect(document.querySelectorAll(".marketGood").length).toBe(0);
  });

  it("shows a not-found message when the market no longer exists", () => {
    render(<MarketOverview marketId={999} onClose={() => {}} />);
    expect(screen.getByText("This market no longer exists.")).toBeTruthy();
  });

  it("re-syncs the rename input from world state on an external change", () => {
    harbor.name = "Old Name";
    render(<MarketOverview marketId={0} onClose={() => {}} />);
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("Old Name");

    // Simulate a legacy regenerate replacing the market's name underneath the surface.
    act(() => {
      harbor.name = "Regenerated";
      notifyWorldChanged();
    });
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("Regenerated");
  });

  it("exports a CSV with Good/Stock/Buy Price/Sell Price columns", () => {
    const download = vi.fn();
    globalScope.downloadFile = download;
    globalScope.getFileName = (name?: string) => name ?? "";

    render(<MarketOverview marketId={0} onClose={() => {}} />);
    fireEvent.click(screen.getByLabelText("Export as CSV"));

    // Buy = price*1.1, Sell = price*0.9, both rounded to 2 dp. World order (Iron, Grain).
    const expectedCsv = "Good,Stock,Buy Price,Sell Price\nIron,12,4.4,3.6\nGrain,3,1.1,0.9\n";
    expect(download).toHaveBeenCalledWith(expectedCsv, "Market.csv");
  });

  it("re-reads when the world changes underneath it (reactivity)", () => {
    const { container } = render(<MarketOverview marketId={0} onClose={() => {}} />);
    expect(stockCells(container)).toEqual(["12", "3"]);

    harbor.goods[0].stock = 99;
    act(() => {
      notifyWorldChanged();
    });

    expect(stockCells(container)).toEqual(["99", "3"]);
    harbor.goods[0].stock = 12;
  });

  it("opens the deals surface for this market via the preserved seam", async () => {
    render(<MarketOverview marketId={0} onClose={() => {}} />);

    fireEvent.click(screen.getByLabelText("View market deals"));
    // The seam resolves a promise, so let microtasks flush before asserting.
    await Promise.resolve();
    expect(openDeals).toHaveBeenCalledWith(0);
  });
});
