# ADR-0001: Adopt the root documentation schema

**Status:** Proposed

**Date:** 2026-06-28

**Category:** Rules

**Affected Areas:** repository documentation layout — root markdown files, `docs/` structure, PRD lifecycle, ADRs

## Context

The repository's documentation had drifted from the schema mandated by the
contributor guardrails (root `CLAUDE.md` axioms), which require:

- Only three docs at the repo root: `README.md`, `ARCHITECTURE.md`, `KEYTERMS.md`.
- All other docs under `docs/`.
- PRDs under a `docs/prds/{backlog,in-progress,finished}` lifecycle.
- Architecture decisions recorded as numbered ADRs under `docs/adr/`.

Actual state before this decision:

- No root `ARCHITECTURE.md` or `KEYTERMS.md`. The canonical architecture blueprint lived at
  `docs/architecture/architecture.md` and the domain glossary at `docs/domain/glossary.md`.
- PRDs lived in a flat, singular `docs/prd/` (5 files); an empty, untracked `docs/prds/backlog`
  also existed.
- No `docs/adr/` directory and zero ADRs.
- Extra root markdown files beyond the schema's three: `AGENTS.md`, `CLAUDE.md`, `CONTEXT.md`,
  `CODE_OF_CONDUCT.md`.

The tension: the existing detailed docs were good and cross-referenced (`AGENTS.md`/`CONTEXT.md`
pointed at them), so naive duplication into root files would have *scattered* documentation —
the very thing the axioms forbid.

## Decision

Bring the repository into compliance with the schema by **promoting** the existing canonical
docs to root rather than duplicating them, and by restructuring the PRD lifecycle:

- **Promote** `docs/architecture/architecture.md` → `ARCHITECTURE.md` (root) and
  `docs/domain/glossary.md` → `KEYTERMS.md` (root). The supporting detail docs
  (`docs/architecture/data_model.md`, `lazy_loading.md`, `migration_guide.md`,
  `future_data_model.md`, and the `docs/domain/*` schemas) stay where they are; all relative
  links were rewired.
- **Restructure PRDs:** create `docs/prds/{backlog,in-progress,finished}` and move all five
  existing PRDs into `docs/prds/finished/` (they document shipped features). Remove the singular
  `docs/prd/`. Empty lifecycle folders are kept tracked with `.gitkeep`.
- **Create `docs/adr/`** for Architecture Decision Records (this ADR and ADR-0000 are the first).
- **Relocate the non-schema root docs** rather than delete them:
  `CONTEXT.md` → `docs/context.md` (a project-overview doc, so it belongs under `docs/`), and
  `CODE_OF_CONDUCT.md` → `.github/CODE_OF_CONDUCT.md` (GitHub recognizes it there, alongside the
  existing community-health files).
- **Keep `AGENTS.md` and `CLAUDE.md` at the root.** These are AI-agent *configuration* files
  (the `CLAUDE.md` → `@AGENTS.md` instruction chain the harness loads), not human documentation,
  so the "three docs only" rule does not apply to them — the same way the contributor's own root
  `CLAUDE.md` is exempt.
- Rewire every inbound reference (`AGENTS.md`, `docs/context.md`, `migration_guide.md`,
  `goods_schema.md`, the moved PRDs) to the new paths.

## Alternatives Considered

| Alternative | Pros | Cons |
|---|---|---|
| (A) Promote detailed docs to root (chosen) | Root files are the real, canonical content; no duplication; satisfies "three docs at root" and "don't scatter" together | Relative links to sibling docs had to be rewired; `git mv` history step |
| (B) Thin root stubs pointing at `docs/` | Minimal change; files "exist" | Root `ARCHITECTURE.md`/`KEYTERMS.md` carry no real content — the schema's first-read intent is defeated |
| (C) Leave `docs/architecture/` + `docs/prd/` as-is | Zero churn | Stays non-compliant; new agents can't rely on the documented layout |
| (D) Delete/merge `CONTEXT.md` into README/ARCHITECTURE | Fewer files | Risky content merge with possible loss; relocation is reversible and preserves the doc |

## Consequences

- The repo root now holds exactly the three schema docs (`README.md`, `ARCHITECTURE.md`,
  `KEYTERMS.md`) plus the two agent-config files (`AGENTS.md`, `CLAUDE.md`).
- Future PRDs follow the `backlog → in-progress → finished` lifecycle; the `/slice-prd`,
  `/to-prd`, and review workflows can rely on it.
- ADRs now have a home (`docs/adr/`) and a numbering convention
  (`adr-NNNN-kebab-title.md`); this ADR and ADR-0000 establish the format.
- All doc cross-references were updated; a repo-wide grep confirms no dangling links to the old
  paths.
- Documentation-only change: no source code, `.map` format, or version impact.
- Git tracked every move as a rename, so file history is preserved.
