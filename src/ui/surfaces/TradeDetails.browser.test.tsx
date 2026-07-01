import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Good } from "@/generators/goods-generator";
import type { Deal } from "@/generators/markets-generator";
import { clearHighlight, highlight } from "@/renderers/draw-trade-animation";
import type { TradeBatch } from "@/renderers/trade-animation";
import { TradeDetails } from "./TradeDetails";

// The route highlight is a renderer side-effect; mock it so the surface test does
// not touch the real SVG renderer, and so we can assert it runs and tears down.
vi.mock("@/renderers/draw-trade-animation", () => ({
  highlight: vi.fn(),
  clearHighlight: vi.fn()
}));

const iron: Good = { i: 0, name: "Iron", tags: [], value: 5, unit: "unit", icon: "goodIron", color: "#aaa" };
const grain: Good = { i: 1, name: "Grain", tags: [], value: 2, unit: "unit", icon: "goodGrain", color: "#bbb" };

// Two iron deals aggregate into one row; a grain deal is a second row.
const deals: Deal[] = [
  { i: 1, seller: 10, sellerType: "burg", buyer: 20, buyerType: "burg", good: 0, units: 3, price: 2, tax: 0 },
  { i: 2, seller: 10, sellerType: "burg", buyer: 20, buyerType: "burg", good: 0, units: 2, price: 4, tax: 0 },
  { i: 3, seller: 10, sellerType: "burg", buyer: 20, buyerType: "burg", good: 1, units: 1, price: 10, tax: 0 }
];
const batch: TradeBatch = { id: "b1", deals, startBurgId: 10, endBurgId: 20, type: "local" };

const globalScope = globalThis as Record<string, unknown>;

beforeEach(() => {
  vi.mocked(highlight).mockClear();
  vi.mocked(clearHighlight).mockClear();
  const burgs: unknown[] = [];
  burgs[10] = { i: 10, name: "Alpha", cell: 1, x: 1, y: 2 };
  burgs[20] = { i: 20, name: "Beta", cell: 2, x: 5, y: 6, group: "city" };
  globalScope.pack = { goods: [iron, grain], burgs };
  globalScope.Goods = {
    get: (id: number) => [iron, grain].find(good => good.i === id),
    getStroke: (color: string) => `stroke-of-${color}`
  };
  // Route of length hypot(3,4) = 5; distance = 5 * distanceScale.
  globalScope.TradeAnimation = {
    findRoutePath: () => ({
      points: [
        [0, 0],
        [3, 4]
      ],
      segments: []
    })
  };
  globalScope.distanceScale = 2;
  globalScope.distanceUnitInput = { value: "mi" };
  globalScope.zoomTo = vi.fn();
});

afterEach(() => {
  globalScope.pack = undefined;
  globalScope.Goods = undefined;
  globalScope.TradeAnimation = undefined;
  globalScope.distanceScale = undefined;
  globalScope.distanceUnitInput = undefined;
  globalScope.zoomTo = undefined;
});

describe("<TradeDetails>", () => {
  it("renders the seller/buyer summary, aggregated rows, and totals", () => {
    const { container } = render(<TradeDetails batch={batch} onClose={() => {}} />);

    expect(screen.getByRole("dialog").getAttribute("aria-label")).toBe("Trade: Alpha to Beta");
    // Two goods after aggregation: iron (units 5) and grain (units 1).
    expect(container.querySelectorAll(".tradeDeal").length).toBe(2);
    // Footer totals: distance 5 * 2 = 10 mi; units 3+2+1 = 6; value 14 + 10 = 24.
    expect(screen.getByText("Distance: 10 mi")).toBeTruthy();
    expect(screen.getByText("Units: 6")).toBeTruthy();
  });

  it("labels the buyer with its burg group", () => {
    render(<TradeDetails batch={batch} onClose={() => {}} />);
    // Beta's group is "city"; Alpha has none, so it falls back to "burg".
    expect(screen.getByText(/Alpha burg/)).toBeTruthy();
    expect(screen.getByText(/Beta city/)).toBeTruthy();
  });

  it("highlights the route on mount and clears it on unmount", () => {
    const view = render(<TradeDetails batch={batch} onClose={() => {}} />);
    expect(highlight).toHaveBeenCalledWith([
      [0, 0],
      [3, 4]
    ]);

    view.unmount();
    expect(clearHighlight).toHaveBeenCalled();
  });

  it("sorts rows by good name when the Good header is clicked", () => {
    const { container } = render(<TradeDetails batch={batch} onClose={() => {}} />);

    fireEvent.click(container.querySelector('[data-sortby="good"]') as HTMLElement);
    const names = Array.from(container.querySelectorAll(".tradeDeal")).map(row => row.getAttribute("data-good"));
    expect(names).toEqual(["Grain", "Iron"]);
  });

  it("zooms to an endpoint when its summary icon is clicked", () => {
    const zoom = globalScope.zoomTo as ReturnType<typeof vi.fn>;
    render(<TradeDetails batch={batch} onClose={() => {}} />);

    fireEvent.click(screen.getByLabelText("Zoom to seller"));
    expect(zoom).toHaveBeenCalledWith(1, 2, 8, 1500);
  });

  it("shows a fallback when the route cannot be resolved", () => {
    globalScope.TradeAnimation = { findRoutePath: () => null };
    render(<TradeDetails batch={batch} onClose={() => {}} />);
    expect(screen.getByText("This trade route is no longer available.")).toBeTruthy();
  });
});
