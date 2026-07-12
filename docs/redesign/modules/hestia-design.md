# Module — Hestia (detailed design)

> Detailed design for [Hestia](hestia.md). Read [03-module-contract.md](../03-module-contract.md)
> and [05-inter-module-contracts.md](../05-inter-module-contracts.md) first.

## Core model decision: one artefact per provider

We considered a canonical config model (CCM) that would hold provider-neutral
content and project it to several targets via overrides. **We dropped it.**

Reason — grounded in real usage: a project already has a `.claude/` folder **and**
a `.cursor/` folder side by side. Their content genuinely diverges (auto-attach
semantics, provider-only concepts, references to provider-only features). A
shared-content layer would fight reality and add complexity for no payoff.

> **An artefact belongs to exactly one provider.** There is no shared content
> source and no cross-provider override. `.claude` artefacts and `.cursor`
> artefacts coexist as independent things.

What we keep from the abstraction — only the useful parts:

- a **shared artefact taxonomy** (to organise the UI and reason about coverage),
- a **capability matrix per provider** (what exists where),
- **per-provider adapters** (read/write native files),
- the shared **`LifecycleScreen` scaffold** (UX coherence).

## Providers, artefacts, capability matrix

| Artefact (taxonomy) | Claude (`.claude`) | Cursor (`.cursor`) | Codex (`AGENTS.md` / `config`) |
|---------------------|--------------------|--------------------|--------------------------------|
| instructions | `CLAUDE.md` (+ nested) | `.cursor/rules` / `.cursorrules` | `AGENTS.md` |
| rules | `.claude/rules/*.md` | `.cursor/rules/*.mdc` | (within `AGENTS.md`) |
| subagents | `.claude/agents/*.md` | ✗ | ✗ |
| hooks | `settings.json` | ✗ | limited |
| permissions | `settings.json` | auto | approvals (`config.toml`) |
| mcp | `.mcp.json` | `.cursor/mcp.json` | `config.toml` |
| output-styles | `.claude/output-styles/*` | ✗ | ✗ |

*Exact paths/format per provider must be re-verified when building each adapter —
Codex/Cursor conventions move fast. The matrix is the shape, not a frozen spec.*

The matrix drives the UI: for a given provider, only its supported artefact tabs
are shown; unsupported ones are hidden/greyed.

## Adapters

One adapter per provider. An adapter:

- declares its **capability matrix row** (which artefact types it supports),
- **reads** native files into the per-provider artefact model,
- **writes** the artefact model back to native files,
- knows the **scopes** that provider supports and where each is stored
  (project / global / plugin).

Adapters are the only place that knows a provider's file layout and syntax.

## Experts (skills)

One expert per **artefact type**, **provider-aware** — not one per
(artefact × provider). The expert carries the quality/best-practice reasoning;
it is told which provider it is operating on and works on that provider's native
artefact model.

In practice the existing Claude experts (`nakiros-claudemd-expert`,
`-rules-expert`, `-subagents-expert`, `-hooks-expert`, `-permissions-expert`,
`-mcp-expert`, `-output-styles-expert`) are the Claude path. A new provider adds:
its adapter + the provider-specific knowledge each relevant expert needs. No
N×M explosion: an expert that has no meaning for a provider (e.g. output-styles
for Cursor) simply does not run there — gated by the capability matrix.

## Scopes

Orthogonal to provider and artefact: **project / global / plugin**. Each adapter
maps a scope to a location (e.g. Claude project rules in `<repo>/.claude/rules`,
global in `~/.claude/...`). The UI exposes the scope as a selector; the artefact
model carries its scope.

## Conversation-driven bootstrap

For a greenfield project (no code yet): a guided conversation (a skill run on the
shared runner) interviews the user about stack, conventions, and workflow, then
produces **draft artefacts for the chosen provider(s)**. The user reviews them
artefact-by-artefact in the normal `create` flow of `LifecycleScreen`, then the
adapter writes the native files.

Because artefacts are per-provider, the bootstrap targets a chosen provider (or
runs once per provider). No canonical intermediate.

Symmetry with Argos: Argos bootstraps config from **friction in existing
conversations** (`RecoCard`); Hestia bootstraps from a **greenfield guided
discussion**. Different inputs, both produce provider-native artefacts through
the same create flow.

## UI

- A **provider switcher** (the project may have `.claude` and `.cursor` at once).
- Per provider, the artefact tabs its capability matrix allows.
- Each artefact screen is the shared `LifecycleScreen` (audit → fix → eval /
  create), so all providers and all artefacts share one interaction pattern.

## Inter-module: recommendation consumer

Hestia `consumes` `recommendation.consumer:{claudemd, rules, subagent, hook,
permission, mcp, output-style}`. When Argos is installed, cards targeting these
artefact types get an "Apply" action routed to Hestia, which spawns the matching
`create`/`fix` run. See [05-inter-module-contracts.md](../05-inter-module-contracts.md).
Note recommendations are currently Claude-shaped; extending them per provider is
a later step.

## v1 scope

- **Live:** Claude (`.claude` + `CLAUDE.md`) — the existing experts and screens,
  re-homed into the Hestia module with its adapter.
- **Next:** Cursor (`.cursor`) — a real near-term target since the project
  already has a `.cursor/` folder. Add its adapter + capability row.
- **Later:** Codex and others, same recipe.

The architecture supports adding a provider by writing one adapter + the
provider knowledge for the relevant experts. No structural change.

## Deliberately later (not v1)

- **Cross-provider "adapt/import" one-shot.** A convenience action — "create a
  Cursor rule *from* this Claude rule" — as a one-time generation, **not** a live
  shared source. Keeps the simple per-provider model intact while saving typing.
- Per-provider recommendation shapes (Argos producing Cursor-aware cards).

## Open questions for implementation

- Exact current file layout/format for Cursor and Codex adapters (re-verify).
- Provider detection: how Hestia decides which providers a project uses
  (presence of `.claude` / `.cursor` / `AGENTS.md`).
- How much provider-specific knowledge each expert needs vs a shared "convention
  profile" doc per provider.
