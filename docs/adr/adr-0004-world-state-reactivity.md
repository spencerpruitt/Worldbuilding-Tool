# ADR-0004: World-State reactivity — a version signal behind the accessor

**Status:** Accepted

**Date:** 2026-07-01

**Category:** Implementation

**Affected Areas:** the World-State accessor (`src/ui/world-state.ts`), a new `useWorldVersion`
hook (`src/ui/use-world-version.ts`), the React economy surfaces that consume it
(`ComparePrices`, `MarketOverview`), and the legacy economy mutation call sites retrofitted to
signal (`good-editor`, `goods-editor`, `markets-overview`). Implements the
[replatform-foundation PRD](../prds/in-progress/replatform-foundation.md) Slice 7 and realizes the
reactivity step ADR-0002/Phase 2 deferred behind the accessor.

## Context

Phase 0–1 stood up React and the first surface (Compare Prices) with **read-on-open snapshot**
semantics: a surface read world data through the [World-State accessor][kt] when it mounted, and a
manual **Refresh** button re-read on demand. That was deliberate — ADR-0002 and the foundation PRD
refused to design the state architecture off a single read-only surface, and left "a real store /
reactivity model" as an explicit Phase 2 item to be introduced *behind the accessor* when a surface
actually needed it.

Slice 7 is that moment. It converts **market-overview**, which (a) must reflect live world state and
(b) itself mutates the world (renaming a market). The app has **no world-change event** to build on:
mutations happen by directly writing `pack`/`Markets`/`Goods` in legacy controllers and calling
domain-core regenerators (`Goods.sync`, `regenerateMarkets`, …). Nothing notifies the UI. So making
a surface "update when world data changes" requires introducing the first change signal, and doing
it without (i) surfaces changing how they call the accessor, (ii) coupling the domain core to the UI,
or (iii) a premature global store that would try to own data that still lives in `window.pack`.

## Decision

Introduce a **single global world-version counter behind the accessor**, consumed via React's
`useSyncExternalStore`. Concretely, `src/ui/world-state.ts` gains three additive exports:

- `notifyWorldChanged()` — bumps a module-level `worldVersion` counter and emits to subscribers.
- `subscribeWorld(listener)` / `getWorldVersion()` — the `subscribe` / `getSnapshot` pair shaped for
  `useSyncExternalStore`.

A tiny `useWorldVersion()` hook wraps that pair. A surface adds **one line** — `useWorldVersion()` —
and uses the returned token as a memo/effect dependency; its accessor reads (`getMarkets()`,
`getGoods()`, …) are otherwise **unchanged**. When the version bumps, the surface re-renders and
re-reads fresh data. The version is an **opaque change token**: only its equality across renders is
meaningful, never its value. It is a signal, not a copy of the data — the data still lives in
`window.pack` and is still read through the same getters.

**Who signals.** Economy mutation **call sites** call `notifyWorldChanged()` after they mutate, at
the **controller layer** — never inside the domain core, so the dependency direction stays
UI → accessor and generators remain UI-agnostic. Covered: `good-editor` (save), `goods-editor`
(restore-defaults, delete-good, regenerate-production), and `markets-overview` (regenerate-markets,
regenerate-production, add/remove market, recolor, bulk delete/recolor, and manual cell
re-assignment). Over-signalling is harmless (an idempotent re-read), so bulk operations signal once
via their existing post-op redraw hook rather than per item.

**Renaming is the deliberate exception.** `renameMarket` (the one mutation the accessor exposes)
mutates `market.name` but does **not** call `notifyWorldChanged`. The rename input fires per
keystroke and changes only metadata — no surface's rows/cells/burgs — so a global bump there would
re-scan and re-render every open surface on every character (a perf regression against the north-star
that the legacy rename, which only retitled, never had). The renaming surface re-renders from its own
input state; other surfaces pick up the new name on their next read/Refresh, matching the legacy
dialogs, which never cross-updated live either. A surface re-syncs its controlled inputs from world
state on a version change (not on local typing), so an external regenerate does not leave a stale field.

A surface's local **Refresh** button is kept (it forces a local re-read without broadcasting a world
change) for parity and for any mutation path not yet retrofitted.

### Alternatives considered

- **Hook an existing redraw path.** Rejected: there is no economy-data redraw path to hook; the
  renderer redraws are layer/geometry-oriented and never fire on markets/goods/deals mutation. We
  would have to invent a signal regardless.
- **Adopt a store library (Zustand/Redux/valtio) now.** Rejected as premature: world data lives in
  `window.pack` owned by the domain core, so a store would only hold the version signal — i.e. this
  counter, plus a dependency and its own ADR. The accessor *is* the seam a real per-entity store
  slots behind later; nothing here blocks that.
- **Per-entity versioning (separate markets/goods/deals counters).** Deferred: at this scale surface
  reads are cheap and memoized, so a single global counter's occasional redundant re-read costs
  nothing, and callers don't need to know which surfaces care. Per-entity scoping is a later
  refinement behind this same interface.

## Consequences

- **Surfaces are reactive with a one-line change and no new read API.** `ComparePrices` and
  `MarketOverview` reflect live edits (verified headlessly); the accessor's read shape is stable, so
  later surfaces copy the same pattern.
- **The accessor is now the reactivity seam, as promised.** A real store or per-entity versioning can
  land by changing only `world-state.ts` and the mutation call sites — never the surfaces.
- **The accessor exposes its first mutation** (`renameMarket`). It is no longer strictly read-only;
  it is the typed mutate-and-signal path. Future mutating surfaces add their mutations here too.
- **Retrofitted legacy signals broaden the blast radius by design.** Editing goods or regenerating
  markets from still-legacy editors now updates any open React economy surface. The cost is extra
  `notifyWorldChanged()` calls at a handful of controller sites; over-signalling is harmless
  (idempotent re-read).
- **Global bumps re-read every open surface.** Acceptable now; if a large world ever makes this
  measurable, per-entity versioning is the escape hatch, unchanged interface.

[kt]: ../../KEYTERMS.md
