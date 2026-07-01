import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";

function Boom(): never {
  throw new Error("boom");
}

describe("<ErrorBoundary>", () => {
  it("contains a child render error so siblings keep rendering", () => {
    // React logs caught render errors to console.error; silence it for the test.
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <div>
        <ErrorBoundary label="boom-surface">
          <Boom />
        </ErrorBoundary>
        <span>sibling survives</span>
      </div>
    );

    // The boundary rendered null for the crashing subtree, and the sibling
    // outside it is unaffected (the single root did not tear down).
    expect(screen.getByText("sibling survives")).toBeTruthy();
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
  });
});
