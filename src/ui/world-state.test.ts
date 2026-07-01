import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Good } from "@/generators/goods-generator";
import type { Market } from "@/generators/markets-generator";
import * as worldState from "./world-state";

// Minimal stubs of the world data the accessor reads off the window.X bridge.
// The accessor is the ONE place allowed to touch these globals; these tests
// pin the read shape it exposes to components.
const iron: Good = { i: 0, name: "Iron", tags: [], value: 5, unit: "unit", icon: "", color: "#aaa" };
const grain: Good = { i: 1, name: "Grain", tags: [], value: 2, unit: "unit", icon: "", color: "#bbb" };

const harbor: Market = {
  i: 0,
  centerBurgId: 10,
  color: "#ff0000",
  goods: { 0: { stock: 12, price: 4 }, 1: { stock: 3, price: 1 } }
};

const globalScope = globalThis as Record<string, unknown>;

beforeEach(() => {
  // pack.burgs is indexed by burg id, so the center burg (id 10) sits at index 10.
  const burgs: unknown[] = [];
  burgs[10] = { i: 10, name: "Portford", state: 1, market: 0 };
  burgs[11] = { i: 11, name: "Elsewhere", state: 1, market: 0 };
  burgs[12] = { i: 12, name: "Gone", state: 1, market: 0, removed: true };
  globalScope.pack = {
    goods: [iron, grain],
    markets: [harbor],
    // A small burg/state/cell context so the market-overview reads (owner, cell
    // count, burg count, default name) have something to resolve against.
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
    getName: (market: Market) => market.name || `Market ${market.i}`,
    customerBuyPrice: (price: number) => price * 1.1,
    customerSellPrice: (price: number) => price * 0.9,
    get: (id: number) => [harbor].find(market => market.i === id)
  };
});

afterEach(() => {
  globalScope.pack = undefined;
  globalScope.Goods = undefined;
  globalScope.Markets = undefined;
  // Renaming tests mutate the shared harbor stub; reset it between tests.
  harbor.name = undefined;
});

describe("world-state accessor", () => {
  it("reads the goods list", () => {
    expect(worldState.getGoods()).toEqual([iron, grain]);
  });

  it("reads the markets list", () => {
    expect(worldState.getMarkets()).toEqual([harbor]);
  });

  it("looks a good up by id", () => {
    expect(worldState.getGood(1)).toEqual(grain);
    expect(worldState.getGood(99)).toBeUndefined();
  });

  it("reads a market's display name", () => {
    expect(worldState.getMarketName(harbor)).toBe("Market 0");
  });

  it("reads a market's stock/price for a good", () => {
    expect(worldState.getMarketGood(harbor, iron)).toEqual({ stock: 12, price: 4 });
  });

  it("returns undefined market data for a good the market does not stock", () => {
    const missing: Good = { i: 42, name: "Silk", tags: [], value: 9, unit: "unit", icon: "", color: "#ccc" };
    expect(worldState.getMarketGood(harbor, missing)).toBeUndefined();
  });

  it("reads a market's color", () => {
    expect(worldState.getMarketColor(harbor)).toBe("#ff0000");
  });

  it("sorts goods alphabetically by name", () => {
    // Stubbed order is [iron, grain]; sorted by name is [Grain, Iron].
    expect(worldState.getGoodsSortedByName().map(good => good.name)).toEqual(["Grain", "Iron"]);
  });

  it("returns empty lists when no world is loaded instead of throwing", () => {
    globalScope.pack = undefined;
    expect(worldState.getGoods()).toEqual([]);
    expect(worldState.getMarkets()).toEqual([]);
    expect(worldState.getGoodsSortedByName()).toEqual([]);
  });
});

describe("world-state market-overview reads", () => {
  it("looks a market up by id", () => {
    expect(worldState.getMarket(0)).toEqual(harbor);
    expect(worldState.getMarket(99)).toBeUndefined();
  });

  it("reads a good's swatch stroke", () => {
    expect(worldState.getGoodStroke("#aaa")).toBe("stroke-of-#aaa");
  });

  it("derives a market's default name from its center burg", () => {
    expect(worldState.getMarketDefaultName(harbor)).toBe("Portford");
  });

  it("counts the cells and (non-removed) burgs belonging to a market", () => {
    // cells.market has three 0s; burgs 10 and 11 belong to market 0 (12 is removed).
    expect(worldState.getMarketCellCount(harbor)).toBe(3);
    expect(worldState.getMarketBurgCount(harbor)).toBe(2);
  });

  it("resolves a market's owning state via its center burg", () => {
    expect(worldState.getMarketOwnerState(harbor)?.fullName).toBe("Kingdom of Ironland");
  });

  it("exposes customer buy/sell prices for CSV export", () => {
    expect(worldState.getCustomerBuyPrice(10)).toBeCloseTo(11);
    expect(worldState.getCustomerSellPrice(10)).toBeCloseTo(9);
  });

  it("renames a market (trimmed) without broadcasting a world change", () => {
    // Rename is per-keystroke metadata; it must NOT bump the global version (that
    // would re-scan/re-render every open surface on each character — see ADR-0004).
    let notified = 0;
    const unsubscribe = worldState.subscribeWorld(() => {
      notified += 1;
    });

    worldState.renameMarket(harbor, "  Trade Harbor  ");
    expect(harbor.name).toBe("Trade Harbor");

    // Clearing the name resets it to undefined (falls back to the default).
    worldState.renameMarket(harbor, "   ");
    expect(harbor.name).toBeUndefined();

    expect(notified).toBe(0);
    unsubscribe();
  });
});

describe("world-state reactivity (subscribe/version)", () => {
  it("bumps the world version on notifyWorldChanged", () => {
    const before = worldState.getWorldVersion();
    worldState.notifyWorldChanged();
    expect(worldState.getWorldVersion()).toBe(before + 1);
  });

  it("returns a stable version between changes (snapshot stability for useSyncExternalStore)", () => {
    const first = worldState.getWorldVersion();
    const second = worldState.getWorldVersion();
    expect(second).toBe(first);
  });

  it("notifies subscribers when the world changes", () => {
    let calls = 0;
    const unsubscribe = worldState.subscribeWorld(() => {
      calls += 1;
    });
    worldState.notifyWorldChanged();
    worldState.notifyWorldChanged();
    expect(calls).toBe(2);
    unsubscribe();
  });

  it("stops notifying after unsubscribe", () => {
    let calls = 0;
    const unsubscribe = worldState.subscribeWorld(() => {
      calls += 1;
    });
    worldState.notifyWorldChanged();
    unsubscribe();
    worldState.notifyWorldChanged();
    expect(calls).toBe(1);
  });
});
