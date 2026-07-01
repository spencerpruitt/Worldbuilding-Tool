import { afterEach, describe, expect, it, vi } from "vitest";
import {
  closeAllSurfaces,
  closeSurface,
  getOpenSurfaces,
  getSurfaceComponent,
  openSurface,
  registerSurface,
  type SurfaceComponent,
  subscribe
} from "./registry";

// The registry is a module-level singleton, so each test must leave it empty.
afterEach(() => {
  for (const surface of getOpenSurfaces()) closeSurface(surface.id);
});

describe("app-shell surface registry", () => {
  it("starts with no open surfaces", () => {
    expect(getOpenSurfaces()).toEqual([]);
  });

  it("opens a surface with its props", () => {
    openSurface("compare-prices", { goodId: 3, anchor: "#goodsEditor" });

    expect(getOpenSurfaces()).toEqual([
      expect.objectContaining({ id: "compare-prices", props: { goodId: 3, anchor: "#goodsEditor" } })
    ]);
  });

  it("stamps a fresh, increasing token on each open so App can remount on re-open", () => {
    openSurface("compare-prices", { goodId: 1 });
    const firstToken = getOpenSurfaces()[0].token;

    openSurface("compare-prices", { goodId: 1 });
    const secondToken = getOpenSurfaces()[0].token;

    expect(secondToken).toBeGreaterThan(firstToken);
  });

  it("closes an open surface", () => {
    openSurface("compare-prices", { goodId: 3 });
    closeSurface("compare-prices");

    expect(getOpenSurfaces()).toEqual([]);
  });

  it("re-opening a surface replaces its props rather than duplicating it", () => {
    openSurface("compare-prices", { goodId: 1 });
    openSurface("compare-prices", { goodId: 7 });

    expect(getOpenSurfaces()).toEqual([expect.objectContaining({ id: "compare-prices", props: { goodId: 7 } })]);
  });

  it("notifies subscribers on open and close, and stops after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);

    openSurface("compare-prices", {});
    expect(listener).toHaveBeenCalledTimes(1);

    closeSurface("compare-prices");
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    openSurface("compare-prices", {});
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("returns a stable snapshot reference until the set of surfaces changes", () => {
    const before = getOpenSurfaces();
    expect(getOpenSurfaces()).toBe(before);

    openSurface("compare-prices", {});
    const afterOpen = getOpenSurfaces();
    expect(afterOpen).not.toBe(before);
    expect(getOpenSurfaces()).toBe(afterOpen);
  });
});

describe("closeAllSurfaces", () => {
  it("closes every open surface and notifies once", () => {
    const listener = vi.fn();
    openSurface("compare-prices", {});
    openSurface("market-overview", { marketId: 1 });
    const unsubscribe = subscribe(listener);

    closeAllSurfaces();

    expect(getOpenSurfaces()).toEqual([]);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("is a no-op (no notification) when nothing is open", () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);
    closeAllSurfaces();
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });
});

describe("surface component registry", () => {
  it("returns the component registered for an id, and undefined for an unregistered one", () => {
    const marker = (() => null) as unknown as SurfaceComponent;
    registerSurface("trade-details", marker);

    expect(getSurfaceComponent("trade-details")).toBe(marker);
    // No component was registered for this id in this unit test's isolated module.
    expect(getSurfaceComponent("market-deals")).toBeUndefined();
  });
});
