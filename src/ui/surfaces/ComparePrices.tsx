import { Panel } from "../Panel";
import { getGood } from "../world-state";

interface ComparePricesProps {
  /** Registry-supplied id of the good to compare (from the `open()` seam). */
  goodId?: number;
  /** CSS selector the panel anchors near on open. */
  anchor?: string;
  onClose: () => void;
}

/**
 * ComparePrices — the tracer surface, SKELETON form (Slice 3).
 *
 * Presentational only: it reads the selected good through the World-State
 * accessor (never raw `window.pack`) and renders just its title and the good's
 * name. The full table / dropdown / percentage toggle / CSV export is Slice 4;
 * this slice exists to prove the mount path (registry → App → Panel → surface).
 */
export function ComparePrices({ goodId, anchor, onClose }: ComparePricesProps) {
  const good = goodId !== undefined && goodId >= 0 ? getGood(goodId) : undefined;

  return (
    <Panel title="Compare Prices" anchor={anchor} onClose={onClose}>
      <div>{good ? good.name : "Select a good"}</div>
    </Panel>
  );
}
