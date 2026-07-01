import { render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { closeSurface, getOpenSurfaces, openSurface, type SurfaceId } from "./app-shell/registry";

const globalScope = globalThis as Record<string, unknown>;

const ironOre = { i: 5, name: "Iron Ore" };
const harbor = { i: 0, centerBurgId: 10, color: "#ff0000", goods: { 5: { stock: 12, price: 4 } } };

beforeEach(() => {
  // The Compare Prices surface reads goods AND markets through the accessor,
  // which reads pack / Goods / Markets off the bridge (mirrors world-state.test.ts).
  globalScope.pack = { goods: [ironOre], markets: [harbor] };
  globalScope.Goods = { get: (id: number) => (id === 5 ? ironOre : undefined) };
  globalScope.Markets = { getName: (market: { i: number }) => `Market ${market.i}` };
});

afterEach(() => {
  for (const surface of getOpenSurfaces()) act(() => closeSurface(surface.id));
  globalScope.pack = undefined;
  globalScope.Goods = undefined;
  globalScope.Markets = undefined;
});

describe("<App> surface mounting", () => {
  it("renders nothing when no surface is open", () => {
    const { container } = render(<App />);
    expect(container.textContent).toBe("");
  });

  it("mounts a surface in a panel when openSurface is dispatched", () => {
    render(<App />);

    act(() => openSurface("compare-prices", { goodId: 5 }));

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Compare Prices")).toBeTruthy();
    expect(screen.getByText("Iron Ore")).toBeTruthy();
  });

  it("unmounts the surface subtree when it is closed", () => {
    render(<App />);
    act(() => openSurface("compare-prices", { goodId: 5 }));
    expect(screen.getByText("Iron Ore")).toBeTruthy();

    act(() => closeSurface("compare-prices"));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("Iron Ore")).toBeNull();
  });

  it("warns about and reaps an unregistered surface id instead of leaving a zombie", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(<App />);

    // `SurfaceId` makes this a compile error normally; cast to exercise the
    // runtime backstop for an id with no registered component.
    act(() => openSurface("does-not-exist" as SurfaceId, {}));

    // Nothing renders, the warning fires, and the reaping effect closed it so no
    // zombie entry lingers to re-warn on every future render.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(warn).toHaveBeenCalledWith('No React surface registered for id "does-not-exist"; closing it');
    expect(getOpenSurfaces()).toEqual([]);
    warn.mockRestore();
  });
});
