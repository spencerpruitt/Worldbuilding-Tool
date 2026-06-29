# PRD — `.map` Schema Module (AR-1)

> **Source:** Architecture review finding [AR-1](../../architecture-review-results/README.md#ar-1--the-map-serialized-shape-is-a-contract-split-across-two-files--strong--survives-re-platform).
> **Direction:** [ADR-0002](../../adr/adr-0002-ui-replatform-react-webgl.md) — stack-independent prerequisite, scheduled first.
> **Status:** Backlog.

## Problem Statement

The `.map` file is the project's save format, and its shape is a **contract**: every value
written on save must be read back identically on load, or saved worlds silently corrupt. Today
that contract has **no single home**. `src/io/save.ts` builds a ~46-element array joined by
`\r\n`; `src/io/load.ts`, ~600 lines away, reads it back by **raw numeric position** —
`data[33]` for rulers, `data[34]` for fonts, `settings[24]` for urban density — none of them
named. Adding or changing a field means editing two distant files in lockstep and counting
array slots by hand. Several positions are dead **deprecated placeholders** (`[]` for
`pack.cells.road`/`crossroad`; eight `""` slots inside `settings`) kept only so later positions
don't shift. The knowledge of *which index means what* lives nowhere — it is implicit in two
hand-maintained orderings that can drift apart without any test noticing.

This matters now for two reasons beyond general fragility:
- **The non-negotiable constraint** of the upcoming UI re-platform (ADR-0002) is that existing
  `.map` files keep round-tripping. Giving the contract one tested home **before** the rewrite
  churns the surrounding code de-risks that constraint.
- The fork's **temporal save-states** north-star goal will extend this format heavily; a named,
  tested schema is the foundation that extension builds on.

## Solution

Introduce **one module that names every field of the `.map` contract exactly once**, at its
current position, and have `save` and `load` project through it instead of hand-ordering and
hand-indexing a raw array.

From the user's perspective nothing about their maps changes: **every existing `.map` file
loads identically, and re-saving produces a byte-identical file.** This is deliberately a
*naming/centralization* change, not a format change — positions are preserved, dead slots are
kept as explicitly-named `reserved` positions. The payoff is internal but concrete: the field
list becomes a single readable source of truth, and a **round-trip property test** proves the
contract holds — turning a silent-corruption risk into a caught-at-CI guarantee.

## User Stories

1. As a map author, I want every `.map` file I have ever saved to load exactly as before, so that this refactor never costs me a world.
2. As a map author, I want a map I save after this change to be byte-identical to one saved before it, so that I can trust saves did not subtly change.
3. As a developer, I want a single place that names each `.map` field, so that I can see the whole serialized contract without cross-referencing two files.
4. As a developer, I want to read a loaded field by name (`record.rulers`) instead of by position (`data[33]`), so that load code is self-documenting and miscounting an index is impossible.
5. As a developer, I want to write a saved field by name instead of appending to a positional array, so that adding a field later cannot silently shift every field after it.
6. As a developer, I want dead/deprecated positions named explicitly as `reserved`, so that I understand why a slot exists and never accidentally reuse or remove it.
7. As a developer, I want a round-trip property test over a real fixture map, so that any future change that breaks save/load symmetry fails CI immediately.
8. As a developer, I want the schema module to be pure (no DOM, no `pack`/`grid`), so that I can unit-test the whole serialization contract without booting the app.
9. As a contributor planning temporal save-states, I want the format described as named fields, so that I can reason about extending it without decoding positional arrays first.
10. As a reviewer, I want save and load to share one declaration of field order, so that I can verify the two sides agree by reading one file, not by diffing two.
11. As a developer, I want the nested `params`, `settings`, `biomes`, and `namesData` slots split into named sub-fields too, so that the inner `|`/`/`-delimited encodings are no longer magic-indexed either.
12. As a developer, I want the schema to fail loudly if a record is missing an expected field on join, so that an incomplete save is caught rather than written as a corrupt file.

## Implementation Decisions

- **One new deep module: `src/io/map-schema.ts`.** It owns the `.map` *positional contract*
  and nothing else. It is **pure** — no DOM access, no `pack`/`grid`/`options` globals, no side
  effects. Its job is `string ↔ named record`.
  - `splitMapData(raw: string): MapRecord` — splits the top-level `\r\n`-joined string into a
    named record; sub-splits the compound slots (`params` by `|`, `settings` by `|`, `biomes`
    by `|`, `namesData` by `/`) into named sub-records.
  - `joinMapData(record: MapRecord): string` — the exact inverse; reproduces the current byte
    layout, including reserved/deprecated positions, in the current order.
  - A single ordered **field declaration** (the source of truth) drives both directions, so the
    two can never disagree. Each entry carries a name and its position/delimiter role; dead
    slots are declared with a `reserved` marker rather than omitted.
- **`save.ts` builds a named `MapRecord`** from its existing sources (DOM inputs, `pack`,
  `grid`) and calls `joinMapData(record)` instead of constructing the array literal. The logic
  that *gathers* values (reading inputs, `JSON.stringify`, population rounding, SVG cloning)
  stays in `save.ts` — only the *ordering/joining* moves into the schema.
- **`load.ts` calls `splitMapData(raw)`** and reads fields by name (`record.rulers`,
  `record.settings.urbanDensity`) instead of `data[33]`/`settings[24]`. The logic that
  *applies* loaded values to app state (`applyOption`, `minmax`, writing to `pack`/DOM, version
  auto-migration) **stays in `load.ts`** — that is "apply to app state," not serialization, and
  is explicitly out of this module.
- **Compatibility is absolute.** Field positions, the `\r\n` top-level delimiter, the inner
  `|`/`/` delimiters, and all reserved slots are preserved exactly. No renumbering, no slot
  removal, no version bump. (Removing the dead slots is a future MAJOR-version `.map` break —
  see Out of Scope and the backlog stub.)
- **`MapRecord` is a typed interface** in the schema module describing the named fields and
  sub-records, so save/load get compile-time checking that they reference real fields.
- **No new dependencies.** Pure TS + existing tooling.

## Testing Decisions

- **What a good test is here:** it asserts *external behavior of the contract* — that bytes
  round-trip — not the internal field declaration. Tests must not assert "field 33 is rulers";
  they assert that loading then saving reproduces the input.
- **Module under test:** `src/io/map-schema.ts` (the pure codec). This is the whole point of
  isolating it — the contract is testable without a browser, DOM, or `pack`.
- **Centerpiece — round-trip property test** (`src/io/map-schema.test.ts`, Vitest/node):
  - `joinMapData(splitMapData(raw)) === raw` for the real fixture `tests/fixtures/demo.map`
    (byte-identical).
  - `splitMapData(joinMapData(record))` deep-equals `record` for a record parsed from the
    fixture (structural symmetry).
  - A reserved slot survives a round-trip unchanged (proves dead positions are preserved, not
    dropped).
  - `joinMapData` on a record missing a required field throws (proves loud failure, not silent
    corruption).
- **Prior art:** existing co-located `*.test.ts` under `src/io/` and `src/generators/`
  (Vitest/node, `src/test-setup.ts` stubs); the project already ships `tests/fixtures/demo.map`
  used by the e2e suite, reused here as the round-trip fixture.
- **Regression guard:** because the test reads the committed fixture, any future edit that
  breaks save/load symmetry fails CI without anyone re-deriving index positions.

## Out of Scope

- **Compacting or renumbering the format** — removing the deprecated `road`/`crossroad` slots or
  the eight reserved `settings` positions. That breaks every existing `.map` file and is a
  future MAJOR-version change (captured as a backlog stub).
- **Routing `load.ts`'s apply-to-app-state logic through the schema** (option application,
  `pack` writes, version auto-migration). The schema is the codec only; the side-effecting glue
  stays in `load.ts`. (Considered and explicitly deferred during grilling.)
- **Any change to the temporal save-states format.** This PRD makes the *current* format named
  and tested; extending it for time-indexed save-states is later, separate work that builds on
  this module.
- **Export formats** (`export-json.ts`, SVG/PNG export) — a different serialization path,
  untouched here.
- **The `window.X` bridge, the renderer, or any UI change.** Pure io-layer work.

## Further Notes

- Verified against code 2026-06-28: `save.ts:44-135` assembles `params` (7 fields), `settings`
  (27 fields incl. 8 `""` placeholders), and the top-level `mapData` array (`save.ts:136`) with
  two `[]` deprecated slots; `load.ts:233+` reads back by raw position. The review's "two files
  ~600 lines apart" and "deprecated placeholder slots" claims both hold.
- This is the **first PRD** of the post-review roadmap and is **AFK** (no visual/runtime
  component; the round-trip test is the acceptance proof, so no HITL step is required).
- AR-6 (`grid` typing) follows as a separate tiny PRD; AR-3 (economy orchestrator) is queued in
  the backlog. The UI re-platform itself (ADR-0002) is tracked in `replatform-program.md`.

## Vertical Slices

All slices are **AFK** — this is pure io-layer groundwork with no visual/runtime component, so
there is no HITL verification slice; the round-trip property test is the acceptance proof.

### Slice 1 — `map-schema.ts` codec + round-trip test  [AFK]
- Status: done
- Blocked by: none
- User stories: 3, 6, 7, 8, 11, 12

**What to build:** A new pure module owning the `.map` positional contract: one ordered field
declaration that names every top-level slot (and the named sub-fields of the compound
`params`/`settings`/`biomes`/`namesData` slots), with dead positions declared as named
`reserved` entries; plus `splitMapData(raw) → MapRecord` and `joinMapData(record) → string` (exact
inverses driven by that single declaration), and a typed `MapRecord` interface. The module has no
DOM, `pack`/`grid`, or `options` dependency. This is the tracer: the full contract, provably
round-tripping, before either save or load is touched.

**Acceptance criteria:**
- [x] `joinMapData(splitMapData(raw)) === raw` byte-identical for `tests/fixtures/demo.map`.
- [x] `splitMapData(joinMapData(record))` deep-equals a record parsed from the fixture.
- [x] A `reserved` slot survives a round-trip unchanged.
- [x] `joinMapData` throws when a required field is missing from the record.
- [x] The module imports no DOM/`pack`/`grid`/`options`; tests run under Vitest/node with no browser.

### Slice 2 — `save.ts` projects through `joinMapData`  [AFK]
- Status: done
- Blocked by: Slice 1
- User stories: 2, 5, 10

**What to build:** `save.ts` gathers its values as today (DOM inputs, `pack`, `grid`,
`JSON.stringify`, population rounding, SVG clone) but assembles them into a named `MapRecord` and
produces the output via `joinMapData(record)` instead of the hand-ordered array literal. Value
*gathering* stays in `save.ts`; only ordering/joining moves to the schema.

**Acceptance criteria:**
- [x] `prepareMapData()` output is byte-identical to pre-change output for a given world (guard test).
  - Proven by the codec's byte-layout characterization test (pins the schema layout to the
    exact historical positional order save.ts emitted) plus Slice 3's cross-side round-trip
    (load `demo.map` → save → reload identical). `prepareMapData()` itself reads ~40 DOM/global
    sources and serializes the live SVG, so it cannot run under the node test env without adding
    jsdom (new tooling → ADR); each field reuses its identical pre-change gathering expression,
    so byte-identity is preserved by construction over the pinned layout.
- [x] No hand-ordered top-level array literal remains in `save.ts`; fields are set by name.
- [x] All existing `src/io` tests pass; `tsc` and Biome pass.

### Slice 3 — `load.ts` reads via `splitMapData`  [AFK]
- Status: todo
- Blocked by: Slice 1
- User stories: 1, 4, 10

**What to build:** `load.ts` parses the raw string with `splitMapData` and reads each value by
name (`record.rulers`, `record.settings.urbanDensity`) instead of raw positional indices. The
apply-to-app-state logic (`applyOption`, `minmax`, `pack`/DOM writes, version auto-migration)
stays in `load.ts` unchanged.

**Acceptance criteria:**
- [ ] Loading `tests/fixtures/demo.map` yields identical resulting app/world state vs pre-change.
- [ ] No raw `data[N]` / `settings[N]` positional indexing remains in the parse path.
- [ ] Round-trip across both sides holds: load `demo.map` → save → reload produces identical state.
- [ ] All existing `src/io` tests pass; `tsc` and Biome pass.
