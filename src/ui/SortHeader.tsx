/**
 * SortHeader — a clickable, keyboard-operable column header shared by every
 * table surface (Compare Prices, Market Overview, Market Deals, Trade Details).
 *
 * It is rendered as a `<div>` (not a `<button>`) so it keeps the legacy grid-cell
 * look that the `.header` CSS grid lays out, while carrying the legacy
 * `data-sortby` marker, `data-tip` tooltip, and `sortable`/`icon-sort-*` classes.
 * Generic over the surface's own sort-key union so each surface stays type-safe.
 */

/** Sort direction shared by the table surfaces. */
export type SortDirection = "up" | "down";

/**
 * Build the header's class string the way the legacy `applySorting` did: the base
 * `sortable` class (plus `alphabetically` for name columns), and — only on the
 * active column — the `icon-sort-{name|number}-{direction}` indicator.
 */
export function sortableHeaderClass(isActive: boolean, isAlphabetical: boolean, direction: SortDirection): string {
  const base = isAlphabetical ? "sortable alphabetically" : "sortable";
  if (!isActive) return base;
  const type = isAlphabetical ? "name" : "number";
  return `${base} icon-sort-${type}-${direction}`;
}

interface SortHeaderProps<Key extends string> {
  label: string;
  sortKey: Key;
  className: string;
  dataTip: string;
  onSort: (key: Key) => void;
  style?: React.CSSProperties;
}

export function SortHeader<Key extends string>({
  label,
  sortKey,
  className,
  dataTip,
  onSort,
  style
}: SortHeaderProps<Key>) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: must stay a grid-cell <div> so the legacy `.header` CSS grid lays it out; the keyboard handler below gives it button semantics.
    <div
      role="button"
      tabIndex={0}
      className={className}
      data-sortby={sortKey}
      data-tip={dataTip}
      style={style}
      onClick={() => onSort(sortKey)}
      onKeyDown={event => {
        if (event.key === "Enter" || event.key === " ") onSort(sortKey);
      }}
    >
      {label}&nbsp;
    </div>
  );
}
