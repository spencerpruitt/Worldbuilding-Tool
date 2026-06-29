# ADR-0000: Repository baseline — architecture, tech stack, and major subsystems

**Status:** Proposed

**Date:** 2026-06-28

**Category:** Architecture

**Affected Areas:** entire repository — the shared orientation reference for all future work

> **Read me first.** This ADR is the "you are here" map for the codebase: what the project is,
> what the stack is, how it boots, and what the major subsystems are. It is deliberately a
> **living baseline** (see Consequences) — kept current rather than frozen. It does not introduce
> new structure; it records the current state and points into the deeper docs
> (`ARCHITECTURE.md`, `KEYTERMS.md`, `docs/architecture/data_model.md`,
> `docs/domain/generation_pipeline.md`, and the `docs/domain/*` schemas).

## Context

This repository is a fork of Azgaar's **Fantasy Map Generator (FMG)** — a browser app that
procedurally generates, edits, and visualizes fantasy maps (terrain, climate, rivers, cultures,
states, burgs, economy, …). It is mid-migration from a large, tightly-coupled vanilla-JS app
toward the modular, typed **"FMG 2.0"** architecture described in `ARCHITECTURE.md`.

The codebase is large (~52k lines of TypeScript under `src/`, plus a ~9k-line `src/index.html`
monolith and a shrinking body of legacy JavaScript under `public/`). New contributors and AI
agents repeatedly pay an orientation tax: reverse-engineering the stack, the boot sequence, and
the subsystem map before they can make a safe change. The deep docs exist but no single entry
point ties **tech stack + runtime flow + subsystem map** together. ADR-0000 is that entry point.

## Decision

Record the following as the canonical baseline. Future ADRs amend specific parts of it.

### 1. What the project is

- **Purpose:** procedural generation, editing, and visualization of fantasy maps for writers,
  game masters, and cartographers.
- **Runs entirely in the browser** — no server does the heavy lifting — on maps of up to
  hundreds of thousands of cells. Speed and a low memory footprint are therefore *architectural
  constraints*, not polish (see `ARCHITECTURE.md` → Performance & Resource Discipline).
- **Single serializable world.** All map state must round-trip losslessly into one `.map` file.

### 2. Tech stack & tooling

| Concern | Choice | Notes |
|---|---|---|
| Language | **TypeScript ~5.9** (`tsconfig.json`) | `strict`, `noUnusedLocals/Parameters`, `@/* → src/*` alias, `noEmit` (Vite transpiles) |
| Bundler / dev server | **Vite ~8** (`vite.config.ts`) | root = `src/`, output = `dist/`, static passthrough = `public/`; base path conditional (Netlify `/` vs GH Pages `/Fantasy-Map-Generator/`) |
| Lint / format | **Biome ~2.4** (`biome.json`) | 2-space indent, 120 cols, double quotes, semicolons, no trailing commas; `any` allowed; runs on a `simple-git-hooks` pre-commit |
| Unit tests | **Vitest ~4** (`vitest.config.ts`, node env) | `*.test.ts` co-located in `src/`; `src/test-setup.ts` stubs `window`/`document` so DOM-touching modules load |
| Browser tests | **Vitest browser mode** (`vitest.browser.config.ts`) | Playwright-driven Chromium for DOM-dependent units |
| E2E | **Playwright ~1.57** (`playwright.config.ts`) | specs in `tests/e2e/`; fixture `tests/fixtures/demo.map`; **never run automatically during dev** |
| Runtime | **Node 24** (CI + Docker + Netlify) | |

**Production dependencies** (npm, bundled into `src/`):

| Package | Role |
|---|---|
| `d3` (v7) | geometry, scales, projections, selections/zoom for new code (note the dual-d3 caveat below) |
| `delaunator` | Delaunay triangulation underpinning the Voronoi grid and route graphs |
| `alea` | seedable PRNG for deterministic generation |
| `lineclip` | polyline/polygon clipping (resampling, rendering bounds) |
| `polylabel` | optimal interior label placement for regions |
| `three` (v0.184) | WebGL for the 3D view, satellite texture, erosion bake |
| `driver.js` | interactive UI tour |

**Vendored legacy globals** (`public/libs/*.min.js`, loaded via `<script>` for classic
`public/**/*.js` only — *not* npm): **d3 v5**, **jQuery + jQuery UI** (the `$(...).dialog()`
panels), three (older), simplify, etc. These shrink as modules migrate.

> **Dual-d3 caveat.** Bundled code imports **d3 v7** from npm; legacy code uses the **d3 v5**
> global. They are not interchangeable — e.g. `src/io/load.ts` deliberately re-selects layers
> with the global v5 `d3.select` after a load because legacy zoom/`d3.event` handlers depend on
> v5 semantics. Mixing versions on the same selection is a real bug source.

### 3. The four-layer architecture

The conceptual model (see `ARCHITECTURE.md` for the full treatment):

```
settings → GENERATORS → WORLD (state: data + style) → { EDITORS | RENDERERS }
              (Model)        (single serializable        (Controllers)  (View)
                              pack/grid + config)
```

Folders are named by **role**, so every file has an obvious home:

| Folder | Layer | Holds | ~size |
|---|---|---|---|
| `src/types/` | State (shape) | shared TS interfaces / domain models (`PackedGraph`, `global.ts`) | 2 files |
| `src/generators/` | Generators (Model) | procedural generators + domain logic (incl. `emblems/`) | ~39 files |
| `src/renderers/` | View | code that draws SVG/WebGL layers (incl. `emblems/`) | ~35 files |
| `src/controllers/` | Editors / UI | editors, tools, overviews, settings panels, `bulk-action/` | ~55 files |
| `src/io/` | — | save / load / export / serialization | 9 files |
| `src/services/` | — | app-shell & platform infra (install, fonts, autosave) | 5 files |
| `src/data/` | — | static reference content (templates, supporters) | 1 file |
| `src/utils/` | — | pure, dependency-free helpers | 19 files |

Load-bearing rules: generators never touch DOM/SVG; renderers are idempotent, read-only, no
business logic; editors are thin (mutate state → ask renderer to redraw); the whole world stays
serializable. See `ARCHITECTURE.md` → Module Design & Layer Responsibilities.

### 4. World data model (State)

Two global structure-of-arrays graphs (typed in `src/types/`; full spec in
`docs/architecture/data_model.md`, vocabulary in `KEYTERMS.md`):

- **`grid`** — the initial jittered-grid Voronoi *before* repacking: per-cell typed arrays
  (`h` height, `t` terrain distance field, `f` feature, `temp`, `prec`) and `grid.features`.
- **`pack`** — the repacked Voronoi (most ocean discarded, coasts densified): the primary store.
  Per-cell parallel typed arrays (`pack.cells.h/biome/burg/state/province/religion/culture/
  pop/r/fl/s/area/good/market/…`) plus the entity collections: `burgs`, `states`, `cultures`,
  `religions`, `provinces`, `rivers`, `routes`, `zones`, `markers`, `ice`, `goods`, `markets`,
  `deals`, `features`.

Discipline: per-cell data is typed arrays (not arrays of objects); canonical data only (derived
lookups are rebuilt, not serialized); mutate in place through the owning generator.

### 5. Generation pipeline

A map is built by an ordered sequence orchestrated in **`public/main.js` → `generate()`** (the
legacy true entry point; see §9). Conceptually:

```
seed → heightmap → features/hydrology → climate (temp, precip) → repack →
rivers → biomes → ice → goods → cultures → burgs → states → routes →
religions → provinces → names → ECONOMY (markets → production → taxes) →
military → markers → zones → finalize
```

Each stage is a generator that reads `pack`/`grid` + options and mutates world state. Emblems
(`COA.generate()`) are produced inline within Burgs/States/Provinces, not as a separate stage.
The pipeline phases are documented in `docs/domain/generation_pipeline.md`. Nearly all generators
are TS-migrated; six have unit tests (`burgs`, `states`, `routes`, `rivers`, `goods`, `markets`).

### 6. Major subsystems

- **Economy** (the largest domain subsystem): `goods-generator` (catalogue, distribution,
  recipes, multipliers) → `markets-generator` (regional hubs anchored to burgs, pricing) →
  `production-generator` (per-burg worker loop, global trade, the `deals` log) →
  `States.collectTaxes()` (sales tax on deals + poll tax → `state.treasury`). Schemas:
  `docs/domain/{goods,production,trade}_schema.md` and `docs/domain/taxes.md`.
- **Heraldry / emblems** (cross-layer): `src/generators/emblems/` builds Armoria-compatible coats
  of arms (registers `window.COA`); `src/renderers/emblems/` draws them (registers
  `window.COArenderer`). The shared `emblems/` name signals one feature spanning two layers.
- **3D view**: `src/controllers/view-3d.ts` lazily loads `src/renderers/view-3d-renderer.ts`
  (three.js); `erosion-bake.ts` precomputes terrain detail.
- **Bulk Action Bar**: `src/controllers/bulk-action/` — a type-agnostic multi-select/delete core
  with per-entity adapters, bridged to legacy menus via `window.bulkBars` (see
  `docs/prds/finished/bulk-action-bar.md`).
- **Names**: `names-generator.ts` — Markov-chain name generation from `nameBases`.

### 7. Rendering

Renderers project `pack` state into SVG `<g>` layer groups (ocean, biomes, rivers, states,
routes, relief, markers, emblems, goods, markets, trade-animation, labels, …). The pattern is
*clear group → build one HTML/SVG string → inject in a single write* — vanilla DOM, no virtual
DOM. The layer groups and `<defs>` (gradients, filters, patterns, glyphs) are declared in the
**`src/index.html` monolith**, which renderers reference by hardcoded element id — an implicit,
load-bearing coupling. A `trade-animation` engine is the rare stateful renderer (owns frames +
an explicit reset).

### 8. IO / persistence

- **`.map` format** (`src/io/save.ts` + `load.ts`): a single string of ~46 fields joined by
  `\r\n`, read back by **positional index**. The serialized shape is a contract — every written
  field must be read back, or saves silently corrupt. (This positional split is a known fragility;
  the architecture review flags consolidating it behind a schema.)
- **Save targets**: browser IndexedDB (autosave + "last map"), local file via the File System
  Access API (`save-to-file.ts`, with a Downloads fallback), and Dropbox (`cloud.ts`).
- **Export**: `export.ts` (SVG / PNG / JPEG / tiled PNG via `getMapURL()` canvas pipeline),
  `export-json.ts` (full / minimal / GeoJSON).
- **`auto-update.ts`**: migrates older `.map` data to the current schema on load.

### 9. Bootstrap & runtime flow

1. `src/index.html` loads the bundled `src/**/index.ts` entry modules (utils → generators →
   renderers → controllers → services → lazy-loaders), which register their `window.X` globals,
   then the legacy `public/modules/**/*.js` (deferred `<script>` tags), then `public/main.js`.
2. **`public/main.js` is the true entry point**: it creates the SVG layer hierarchy, the global
   `pack`/`grid`/`options`/`style` objects, sets up d3 zoom, and on `DOMContentLoaded` either
   loads a map (URL/seed/storage) or runs `generate()` (§5) then draws the layers.
3. Editors/overviews/exporters are **lazy-loaded** on demand (`src/lazy-loaders.ts`, exposed as
   `window.lazy`) to keep the initial bundle small.

### 10. The migration seam: the `window.X` bridge

Bundled ES modules (`src/`) and un-bundled classic scripts (`public/modules/**/*.js`, which
cannot `import`) interoperate through ~150+ **`window.X` registrations**: generator instances
(`window.Burgs`, `window.States`, `window.Goods`, …), renderer toggles (`window.drawGoods`, …),
utilities (`window.ensureEl`, `window.tip`, `window.lazy`), and feature bridges (`window.COA`,
`window.COArenderer`, `window.bulkBars`). This is a **deliberate, temporary, documented seam**
(`ARCHITECTURE.md` → Cross-layer subsystems): as each legacy menu migrates to TS it drops its
bridge and imports directly. New code should treat `window.X` as the legacy interop boundary, not
a general-purpose namespace.

### 11. Testing

- **Unit** (`npm run test`, Vitest/node): ~26 `*.test.ts` co-located in `src/` (utils,
  generators, cascades, io, some renderers).
- **Browser** (Vitest browser mode): DOM-dependent units in real Chromium.
- **E2E** (`npm run test:e2e`, Playwright): ~9 specs in `tests/e2e/` against a built preview;
  HTML snapshots. **Do not run Playwright automatically while developing.**

### 12. Build, versioning & deploy

- **Scripts**: `dev` (Vite), `build` (`tsc && vite build`), `preview`, `test`, `test:e2e`,
  `lint` (`biome check --write`), `prepare` (install git hooks).
- **Versioning**: source of truth is `public/versioning.js` (`VERSION`), mirrored to
  `package.json`/lock. MAJOR = breaks `.map`; MINOR = `.map` additions needing auto-migration;
  PATCH = everything else. On merge to `master`, a workflow uses an AI model to classify the diff
  and `scripts/bump-version.js` bumps the version and refreshes `?v=` cache-busting hashes.
- **CI** (`.github/workflows/`): `lint` (Biome), `unit-tests`, `playwright` (cached build +
  browsers), `bump-version`, `deploy`.
- **Deploy**: GitHub Pages (`deploy.yml`) and Netlify (`netlify.toml`); a multi-stage
  `Dockerfile` serves `dist/` via nginx with security headers; a Workbox service worker
  (`public/sw.js`) + `manifest.webmanifest` provide PWA/offline support.

### 13. Migration status & known sharp edges

- Generators are essentially fully TS-migrated; most editors/tools and the `index.html` UI shell
  remain legacy. Legacy code lives in `public/modules/ui/*.js`.
- **Implicit global state** (`pack`/`grid` on `window`) is pervasive — refactor with care.
- **`src/index.html`** is a ~9k-line monolith holding the UI shell, SVG `<defs>`, and CSS; do not
  attempt large structural edits to it in one pass.
- **`grid` is typed `any`** in `src/types/global.ts` (while `pack` is `PackedGraph`) — a known
  typing gap flagged for a quick win.

### 14. Where things live (quick map)

- Mutates world state from user input → editor in `src/controllers/`
- Presents state read-only (dialog/chart/list) → overview in `src/controllers/`
- Draws an SVG/WebGL layer → `src/renderers/`
- Generates/simulates world data → `src/generators/`
- Serializes / saves / loads / exports → `src/io/`
- Browser/app lifecycle or platform asset → `src/services/`
- Constant list / template, no behavior → `src/data/`
- Pure reusable helper → `src/utils/`
- Shared type / interface → `src/types/`
- Deep architecture rationale → `ARCHITECTURE.md`; domain vocabulary → `KEYTERMS.md`;
  decisions → `docs/adr/`; specs/PRDs → `docs/prds/`.

## Alternatives Considered

| Alternative | Pros | Cons |
|---|---|---|
| (A) A single living baseline ADR-0000 with pointers into deep docs (chosen) | One canonical orientation entry; consolidates stack + runtime + subsystem map; doesn't duplicate the deep docs | Must be actively maintained or it goes stale; bends the usual "immutable, one-decision" ADR shape |
| (B) Fold the baseline into `ARCHITECTURE.md` | No new file | Mixes a *current-state snapshot* with the *target blueprint*; bloats an already-large doc |
| (C) No baseline doc; rely on the scattered deep docs | Zero maintenance | Agents keep re-deriving the stack/boot/subsystem map — the exact orientation tax this removes |

## Consequences

- **This ADR is a living exception to ADR immutability.** Normal ADRs are frozen once accepted;
  ADR-0000 is the shared baseline and must be *updated* as the architecture moves. The trigger:
  whenever a later ADR changes a structural fact recorded here, update the relevant section of
  ADR-0000 in the same change and link the amending ADR. A stale baseline is worse than none.
- It **complements, not duplicates** `ARCHITECTURE.md` (target blueprint), `KEYTERMS.md`
  (vocabulary), and `docs/architecture/data_model.md` (data spec): those remain the source of
  truth for their domains; ADR-0000 links to them.
- Onboarding cost for new contributors/agents drops: one read establishes the lay of the land.
- No source code, `.map` format, or version impact (documentation only).
- Counts and versions herein are approximate snapshots as of the date above; treat the cited
  files (`package.json`, `tsconfig.json`, the `src/` tree) as authoritative when they disagree.
