import { afterEach, describe, expect, it, vi } from "vitest";
import { closeSurface, getOpenSurfaces, openSurface, subscribe } from "./registry";

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

    expect(getOpenSurfaces()).toEqual([{ id: "compare-prices", props: { goodId: 3, anchor: "#goodsEditor" } }]);
  });

  it("closes an open surface", () => {
    openSurface("compare-prices", { goodId: 3 });
    closeSurface("compare-prices");

    expect(getOpenSurfaces()).toEqual([]);
  });

  it("re-opening a surface replaces its props rather than duplicating it", () => {
    openSurface("compare-prices", { goodId: 1 });
    openSurface("compare-prices", { goodId: 7 });

    expect(getOpenSurfaces()).toEqual([{ id: "compare-prices", props: { goodId: 7 } }]);
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
