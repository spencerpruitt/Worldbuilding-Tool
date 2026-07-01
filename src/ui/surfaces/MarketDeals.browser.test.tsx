import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Good } from "@/generators/goods-generator";
import type { Deal, Market } from "@/generators/markets-generator";
import { notifyWorldChanged } from "../world-state";
import { MarketDeals } from "./MarketDeals";

const iron: Good = { i: 0, name: "Iron", tags: [], value: 5, unit: "unit", icon: "goodIron", color: "#aaa" };
const grain: Good = { i: 1, name: "Grain", tags: [], value: 2, unit: "unit", icon: "goodGrain", color: "#bbb" };

const harbor: Market = { i: 0, centerBurgId: 10, color: "#f00", goods: {} };
const partnerMarket: Market = { i: 1, centerBurgId: 20, color: "#0f0", goods: {} };

// Market 0 sells iron to a burg (out), buys grain from a burg (in), and sells
// iron to another market (out, global).
const dealToBurg: Deal = {
  i: 100,
  seller: 0,
  sellerType: "market",
  buyer: 11,
  buyerType: "burg",
  good: 0,
  units: 10,
  price: 2,
  tax: 0
};
const dealFromBurg: Deal = {
  i: 101,
  seller: 12,
  sellerType: "burg",
  buyer: 0,
  buyerType: "market",
  good: 1,
  units: 5,
  price: 3,
  tax: 0
};
const dealToMarket: Deal = {
  i: 102,
  seller: 0,
  sellerType: "market",
  buyer: 1,
  buyerType: "market",
  good: 0,
  units: 4,
  price: 5,
  tax: 0
};

const globalScope = globalThis as Record<string, unknown>;

let deals: Deal[];

beforeEach(() => {
  deals = [dealToBurg, dealFromBurg, dealToMarket];
  const burgs: unknown[] = [];
  burgs[11] = { i: 11, name: "Northburg", x: 100, y: 200 };
  burgs[12] = { i: 12, name: "Southburg", x: 300, y: 400 };
  burgs[20] = { i: 20, name: "Farhaven", x: 500, y: 600 };
  globalScope.pack = { goods: [iron, grain], markets: [harbor, partnerMarket], burgs, deals };
  globalScope.Goods = {
    get: (id: number) => [iron, grain].find(good => good.i === id),
    getStroke: (color: string) => `stroke-of-${color}`
  };
  globalScope.Markets = {
    getName: (market: Market) => `Market ${market.i}`,
    get: (id: number) => [harbor, partnerMarket].find(market => market.i === id)
  };
  globalScope.zoomTo = vi.fn();
});

afterEach(() => {
  globalScope.pack = undefined;
  globalScope.Goods = undefined;
  globalScope.Markets = undefined;
  globalScope.zoomTo = undefined;
  globalScope.downloadFile = undefined;
  globalScope.getFileName = undefined;
});

function rowIds(container: HTMLElement): (string | null)[] {
  return Array.from(container.querySelectorAll(".marketDeal")).map(row => row.getAttribute("data-id"));
}

describe("<MarketDeals>", () => {
  it("renders one row per deal with its in/out direction", () => {
    const { container } = render(<MarketDeals marketId={0} onClose={() => {}} />);

    expect(container.querySelectorAll(".marketDeal").length).toBe(3);
    // The market sells iron to Northburg (OUT) and buys grain from Southburg (IN).
    const badges = Array.from(container.querySelectorAll(".marketBadge")).map(badge => badge.textContent);
    expect(badges).toContain("OUT");
    expect(badges).toContain("IN");
  });

  it("filters deals to local (burg) or global (market) counterparties", () => {
    const { container } = render(<MarketDeals marketId={0} onClose={() => {}} />);
    const filter = screen.getByRole("combobox") as HTMLSelectElement;

    fireEvent.change(filter, { target: { value: "local" } });
    // Local = the two burg-counterparty deals (to Northburg, from Southburg).
    expect(rowIds(container)).toEqual(["100", "101"]);

    fireEvent.change(filter, { target: { value: "global" } });
    // Global = the single market-to-market deal.
    expect(rowIds(container)).toEqual(["102"]);
  });

  it("shows the filtered deal count and net flow", () => {
    render(<MarketDeals marketId={0} onClose={() => {}} />);
    // Net = +20 (sell 10x2) - 15 (buy 5x3) + 20 (sell 4x5) = 25.
    expect(screen.getByText("Deals: 3")).toBeTruthy();
    expect(screen.getByText(/Net Flow:\s*🟡 25/)).toBeTruthy();
  });

  it("sorts by units when the Units header is clicked", () => {
    const { container } = render(<MarketDeals marketId={0} onClose={() => {}} />);

    // Units: dealToBurg 10, dealFromBurg 5, dealToMarket 4 -> descending order.
    fireEvent.click(container.querySelector('[data-sortby="units"]') as HTMLElement);
    expect(rowIds(container)).toEqual(["100", "101", "102"]);
    // Clicking again flips to ascending.
    fireEvent.click(container.querySelector('[data-sortby="units"]') as HTMLElement);
    expect(rowIds(container)).toEqual(["102", "101", "100"]);
  });

  it("zooms to a deal's counterparty when its row is clicked", () => {
    const zoom = globalScope.zoomTo as ReturnType<typeof vi.fn>;
    const { container } = render(<MarketDeals marketId={0} onClose={() => {}} />);

    const firstParty = container.querySelector(".marketDealParty") as HTMLElement;
    fireEvent.click(firstParty);
    // First deal's counterparty is Northburg at (100, 200).
    expect(zoom).toHaveBeenCalledWith(100, 200, 8, 2000);
  });

  it("exports all deals as CSV with the legacy columns", () => {
    const download = vi.fn();
    globalScope.downloadFile = download;
    globalScope.getFileName = (name?: string) => name ?? "";

    render(<MarketDeals marketId={0} onClose={() => {}} />);
    fireEvent.click(screen.getByLabelText("Export as CSV"));

    const expectedCsv =
      "Id,Good,Type,Client,Units,Price,Net\n" +
      "100,Iron,out,Northburg,10,2,20\n" +
      "101,Grain,in,Southburg,5,3,-15\n" +
      "102,Iron,out,Farhaven,4,5,20\n";
    expect(download).toHaveBeenCalledWith(expectedCsv, "Market_0_Deals.csv");
  });

  it("re-reads when the deals change underneath it (reactivity)", () => {
    const { container } = render(<MarketDeals marketId={0} onClose={() => {}} />);
    expect(container.querySelectorAll(".marketDeal").length).toBe(3);

    act(() => {
      deals.push({
        i: 103,
        seller: 0,
        sellerType: "market",
        buyer: 13,
        buyerType: "burg",
        good: 1,
        units: 2,
        price: 1,
        tax: 0
      });
      notifyWorldChanged();
    });

    expect(container.querySelectorAll(".marketDeal").length).toBe(4);
  });

  it("counts a good-less deal in the footer but renders no row for it (legacy parity)", () => {
    // A deal whose good was deleted: the legacy footer still counted it, but no
    // line was rendered.
    deals.push({
      i: 200,
      seller: 0,
      sellerType: "market",
      buyer: 11,
      buyerType: "burg",
      good: 99,
      units: 1,
      price: 1,
      tax: 0
    });
    const { container } = render(<MarketDeals marketId={0} onClose={() => {}} />);

    expect(screen.getByText("Deals: 4")).toBeTruthy();
    // Only the three good-ful deals render a row.
    expect(container.querySelectorAll(".marketDeal").length).toBe(3);
  });

  it("does not zoom when the deal's counterparty burg is unresolved", () => {
    const zoom = globalScope.zoomTo as ReturnType<typeof vi.fn>;
    // A deal to a burg id that does not exist: the party cannot resolve.
    deals.push({
      i: 201,
      seller: 0,
      sellerType: "market",
      buyer: 777,
      buyerType: "burg",
      good: 0,
      units: 1,
      price: 1,
      tax: 0
    });
    const { container } = render(<MarketDeals marketId={0} onClose={() => {}} />);

    const orphanRow = container.querySelector('[data-id="201"] .marketDealParty') as HTMLElement;
    fireEvent.click(orphanRow);
    expect(zoom).not.toHaveBeenCalled();
  });

  it("shows a not-found message when the market no longer exists", () => {
    render(<MarketDeals marketId={999} onClose={() => {}} />);
    expect(screen.getByText("This market no longer exists.")).toBeTruthy();
  });
});
