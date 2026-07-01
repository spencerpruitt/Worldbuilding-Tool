# PRD — React Re-platform: Foundation + Phased Migration

> **Direction:** [ADR-0002](../../adr/adr-0002-ui-replatform-react-webgl.md) (Accepted).
> **Program context:** realizes step 2 ("Foundation spike") and seeds steps 3–5 of
> [`replatform-program.md`](./replatform-program.md).
> **Prerequisite:** ADR-0003 (React + build tooling choices) — see Implementation Decisions § Phase 0.
> **Status:** Backlog. Fully specified through **Phase 1**; Phases 2–5 are a sequenced reattack
> roadmap, each surface/phase becoming its own PRD when scheduled.

## Problem Statement

The fork's lead north-star goal is a UI/UX overhaul, and the unfinished part of the codebase
migration *is* the UI layer: ~38 legacy jQuery editors in `public/modules/ui/`, `public/main.js`
(the true entry point), and the ~9,000-line `src/index.html` monolith. The [Domain core][kt]
(generators, world State, io) is already typed and modular and is an asset to preserve, but the
[UI chrome][kt] is a tangle of jQuery-UI dialogs, template-string HTML, and ~150 `window.X`
globals. There is no incremental, low-risk path in place to move that chrome onto React without a
risky big-bang rewrite, and no established pattern a fresh agent can copy to convert one surface at
a time while keeping the app shippable and every `.map` file round-tripping.

We need a **foundation** that stands up React inside the live app safely, plus a **repeatable slice
recipe** so the front end can be re-platformed surface-by-surface over many independent work items.

[kt]: ../../KEYTERMS.md
[Domain core]: ../../KEYTERMS.md
[UI chrome]: ../../KEYTERMS.md

## Solution

Per ADR-0002, re-platform the UI chrome on React (chrome only — **never** the map cells), preserving
the domain core unchanged, executed as **incremental merged slices** with the legacy app live on
`master` until [Cutover][kt]. This PRD delivers the groundwork and the first real slice, then lays
out the phased path to full front-end replacement:

- **Phase 0 — Foundation (AFK).** Pin tooling in ADR-0003, add React to the existing Vite build, and
  bootstrap a single [App-wide React root][kt] rendering a [Minimal shell][kt] that owns zero
  surfaces yet. Prove the build and `.map` save/load are unaffected.
- **Phase 1 — Tracer slice (HITL).** Rebuild the **Compare Prices** [Surface][kt] — a small,
  read-only economy overview — as the first keeper React surface. Retire its jQuery-UI dialog and
  template-string HTML; keep its `open()` trigger seam identical so callers don't change.
- **Phases 2–5 — Reattack roadmap.** Mature the shell as real needs appear (shared state, window
  frame, styling), convert read-only overviews, then mutating editors, coordinate with the hybrid
  renderer track, and finally cut over the entry point and delete the `window.X` bridge + jQuery.

The unit of work is the **Surface**. Each conversion is a self-contained slice: build the React
surface, delete the matching legacy code, verify parity, merge. A fresh agent can pick any unblocked
surface, reassess it against the recipe, and ship it.

## User Stories

### Users of the app

1. As a worldbuilder, I want the app to keep working exactly as before during the migration, so that
   I never lose functionality while the UI is modernized.
2. As a worldbuilder, I want my existing `.map` files to open and save identically after the change,
   so that my worlds are never at risk.
3. As a worldbuilder, I want the Compare Prices panel to show the same data and support the same
   actions (pick a good, refresh, export CSV) after it becomes a React surface, so that the rebuild
   is invisible to me.
4. As a worldbuilder, I want migrated panels to still open, drag, and close like windows, so that the
   editing experience is not degraded mid-migration.
5. As a worldbuilder, I want the app to stay fast and not leak memory over a long session, so that
   modernizing the UI doesn't cost performance.

### Developers / AI agents continuing the migration

6. As an agent, I want one documented "convert a surface" recipe, so that I can rebuild any panel
   without re-deriving the mount/trigger/data-access pattern.
7. As an agent, I want the React app to mount through a single app-wide root, so that adding a
   surface is "register a component," not "wire up new mounting glue."
8. As an agent, I want a stable, typed way to read world State from React, so that I don't sprinkle
   `window.pack` across components and can swap in a real store later without touching surfaces.
9. As an agent, I want a stable window-frame component interface, so that I can upgrade the drag/
   resize implementation once without rewriting every surface.
10. As an agent, I want each converted surface to delete its matching legacy code in the same slice,
    so that the two UIs never drift and the `window.X` bridge shrinks monotonically.
11. As an agent, I want the trigger seam (`open()`) preserved per surface, so that legacy callers of
    a surface keep working until their own conversion.
12. As an agent, I want a clear list of which surfaces are read-only vs mutating and their
    dependencies, so that I can pick an unblocked slice and sequence safely.
13. As an agent, I want a `.map` round-trip check wired into the pipeline, so that any slice that
    perturbs serialization fails fast.
14. As an agent, I want the phases marked AFK vs HITL, so that I know which slices I can complete
    autonomously and which need human verification.
15. As a maintainer, I want the tooling choices captured in an ADR, so that the React/build stack is
    a deliberate, documented decision and not accreted.
16. As a maintainer, I want a defined end-state (single root, no `window.X` bridge, no jQuery), so
    that "done" for the whole program is unambiguous.

## Implementation Decisions

### Aligned decisions (from Align & Plan)

- **The tracer surface is Compare Prices** — chosen because it is small, **read-only** (so `.map`
  cannot be corrupted by it, making the round-trip check a clean signal about the build change), and
  already a typed `src/` controller (so we change one variable — jQuery-UI + template HTML → React —
  not also fight an untyped legacy file). It still retires jQuery-UI for that surface, so it is real
  anti-jQuery progress. It exercises the core chrome seams: read world State, render a list, a
  dropdown that triggers a re-render, a refresh, and a CSV export — with **no renderer coupling and
  no mutation**.
- **The first slice is a keeper, not a throwaway** — the [Tracer slice][kt] is built properly,
  merged, and left live. It sets the patterns later surfaces copy.
- **App-wide React root from slice one** — a single `createRoot` mounted once at boot, rendering an
  `<App>`. Opening a surface flips App state; it does **not** create a per-surface root. This is the
  end-state mounting shape, adopted early so nothing gets ripped out at cutover. Closing a surface
  unmounts its subtree (renders null), satisfying build-on-open/destroy-on-close.
- **Minimal shell guardrail** — `<App>` starts with local state and props only. The global
  world-State store, the context-provider stack, and reactivity are **deferred** until a surface
  actually needs shared state. We do not design the state architecture off one read-only surface.
- **Trigger seam preserved** — each surface keeps its exported `open(...)` signature; only the body
  changes (dispatch into App state instead of building HTML + `.dialog()`). Existing callers are
  untouched. The `window.X` bridge carries the transition and shrinks one surface at a time.
- **React reads world State off the bridge** for now (read-on-open snapshot), through a single typed
  accessor rather than raw `window.pack` in components. Side-effects (CSV download, filename) call
  existing globals.
- **React owns the window frame** — jQuery-UI `.dialog()` cannot wrap React content (it detaches and
  reparents the DOM node, breaking React's control of that subtree). A hand-rolled minimal `<Panel>`
  provides the draggable frame for now; a drag/resize library or real window manager is deferred
  behind the `<Panel>` interface.

### Module sketch (deep modules, simple interfaces)

- **App shell** — owns the single React root and a registry of open surfaces. Interface:
  `openSurface(id, props)` / `closeSurface(id)` and a render of currently-open surfaces. Encapsulates
  all mounting; surfaces never touch `createRoot`. This is the seam that grows to own the whole page
  at cutover.
- **World-State accessor** — one typed read module that wraps the `window.X` bridge (`pack`, `grid`,
  `Markets`, `Goods`, …) so components depend on a stable interface, not globals. When a real store /
  reactivity lands (Phase 2), only this module changes. Kept read-only for now.
- **`<Panel>` window frame** — stable interface (`title`, `anchor`, `onClose`, children), swappable
  internals. Draggable via title bar, close button, initial anchor positioning; resize omitted
  initially (Compare Prices was non-resizable). Reused by every surface.
- **Surface component (`<ComparePrices>`)** — presentational: reads via the accessor, renders the
  goods-comparison table, the good `<select>`, refresh, percentage toggle, and CSV export. Contains
  no mounting or window logic.

### Phase 0 — Foundation (AFK; prerequisite: ADR-0003)

ADR-0003 pins: React + ReactDOM adoption; the Vite React plugin and JSX transform; that React chrome
lives under a new **`src/ui/`** subdirectory (a subfolder of the existing `src/` tree — not a new
top-level directory, so no separate structural ADR is required, but ADR-0003 records the choice);
styling approach for early slices (**reuse existing global CSS classes** so surfaces render
identically — a styling *system* decision is deferred); and the component testing stack
(React Testing Library on the existing Vitest browser runner).

Slices:
- **0a** — ADR-0003 written and accepted (tooling + `src/ui/` + styling-for-now + test stack).
- **0b** — Add React deps, wire the Vite React plugin, add a top-level `#react-root` mount node and
  an app-boot step that creates the single root and renders an empty `<App>` (Minimal shell rendering
  no surfaces). App builds and boots unchanged; existing e2e flows and `.map` save/load pass.

### Phase 1 — Tracer slice: Compare Prices (HITL)

Slices:
- **1a** — Build the App shell module (open/close surface registry) and the World-State accessor
  (read-only wrapper over the bridge).
- **1b** — Build the hand-rolled `<Panel>` window frame.
- **1c** — Build `<ComparePrices>` reading through the accessor; wire its `open(goodId?, anchor?)`
  to dispatch into the App shell. Reach parity: goods dropdown, refresh, percentage toggle, CSV
  export, footer totals, anchor positioning.
- **1d** — Delete the legacy Compare Prices rendering (jQuery-UI `.dialog()` call, template-string
  builders, and the static inner markup in the `index.html` shell), leaving only the trigger seam
  and an empty mount. Confirm the two callers still open the surface. Bridge count drops by one.
- **HITL verification** at end of Phase 1 (visual/runtime) — see Testing Decisions.

### Phases 2–7 — full front-end refactor (the complete gameplan)

The whole front end — ~90 surfaces, ~34.7k LOC (18.9k legacy jQuery in `public/modules/ui/` +
15.8k TS controllers), 31 dialogs, 165 `window.X` globals, and shared machinery (dialog/modal,
tooltips, hotkeys, notifications, bulk-action bar, the menu/tab shell) — is migrated in dependency-
and risk-ordered **waves**. The full census-backed plan, with the surfaces each wave covers and its
entry/exit criteria, lives in **§ Migration Waves** below. Summary of the arc:

- **Phase 2 — Recipe hardening & shell primitives.** Convert 2–3 more read-only overviews; introduce
  a reactivity/store model behind the World-State accessor; settle the `<Panel>` and styling
  decisions. Freeze the "convert a surface" recipe.
- **Phase 3 — Read-only overviews & tools.** Lowest-risk surfaces (no mutation) across all areas.
- **Phase 4 — Mutating editors, by feature area.** Establish the mutate → bridge-redraw pattern;
  cascade/delete logic stays in the domain core; the bulk-action bar is rebuilt as a shared React
  component. Sub-waves: economy → political → map-features → terrain/heightmap.
- **Phase 5 — Presentation & renderer-coupled surfaces.** Style, layers, style-presets, emblems —
  coordinated with the [Hybrid renderer][kt] program (declared layer tree, absorbing AR-5).
- **Phase 6 — App frame & shell chrome.** The trunk, converted last (strangler pattern): the
  menu/toolbar, the Layers/Style/Options/Tools/About tabs, options/settings, IO dialogs, and the
  React-native tooltip/notification/hotkey systems replacing their legacy bridges.
- **Phase 7 — Cutover.** Switch the entry point to the React app; remove the `window.X` bridge;
  delete jQuery/jQuery-UI, `public/main.js`, and the `index.html` monolith (decomposed into the
  React tree + a thin host document + renderer-owned SVG host). Single app-wide root owns the chrome.

## Testing Decisions

Good tests assert **external behavior**, not implementation details: what a user sees and can do,
and that serialization round-trips — not how components are wired internally.

- **`.map` round-trip (regression gate).** Prior art: `src/io/map-schema.test.ts`, `save.test.ts`,
  and the `load-map.spec.ts` e2e. Phase 0 must show that adding React to the build does not change
  save output or load behavior. Because the tracer surface is read-only, this is a clean signal about
  the *build change* alone.
- **App boot e2e.** Extend the existing e2e suite (prior art: `tests/e2e/load-map.spec.ts`,
  `layers.spec.ts`) to confirm the app boots with the React root mounted and existing flows are
  intact.
- **Surface component tests** (React Testing Library on the Vitest browser runner). For
  `<ComparePrices>`: given a stubbed world (Markets/Goods via the accessor), assert the table renders
  the expected rows, changing the good `<select>` re-renders, the percentage toggle switches modes,
  and export produces the expected CSV. Prior art for controller-level unit tests:
  `src/controllers/*-cascade.test.ts`.
- **`<Panel>` component test.** Assert open/close and drag move the frame; close unmounts content.
- **Parity e2e for the tracer.** Open Compare Prices through the real trigger and confirm the table
  and actions match the legacy behavior.

Modules to test: the World-State accessor (read shape), `<ComparePrices>` (behavior), `<Panel>`
(frame behavior), and the App shell open/close registry. The App-boot and round-trip checks run at
the app level.

## Out of Scope

- **Rendering map cells in React** — forbidden by ADR-0002; the map stays in the renderer.
- **The hybrid WebGL+SVG renderer** — its own program/PRD (roadmap Wave 3); this PRD runs against the
  existing SVG renderer.
- **A global world-State store / reactivity model** — deferred to Phase 2, introduced behind the
  World-State accessor when a surface needs it.
- **Converting mutating editors or legacy `public/` jQuery surfaces** — Phases 3+; the tracer is a
  read-only `src/` controller by design.
- **Cutover, bridge removal, and jQuery deletion** — Phase 5, gated on full parity.
- **Multi-map globes and temporal save-states** — separate north-star programs that build on this
  one, not part of reaching UI parity.
- **A window-manager library / resize / snapping** — deferred behind the `<Panel>` interface.

## Further Notes

- **ARCHITECTURE.md** already reflects ADR-0002's React + hybrid-renderer direction; ADR-0003 pins
  the concrete tooling. Update ARCHITECTURE.md if Phase 0 introduces structure (e.g. `src/ui/`)
  worth documenting.
- **Roadmap:** this PRD is the realization of Wave 2's "Re-platform foundation spike." Keep
  `docs/roadmap.md` consistent when this moves to in-progress.
- **Program stub:** `replatform-program.md` remains the higher-level program record; per-surface
  PRDs (Phases 2+) reference it and this foundation PRD.
- **Slice discipline:** every surface conversion deletes its legacy counterpart in the same slice so
  the `window.X` bridge shrinks monotonically and the two UIs never drift.

## Vertical Slices

Detailed, ready-to-build slices for the **foundation and recipe-hardening** phases. Everything past
Slice 8 is planned at the wave level in **§ Migration Waves** and gets sliced into acceptance
criteria when its wave is scheduled (pre-slicing ~90 surfaces now would go stale). Slices are linear
unless noted.

### Slice 1 — ADR-0003: React + build tooling decision  [AFK]
- Status: done
- Blocked by: none
- User stories: 15

**What to build:** The tooling decision record. (Complete — see
[ADR-0003](../../adr/adr-0003-react-build-tooling.md), Accepted.)

**Acceptance criteria:**
- [x] React 19 + `@vitejs/plugin-react` + `jsx: react-jsx` + `src/ui/` + reuse-global-CSS + RTL-on-
  Vitest-browser + Biome `.tsx` are recorded and accepted.

### Slice 2 — React in the build; app-wide root boots empty  [AFK]
- Status: done
- Blocked by: Slice 1
- User stories: 1, 7, 13, 16

**What to build:** Add the React deps, wire the Vite React plugin and tsconfig/Biome changes, and
mount one `#react-root` at boot rendering an empty `<App>` (Minimal shell, zero surfaces). The whole
existing app is otherwise untouched.

**Acceptance criteria:**
- [x] App builds and boots with React mounted; no visual/behavioral change to the legacy app.
- [x] Existing e2e suite passes; a boot e2e asserts the React root is present.
- [x] `.map` save/load round-trip is byte-identical to pre-change (regression gate).
- [x] `biome check` and `tsc` pass with `.tsx` support enabled.

### Slice 3 — Compare Prices opens/closes as a React surface (skeleton) through the preserved seam  [AFK]
- Status: done
- Blocked by: Slice 2
- User stories: 6, 7, 8, 9, 11

**What to build:** The reusable mount path proven with minimal content. Build the App-shell registry
(`openSurface`/`closeSurface`), the read-only World-State accessor over the bridge, and the hand-
rolled `<Panel>` frame. `<ComparePrices>` renders just its title + selected good. `open(goodId?,
anchor?)` dispatches into the shell; both existing callers still open it.

**Acceptance criteria:**
- [x] Triggering `open()` mounts the surface in a draggable `<Panel>`; closing unmounts its subtree.
- [x] The surface reads the selected good through the accessor, not raw `window.pack`.
- [x] Both legacy callers (goods editor, markets overview) open the React surface.
- [x] App-shell open/close and accessor read-shape have component tests.

### Slice 4 — Compare Prices reaches full parity in React  [AFK]
- Status: done
- Blocked by: Slice 3
- User stories: 3, 4

**What to build:** Flesh out `<ComparePrices>` to match legacy behavior end to end, reading through
the accessor and using existing globals for side-effects. This is where the legacy market table,
column sorting, and default-good selection (dropped in the Slice 3 skeleton) are restored — full
parity, nothing silently lost.

**Acceptance criteria:**
- [x] Goods dropdown switches the compared good and re-renders; refresh re-reads; percentage toggle
  switches modes; footer totals compute; CSV export matches legacy output; panel anchors correctly.
- [x] Opening without a `goodId` (e.g. from the markets overview) defaults to the first good and
  renders the full table immediately, matching the legacy auto-select (not the skeleton's "Select a
  good").
- [x] Column headers (Market / Stock / Price) are click-sortable, matching the legacy `applySorting`
  behavior that the skeleton dropped.
- [x] Component tests cover dropdown re-render, percentage toggle, CSV export, and column sorting.

### Slice 5 — Retire legacy Compare Prices; shrink the bridge  [AFK]
- Status: done
- Blocked by: Slice 4
- User stories: 10, 11

**What to build:** Delete the legacy rendering for this surface — the jQuery-UI `.dialog()` call, the
template-string builders, and the static inner markup in the shell — leaving only the trigger seam
and an empty mount node.

**Acceptance criteria:**
- [x] Legacy Compare Prices rendering code and its static shell markup are removed.
- [x] Parity e2e opens the surface via the real trigger and matches prior behavior.
- [x] The `window.X`/dialog surface count drops by one; no dead references remain.

**Deferred to a later shell-hardening slice (Slice 8, recipe freeze):** unify the app-shell open/close
registry with the `SURFACE_COMPONENTS` id→component map into one `registerSurface(id, component)` seam,
so "add a surface" is a single registration and a typo'd/unregistered id can't compile. For now the two
are separate tables keyed by the same id string, and `<App>` reaps (closes + warns once) any surface
opened under an unregistered id.

### Slice 6 — HITL verification: Compare Prices parity + app health  [HITL]
- Status: todo
- Blocked by: Slice 5
- User stories: 1, 2, 3, 4, 5

**What to build:** Single terminal human check of the cumulative visual/runtime behavior of the
tracer, plus general app health.

**Acceptance criteria:**
- [ ] User confirms: open Markets overview → Compare Prices; the panel opens, drags, and closes;
  the goods dropdown, refresh, percentage toggle, and CSV export all behave as before; the map and
  other menus are unaffected; a save/reload round-trips a real `.map`.

### Slice 7 — Reactivity model behind the World-State accessor  [AFK]
- Status: todo
- Blocked by: Slice 6
- User stories: 8

**What to build:** Replace read-on-open with a reactivity/store model *behind the accessor interface*
so migrated surfaces update when world data changes, without surfaces changing how they call the
accessor. Prove it by converting **market-overview** (a small read-only surface that reflects live
state) end to end and retiring its legacy rendering.

**Acceptance criteria:**
- [ ] The accessor exposes a subscribe/read interface; `<ComparePrices>` and `<MarketOverview>`
  update when underlying world data changes, verified headlessly.
- [ ] market-overview reaches parity and its legacy rendering is deleted.
- [ ] The `<Panel>` and accessor interfaces are unchanged by this slice (or the change is recorded).

### Slice 8 — Freeze the "convert a surface" recipe  [AFK]
- Status: todo
- Blocked by: Slice 7
- User stories: 6, 12

**What to build:** Convert **market-deals-overview** and **trade-details** (the remaining small
economy read-onlys) to shake out any last rough edges, then write the canonical surface-conversion
recipe into this PRD / a short doc: mount via shell, read via accessor, frame via `<Panel>`, delete
legacy in-slice, tests to write. This recipe is what later waves follow.

**Acceptance criteria:**
- [ ] Both surfaces reach parity and their legacy rendering is deleted.
- [ ] A written recipe exists that a fresh agent can follow to convert an arbitrary surface.
- [ ] Decisions on the `<Panel>` primitive (keep hand-rolled vs adopt a library) and the styling
  system are recorded (or explicitly deferred with a trigger condition).

## Migration Waves — full front-end gameplan

The complete front end, grouped into dependency- and risk-ordered waves. Each **surface** listed
becomes its own slice (acceptance criteria) when its wave is scheduled; large surfaces
(e.g. `heightmap-editor`, `states-editor`) may warrant their own PRD. The ordering follows a
**strangler pattern**: because every surface keeps its `open()` trigger, the legacy menu/toolbar
keeps launching React surfaces throughout — so we convert the **leaf** dialogs/overviews first and
the **shell frame** (menu, tabs, panels) last, right before cutover.

**Scope census (surfaces to migrate):**

| Area | Read-only overviews/tools | Mutating editors/creators | Notes |
|---|---|---|---|
| Economy & trade | markets-overview, market-overview, market-deals-overview, production-overview, compare-prices*, trade-details, production-chains | goods-editor, good-editor, goods-distribution-editor, trade-animation-editor | all already TS |
| Political | charts-overview, hierarchy-tree | states-editor, provinces-editor, cultures-editor, religions-editor, diplomacy-editor, burg-editor, burg-group-editor, notes-editor | states/cultures/religions TS; provinces/diplomacy/burg/notes legacy |
| Military | military-overview, regiments-overview, battle-screen, view-3d | regiment-editor, units-editor | |
| Map features | routes-overview, rivers-overview, markers-overview | markers-editor, zones-editor, routes-editor/creator/group, rivers-editor/creator, labels-editor, lakes-editor, coastline-editor | overviews/editors mostly legacy |
| Terrain/heightmap | elevation-profile, heightmap-selection, minimap | heightmap-editor, relief-editor, temperature-graph, ice-editor, biomes-editor, world-configurator, ai-generator | heightmap-editor is the largest single surface (1.7k LOC) |
| Presentation | — | style, style-presets, layers, emblems-editor | renderer-coupled (SVG defs/layer tree) |
| Tools/measurement | — | measurers, transform-tool, submap-tool | |
| App frame & IO | about tab | options, save/load/export/png-tiles dialogs, font dialog | the trunk |

\* compare-prices is done in the tracer (Phase 1); listed for completeness.

**Shared machinery** (rebuilt as React-native or bridged until its wave): dialog/modal + `closeDialogs`,
tooltip system (`tip`/`data-tip`, ~1,099 sites), notifications, hotkeys (`hotkeys.js`, 73 bindings),
the bulk-action bar + per-entity adapters, and the menu/tab shell. Cascade/delete **logic** stays in
the domain core (already TS) and is reused, not rebuilt.

### Phase 3 — Read-only overviews & tools  [AFK-heavy]
- **Prereq:** recipe frozen (Slice 8).
- **Surfaces:** the remaining read-only overviews/tools from the census (markets-overview,
  production-overview, charts-overview, military-overview, regiments-overview, hierarchy-tree,
  elevation-profile, production-chains, heightmap-selection, minimap, view-3d, and the legacy
  routes/rivers/markers overviews).
- **Why first:** no world-state mutation → lowest risk; exercises the accessor's read/subscribe path
  across every feature area before we touch editors.
- **Exit:** all read-only surfaces are React; their legacy rendering deleted; bridge shrinks by that
  count.

### Phase 4 — Mutating editors, by feature area  [AFK build, one HITL per feature]
- **Prereq:** Phase 3 (read path proven); the mutate → bridge-redraw pattern established in the first
  sub-wave, then reused.
- **New machinery:** rebuild the **bulk-action bar** as a shared React component with the existing
  per-entity adapters; establish the mutation → renderer-redraw command through the bridge.
- **Sub-waves (least-coupled first):**
  - **4a Economy editors** — goods-editor, good-editor, goods-distribution-editor, trade-animation-editor.
  - **4b Political editors** — burg-editor, burg-group-editor, states-editor, provinces-editor,
    cultures-editor, religions-editor, diplomacy-editor, regiment-editor, units-editor,
    battle-screen, coastline-editor, namesbase-editor, notes-editor.
  - **4c Map-feature editors/creators** — markers-editor, zones-editor, routes-editor/creator/group,
    rivers-editor/creator, labels-editor, lakes-editor, biomes-editor, measurers, transform-tool,
    submap-tool.
  - **4d Terrain/heightmap** — heightmap-editor (own PRD; largest surface), relief-editor,
    temperature-graph, ice-editor, world-configurator, ai-generator.
- **Exit:** all editors are React; cascade/delete logic invoked from the domain core; each sub-wave
  ends with one HITL check for that feature.

### Phase 5 — Presentation & renderer-coupled surfaces  [HITL, coordinate with renderer track]
- **Prereq:** Phase 4; and the [Hybrid renderer][kt] program's **declared layer tree** (absorbing
  AR-5), since these surfaces drive layer visibility, order, filters, and styles.
- **Surfaces:** style, style-presets, layers, emblems-editor.
- **Exit:** styling/layers UI is React and drives the renderer through the declared layer tree, not
  hardcoded SVG id strings.

### Phase 6 — App frame & shell chrome  [HITL]
- **Prereq:** Phases 3–5 (all leaf surfaces converted).
- **Surfaces & machinery:** the menu/toolbar, the Layers/Style/Options/Tools/About tabs, the Tools
  menu dispatch (`tools.js`), options/settings (`options.js`), the IO dialogs (save/load/export/
  png-tiles/font), and the React-native **tooltip / notification / hotkey / dialog** systems that
  replace their legacy bridges and the `editors.js`/`general.js` frameworks.
- **Exit:** the entire chrome is React; the legacy shell scripts are reduced to nothing load-bearing.

### Phase 7 — Cutover  [HITL]
- **Prereq:** feature parity across all surfaces and shared machinery.
- **What:** switch the entry point to the React app; remove the `window.X` bridge; delete jQuery/
  jQuery-UI, `public/main.js`, and the legacy `public/modules/ui/*` scripts; decompose the
  `index.html` monolith into the React tree + a thin host document, with the SVG `<defs>`/layer host
  handed to the renderer.
- **Exit:** single app-wide React root owns all chrome; no jQuery; no `window.X` bridge; `.map`
  round-trips unchanged. End-state of ADR-0002 reached.
