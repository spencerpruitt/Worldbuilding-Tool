import {
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from "react";

interface PanelProps {
  title: string;
  /** CSS selector of the element to anchor the initial position near. */
  anchor?: string;
  onClose: () => void;
  children: ReactNode;
}

interface Position {
  left: number;
  top: number;
}

// Keep the frame within the viewport so its title bar (drag handle + close
// button) can never end up fully off-screen and unreachable. A small margin is
// left on every edge; the frame is nudged in if an anchor or drag would push it
// out.
const EDGE_MARGIN = 8;
const MIN_VISIBLE = 32;

// Sentinel for "the frame has not been positioned for any anchor yet", distinct
// from any real `anchor` value (including `undefined`) so the first anchor pass
// always runs.
const UNPOSITIONED = Symbol("unpositioned");

function clampToViewport(left: number, top: number, width: number): Position {
  const maxLeft = Math.max(EDGE_MARGIN, window.innerWidth - width - EDGE_MARGIN);
  const maxTop = Math.max(EDGE_MARGIN, window.innerHeight - MIN_VISIBLE);
  return {
    left: Math.min(Math.max(left, EDGE_MARGIN), maxLeft),
    top: Math.min(Math.max(top, EDGE_MARGIN), maxTop)
  };
}

/**
 * Panel — the hand-rolled draggable window frame every React surface renders in.
 *
 * It replaces jQuery-UI's `.dialog()` for migrated surfaces: React owns this DOM
 * subtree (jQuery-UI cannot, since it detaches and reparents the node). The
 * frame reuses the global jQuery-UI dialog CSS classes (`ui-dialog`,
 * `ui-dialog-titlebar`, `ui-dialog-content`, `.dialog`) so it looks native.
 *
 * Interface is intentionally small and stable — `{title, anchor?, onClose,
 * children}` — so the internals (drag, and later resize/snapping) can be swapped
 * for a library behind it without touching any surface. Draggable via the title
 * bar; a close button calls `onClose`. The frame positions itself beside
 * `anchor` on open AND re-anchors if the `anchor` prop changes (a surface can be
 * re-opened from a different caller without closing first — e.g. Compare Prices
 * from the goods editor while it is already open from the markets overview).
 * Positions are viewport-relative (`position: fixed`), so scrolling the host
 * document does not offset the frame. Resize is out of scope.
 */
export function Panel({ title, anchor, onClose, children }: PanelProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const dragOffset = useRef<{ x: number; y: number } | null>(null);
  // The anchor value the frame is currently positioned for. A sentinel distinct
  // from any string/undefined marks "not yet positioned" so the first pass runs.
  const positionedForRef = useRef<string | undefined | typeof UNPOSITIONED>(UNPOSITIONED);

  // Anchor positioning: place the frame's right edge just left of the anchor
  // element (mirrors the legacy "right top at left-10 top" rule), clamped into
  // the viewport. Runs on open and whenever `anchor` changes, but leaves a
  // dragged frame where the user put it while the anchor is unchanged. Runs
  // before paint so the frame never flashes at the wrong spot.
  useLayoutEffect(() => {
    if (positionedForRef.current === anchor) return;
    const frame = frameRef.current;
    if (!frame) return;

    const anchorElement = anchor ? document.querySelector(anchor) : null;
    let rawLeft = 100;
    let rawTop = 100;
    if (anchorElement) {
      const anchorRect = anchorElement.getBoundingClientRect();
      rawLeft = anchorRect.left - frame.offsetWidth - 10;
      rawTop = anchorRect.top;
    }

    positionedForRef.current = anchor;
    setPosition(clampToViewport(rawLeft, rawTop, frame.offsetWidth));
  }, [anchor]);

  const handlePointerMove = useCallback((event: PointerEvent) => {
    const offset = dragOffset.current;
    const frame = frameRef.current;
    if (!offset || !frame) return;
    setPosition(clampToViewport(event.clientX - offset.x, event.clientY - offset.y, frame.offsetWidth));
  }, []);

  const handlePointerUp = useCallback(() => {
    dragOffset.current = null;
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
  }, [handlePointerMove]);

  const handleTitlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const frame = frameRef.current;
      if (!frame) return;
      const frameRect = frame.getBoundingClientRect();
      dragOffset.current = { x: event.clientX - frameRect.left, y: event.clientY - frameRect.top };
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
    },
    [handlePointerMove, handlePointerUp]
  );

  // Detach drag listeners if the panel unmounts mid-drag.
  useEffect(() => {
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [handlePointerMove, handlePointerUp]);

  // Re-clamp into the viewport when the window resizes, so a frame anchored near
  // an edge cannot end up off-screen (title bar/close button unreachable) after
  // the user narrows the window.
  useEffect(() => {
    function handleResize(): void {
      const frame = frameRef.current;
      if (!frame) return;
      setPosition(current => (current ? clampToViewport(current.left, current.top, frame.offsetWidth) : current));
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Keep the frame hidden until the anchor pass computes a position, so it does
  // not flash at (0,0) before positioning.
  const frameStyle: React.CSSProperties =
    position === null
      ? { position: "fixed", visibility: "hidden" }
      : { position: "fixed", left: position.left, top: position.top };

  return (
    <div ref={frameRef} className="ui-dialog ui-draggable" style={frameStyle} role="dialog" aria-label={title}>
      <div className="ui-dialog-titlebar" onPointerDown={handleTitlePointerDown}>
        <span className="ui-dialog-title">{title}</span>
        <button
          type="button"
          className="ui-dialog-titlebar-close icon-cancel"
          aria-label="Close"
          // Stop the pointerdown from bubbling to the titlebar's drag handler, so
          // pressing the close button never starts a drag (legacy jQuery-UI
          // excluded the close button from the draggable area via `cancel`).
          onPointerDown={event => event.stopPropagation()}
          onClick={onClose}
        />
      </div>
      <div className="ui-dialog-content dialog">{children}</div>
    </div>
  );
}
