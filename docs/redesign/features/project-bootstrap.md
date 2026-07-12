# Feature — Project `.claude` Bootstrap

> Cadrage agreed 2026-07-11 (session with Thomas). Branch:
> `feature/project-claude-bootstrap`. This is the Hestia "bootstrap" promise
> from [`../01-vision.md`](../01-vision.md), built inside the current app (no
> module split — see the status banner in [`../README.md`](../README.md)).

## Problem

Everything in Nakiros is **per entity**: 7 bundled experts (claudemd, rules,
hooks, mcp, permissions, output-styles, subagents) + skill-factory, each with
its own screen and audit/fix/create lifecycle. Nobody looks at the project as
a whole. The user must know what to configure, entity by entity, and nothing
guarantees **cross-entity coherence** (CLAUDE.md content that belongs in a
path-scoped rule, subagents that don't match the repo layout, permissions that
don't match the commands actually used…).

## Decisions (agreed)

1. **v1 = bootstrap mode** — project with an empty or minimal `.claude/`.
   *Recalibrage* of an existing config (merge/restructure) is v2.
2. **Plan validated BEFORE any write.** The agent produces a global
   configuration plan; the user reviews/edits/approves entity by entity;
   only then do writes happen. Same philosophy as the reco-cards flow.
3. **The flow is conversational.** The user can discuss and retouch the plan
   with the expert agent before approving — reuse the existing runner
   interaction model (`waiting_for_input` + `sendUserMessage`, as in
   fix/classify runners). This is the differentiator Thomas cares about.
4. **Conversations are a bonus source, not a requirement.** The codebase alone
   must produce a useful plan; friction digests enrich it when ingest is
   enabled.

## Flow (4 steps)

1. **Analyse** — three crossed sources:
   - the **codebase**: stack, structure, scripts, conventions, monorepo layout;
   - the **existing `.claude/`** via `buildDotClaudeSnapshot` (exists);
   - the **conversation digests** via the V1.1 friction classifier (exists,
     optional).
2. **Global plan** — one coherent proposal covering all entities: what goes in
   CLAUDE.md vs which path-scoped rules, which subagents for the repo layout,
   which permissions for the commands actually run, which hooks, MCP,
   output-styles. Cross-entity coherence is the core value.
3. **Validation** — plan presented per entity; user checks/unchecks/edits and
   can chat with the agent to refine (step 3 ↔ agent loop).
4. **Execution** — writes go through the **existing experts/writers** (no new
   write path); each entity remains auditable afterwards via its normal
   lifecycle.

## Building blocks (all existing)

| Piece | Where |
|-------|-------|
| Full `.claude` inventory | `buildDotClaudeSnapshot` (dot-claude-snapshot-builder.ts) |
| Friction digests | conversation-ingest classifier (V1.1) |
| Per-entity writers/experts | `claude-*-writer.ts` + 7 bundled expert skills |
| Interactive runner pattern | audit/fix/classify runners (`waiting_for_input`, `sendUserMessage`) — see `.claude/rules/runners.md` |
| Plan-validation UX pattern | recommendation cards flow |

## New pieces to build

- **`nakiros-project-bootstrap`** bundled skill — the orchestrator expert
  (follow the skill-factory checklist).
- **Bootstrap runner** — modeled on audit/fix runners, reusing `runner-core`
  primitives; interactive (plan → discuss → approve → execute).
- **Plan artifact type** in `packages/shared/src/types/` —
  `ProjectBootstrapPlan` with per-entity proposals + statuses.
- **IPC family `bootstrap:*`** — respect the 4-file rule
  (`.claude/rules/ipc-contract.md`).
- **Screen** — project-level entry (Setup tab or from Overview), mirroring the
  canonical Skill screen pattern (universal UX constraint).

## Suggested build order (fresh session)

1. `ProjectBootstrapPlan` type + IPC channels (shared).
2. Bundled skill SKILL.md + references (backend scope → `@backend`).
3. Runner + handlers (backend scope → `@backend`).
4. Screen + i18n (frontend scope → `@frontend`).
5. Wire plan-approval → per-entity writers; validation gates per CLAUDE.md.
