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
  globalScope.pack = { goods: [iron, grain], markets: [harbor] };
  globalScope.Goods = { get: (id: number) => [iron, grain].find(good => good.i === id) };
  globalScope.Markets = { getName: (market: Market) => `Market ${market.i}` };
});

afterEach(() => {
  globalScope.pack = undefined;
  globalScope.Goods = undefined;
  globalScope.Markets = undefined;
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
});
