# PRD — Type the `grid` Global (AR-6)

> **Source:** Architecture review finding [AR-6](../../architecture-review-results/README.md#ar-6--type-the-grid-global--strong-small--survives-re-platform).
> **Direction:** [ADR-0002](../../adr/adr-0002-ui-replatform-react-webgl.md) — stack-independent; scheduled right after AR-1.
> **Status:** Done (merged to `master`).

## Problem Statement

The world is held in two global structure-of-arrays graphs: **`pack`** (the repacked Voronoi,
the primary store) and **`grid`** (the initial jittered grid *before* repacking). `pack` is typed
`PackedGraph` and checked across ~1,191 references, but its sibling **`grid` is typed `any`**
(`src/types/global.ts:11`). Roughly 150 `grid.*` accesses across generators, renderers, and io go
completely unchecked: a misspelled field (`grid.cell` for `grid.cells`), a wrong element type, or
a shape that drifts as code changes produces no compile error — it surfaces as a runtime bug or
silent `undefined`. A core domain entity is hiding behind `any`.

This is the **cheapest high-leverage win** in the architecture review (~50 lines of interface
consulted by ~150 call sites) and is **stack-independent** — it pays off no matter how the UI
re-platform (ADR-0002) proceeds, and it hardens the renderer-agnostic state boundary that the
hybrid WebGL+SVG renderer will read through.

## Solution

Write a **`GridGraph` interface** mirroring `PackedGraph` (same typed-array discipline, same
`cells`/`vertices` shape conventions) describing `grid`'s actual fields, and point `var grid` at
it instead of `any`. Fix the type errors that surface — most will be trivial, and any that reveal
a genuine latent bug get a regression test per the bug rule. No runtime behavior changes; this is
a types-only hardening.

From a developer's perspective: after this, `grid.cells.h` autocompletes and type-checks the same
way `pack.cells.h` already does, and a typo in a `grid` field name fails the build instead of
shipping.

## User Stories

1. As a developer, I want `grid` typed like `pack`, so that a misspelled or wrong-typed `grid` field fails at compile time instead of at runtime.
2. As a developer, I want autocomplete on `grid.cells.*` and `grid.*`, so that I can discover the grid's shape without grepping its construction code.
3. As a developer reading a generator that consumes `grid`, I want each field's meaning documented in one interface, so that I understand the pre-repack data without reverse-engineering it.
4. As a contributor planning the hybrid renderer, I want both world graphs strongly typed, so that the renderer reads state through a checked contract.
5. As a maintainer, I want `grid` to stop being an `any` escape hatch, so that future code cannot silently access nonexistent grid fields.
6. As a reviewer, I want the change to be types-only with no behavior change, so that I can approve it by confirming `tsc` passes and nothing else moved.

## Implementation Decisions

- **New interface `GridGraph` in `src/types/`** (beside `PackedGraph`), mirroring `PackedGraph`'s
  conventions (`TypedArray` for per-cell parallel arrays; plain arrays for index/neighbor lists).
  `src/types/global.ts:11` changes from `var grid: any` to `var grid: GridGraph`.
- **Field set is derived from the authoritative source**, not guessed: `grid` is constructed in
  the legacy bootstrap (`public/main.js`, grid generation) and consumed across the codebase. The
  interface must cover at least the verified-in-use fields:
  - `grid.cells`: `i` (indices), `b` (border flag), `c` (neighbor cells), `v` (neighbor
    vertices), `h`/`t`/`f`/`prec`/`temp` (typed arrays — height, terrain-distance, feature,
    precipitation, temperature).
  - `grid.vertices`: same shape as `pack.vertices`.
  - grid-level: `spacing`, `cellsDesired`, `cellsX`/`cellsY`, `boundary`, `points`, `features`
    (`Feature[]`), `seed`, and any of `columns`/`rows` actually present at construction.
- **Shadowing gotcha (load-bearing):** a naive `grid.*` grep produces false positives —
  `grid.append`, `grid.appendChild`, `grid.selectAll`, `grid.style` come from **local variables
  also named `grid`** (d3 selections / DOM elements, e.g. the grid-overlay layer), **not** the
  world graph. `GridGraph` must **not** include these; the implementer verifies each ambiguous
  access resolves to the global graph before typing it.
- **Reuse `PackedGraph`'s shared types** (`TypedArray`, `Feature`) rather than redeclaring them.
  Where `grid` and `pack` share a sub-shape (e.g. `vertices`), factor the shared type so the two
  interfaces stay consistent.
- **No `window.X` bridge change, no runtime change.** Types only. If retyping surfaces a real bug
  (a genuine wrong-field access), fix it with a regression test as a clearly-labeled separate
  commit (bug rule), rather than papering over it with a cast.
- **No `any` left on `grid`** at the end (no `as any` escape hatches added to make errors go
  away — fix the type or the call site).

## Testing Decisions

- **What a good test is here:** AR-6 is a *type-level* change, so the primary "test" is the
  **compiler** — `tsc` (which CI already runs via `npm run build`) passing with `grid` fully typed
  *is* the proof. Tests assert external behavior, and there is no behavior change to assert.
- **No new unit tests for the typing itself** (testing that types compile is the compiler's job,
  not a runtime test).
- **Regression tests only where a real bug is found.** If retyping reveals a latent defect (a
  field accessed that never existed, a wrong element type relied upon), that fix ships with a
  focused regression test that fails without the fix — co-located `*.test.ts`, Vitest/node, per
  existing prior art in `src/generators/` and `src/io/`.
- **Existing suite must stay green** (`npm run test`) — confirms no behavior drift.

## Out of Scope

- **Removing or reshaping the `window.X` bridge**, or making `grid` a non-global. Typing only.
- **Refactoring grid construction** or unifying `grid`/`pack` into one structure (a much larger,
  state-model change tied to the multi-map north-star goal).
- **Typing the shadowed local `grid` variables** (d3 selections / DOM nodes) — those already have
  their own correct types; the work is to *not* conflate them with the graph.
- **Any renderer/UI change.**

## Vertical Slices

Single **AFK** slice — pure types groundwork, no visual/runtime component; the compiler is the
acceptance proof.

### Slice 1 — `GridGraph` interface + retype `var grid`  [AFK]
- Status: done
- Blocked by: none
- User stories: 1, 2, 3, 4, 5, 6

**What to build:** Add a `GridGraph` interface in `src/types/` mirroring `PackedGraph`'s
conventions and covering `grid`'s real fields (cells subset + grid-level fields + vertices),
reusing shared types. Change `var grid: any` → `var grid: GridGraph`. Resolve the resulting
`tsc` errors, distinguishing genuine world-`grid` accesses from shadowed local `grid` variables
(do not type the latter into the interface). Any latent bug uncovered is fixed with a regression
test as a separate labeled commit.

**Acceptance criteria:**
- [x] `src/types/global.ts` declares `var grid: GridGraph` (no `any`).
- [x] `GridGraph` covers every field accessed on the global grid graph; no field is left implicitly `any`.
- [x] No `as any` / `@ts-ignore` was added to silence grid typing errors.
- [x] Shadowed local `grid` variables (d3/DOM) are left untouched and are not part of `GridGraph`.
- [x] `npm run build` (`tsc`) and `npm run test` both pass; no runtime behavior change.

> **Optional split** if retyping surfaces a large error count: do `grid.cells` (the typed arrays,
> highest-traffic) first, then grid-level fields. Only split if the single slice proves unwieldy.
