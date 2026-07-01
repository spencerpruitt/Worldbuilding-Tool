import { render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { closeSurface, getOpenSurfaces, openSurface } from "./app-shell/registry";

const globalScope = globalThis as Record<string, unknown>;

beforeEach(() => {
  // The skeleton Compare Prices surface reads the selected good through the
  // accessor, which reads Goods.get off the bridge.
  globalScope.Goods = { get: (id: number) => (id === 5 ? { i: 5, name: "Iron Ore" } : undefined) };
});

afterEach(() => {
  for (const surface of getOpenSurfaces()) act(() => closeSurface(surface.id));
  globalScope.Goods = undefined;
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

  it("warns and renders nothing for an unregistered surface id", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(<App />);

    act(() => openSurface("does-not-exist", {}));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(warn).toHaveBeenCalledWith('No React surface registered for id "does-not-exist"');
    warn.mockRestore();
  });
});
