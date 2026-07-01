import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Panel } from "./Panel";

// Create a viewport-fixed anchor element the panel can position against, and
// return a cleanup that removes it.
function addAnchor(id: string, left: number, top: number): HTMLElement {
  const el = document.createElement("div");
  el.id = id;
  el.dataset.testAnchor = "true";
  el.style.position = "fixed";
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
  el.style.width = "40px";
  el.style.height = "20px";
  document.body.appendChild(el);
  return el;
}

describe("<Panel>", () => {
  afterEach(() => {
    document.querySelectorAll("[data-test-anchor]").forEach(el => {
      el.remove();
    });
  });
  it("renders its title and children", () => {
    render(
      <Panel title="Compare Prices" onClose={vi.fn()}>
        <div>panel body</div>
      </Panel>
    );

    expect(screen.getByText("Compare Prices")).toBeTruthy();
    expect(screen.getByText("panel body")).toBeTruthy();
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    render(
      <Panel title="Compare Prices" onClose={onClose}>
        <div>panel body</div>
      </Panel>
    );

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("unmounts its content when closed", () => {
    function Harness() {
      const [open, setOpen] = useState(true);
      if (!open) return null;
      return (
        <Panel title="Compare Prices" onClose={() => setOpen(false)}>
          <div>panel body</div>
        </Panel>
      );
    }

    render(<Harness />);
    expect(screen.getByText("panel body")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByText("panel body")).toBeNull();
  });

  it("moves the frame when the title bar is dragged", () => {
    render(
      <Panel title="Compare Prices" onClose={vi.fn()}>
        <div>panel body</div>
      </Panel>
    );

    const frame = screen.getByRole("dialog");
    const titleBar = screen.getByText("Compare Prices");
    const startLeft = frame.getBoundingClientRect().left;

    // Grab the title bar, then move the pointer 120px to the right.
    fireEvent.pointerDown(titleBar, { clientX: startLeft + 5, clientY: 20 });
    fireEvent.pointerMove(document.body, { clientX: startLeft + 125, clientY: 20 });
    fireEvent.pointerUp(document.body, { clientX: startLeft + 125, clientY: 20 });

    const movedLeft = frame.getBoundingClientRect().left;
    expect(Math.round(movedLeft - startLeft)).toBe(120);
  });

  it("re-anchors when the anchor prop changes", () => {
    // Two anchors at the same (near-left) x but different y. The panel's top
    // tracks the anchor's top; using the vertical axis keeps the assertion
    // independent of the test viewport width (a far-right anchor would clamp).
    addAnchor("anchor-a", 40, 120);
    addAnchor("anchor-b", 40, 360);

    function Harness({ anchor }: { anchor: string }) {
      return (
        <Panel title="Compare Prices" anchor={anchor} onClose={vi.fn()}>
          <div>panel body</div>
        </Panel>
      );
    }

    const { rerender } = render(<Harness anchor="#anchor-a" />);
    const frame = screen.getByRole("dialog");
    const topForA = frame.getBoundingClientRect().top;

    // Re-opening from a different caller changes the anchor prop on the still-
    // mounted panel; it must move to the new anchor, not stay pinned at A.
    rerender(<Harness anchor="#anchor-b" />);
    const topForB = frame.getBoundingClientRect().top;
    expect(topForB).toBeGreaterThan(topForA);
  });

  it("clamps a left-edge anchor so the frame stays on-screen", () => {
    // An anchor hard against the left edge would compute a negative left
    // (anchorLeft - width - 10); the frame must be clamped back on-screen.
    addAnchor("anchor-edge", 0, 200);

    render(
      <Panel title="Compare Prices" anchor="#anchor-edge" onClose={vi.fn()}>
        <div>panel body</div>
      </Panel>
    );

    const left = screen.getByRole("dialog").getBoundingClientRect().left;
    expect(left).toBeGreaterThanOrEqual(0);
  });
});
