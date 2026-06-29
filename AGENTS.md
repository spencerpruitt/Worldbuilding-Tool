# Worldbuilding Tool — a fork of Azgaar's Fantasy Map Generator

This project began as Azgaar's Fantasy Map Generator (a browser app for procedurally generating, editing, and visualizing fantasy maps) and is being evolved into a full **worldbuilding tool**. Its intent goes well beyond upstream FMG and will require substantive refactors and wholesale new features. North-star goals:

1. **Temporal dimension & save-states** — move beyond a single static snapshot to worlds explorable across time (e.g. cultures, states, and borders evolving on a timeline), with explorable save-states.
2. **Multi-map globes** — natively stitch multiple maps onto one globe/project, and compose multiple `.map` projects together.
3. **Performance** — stay fast and memory-bounded on large worlds (an architectural constraint, not polish).
4. **UI/UX** — improve the editing and exploration experience.

When weighing a change, favor the direction these goals imply; expect the architecture to move toward them. Several touch load-bearing assumptions in today's code (the single-snapshot `.map` model, the single-`pack` world), so substantive refactors are anticipated, not avoided.

Before making architectural decisions, read `docs/context.md` (project overview) and `docs/architecture/original-architecture.md` (a quick map of the current stack and subsystems — the baseline this fork starts from). For deeper knowledge, consult `ARCHITECTURE.md` (the FMG 2.0 target architecture), `KEYTERMS.md` (domain vocabulary), `docs/architecture/data_model.md`, and the decision records in `docs/adr/`.

## Pull request messages

When the user instructs an agent to merge to main (`master`), write a straightforward PR message in the user's style:

- No em-dashes.
- Plain language wherever possible; avoid jargon and filler.
- Direct and to the point. State what the change does and why, without padding.

## Security review

Security review is **invoked manually by the user**, not run automatically by agents. Do **not** launch the `/security-review` skill as part of the Review phase — even for changes that touch input handling, serialization, or filesystem I/O (which CLAUDE.md's default Review checklist would otherwise flag). The `/code-review` skill still runs as usual at Review; the user will run `/security-review` themselves when they want it.
