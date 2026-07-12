# 01 — Vision

## The pivot

Nakiros started as a workshop for one thing: observing Claude Code usage and
managing a project's `.claude/` — auditing skills, detecting drift, analysing
conversations. That is **one product's worth of value, locked inside one app,
tied to Claude and tied to a project.**

The new strategy: **Nakiros becomes a suite of independent, composable
open-source products for AI agent tooling.** Each product does one job, can be
installed and used on its own, and works across AI agents (Claude today; Codex,
Cursor, and others next), not only Claude.

The umbrella `Nakiros` stops being "the app" and becomes:

1. the **brand/suite**, and
2. the **host runtime** that discovers and runs whichever modules you installed.

## Why now

- The current value is bundled. A user who only wants skill authoring has to
  adopt the whole `.claude` philosophy. A user who only wants drift detection
  carries the skill factory. Unbundling lets each capability find its own
  audience.
- The audience is bigger than Claude. The config formats and agent runners
  differ per tool, but the *jobs* (author a skill/plugin, configure the agent's
  home, watch a conversation, build a knowledge base) are universal.
- A new, large capability is emerging — a **cross-repo knowledge base** (Pinax)
  — that has nothing to do with a single project's `.claude/`. It only makes
  sense as its own product.

## The products

### Techne — skill authoring
Create, audit, evaluate, and improve **Agent Skills** following the open
[agentskills.io](https://agentskills.io) standard — so a skill's content is
identical across providers, and only its install location differs. The signature
feature is **decoupled creation**: author a skill in its own versioned library,
independent of any project, then install it where needed (a project's
`.claude/skills/`, global, a plugin). No proprietary marketplace — sharing is
git/copy. See [`modules/techne-design.md`](modules/techne-design.md).

### Hestia — the agent's home
Configure `.claude` / `.codex` / `.cursor`: CLAUDE.md, rules, subagents, hooks,
permissions, MCP, output-styles. Beyond editing an existing config, Hestia can
**bootstrap from a conversation** — start a project with no code at all and let
a discussion produce the right config from the start.

### Argos — analysis & drift
Analyse a single conversation, detect topic/context drift, and surface friction
patterns across conversations as actionable recommendations. **Optional** — a
project does not need Argos to use the other modules.

> Note: Argos must distinguish genuine **drift** from legitimate **deep-dive**.
> A focused design discussion that explores one decision end-to-end can trip a
> naive topic-transition counter (it did, during the design of this very
> document). This nuance is a first-class requirement, see
> [`modules/argos.md`](modules/argos.md).

### Pinax — the knowledge base
Not per project — **per entity**. A company has many git repos where each
service depends on others; AI (and humans) lose the thread. Pinax analyses code
across repos, builds documentation readable by both humans and AI, and ingests
external context through connectors (Jira, Confluence, …) so an agent simply
*knows more*. This is the largest net-new build; documented here at vision level
only, detailed design in a dedicated session.

## What does not change

- **Open source.** No paywall, no licence tiers. Modules are free.
- **Local-first.** No cloud, no account, no telemetry. Data under `~/.nakiros/`.
- **The runner is shared.** We never re-implement the agent runner per module.

## Strategic shape, one line

> *Install only what you want — `npm install -g @nakirosai/techne` — and if you
> install several modules they share one runtime, one port, one design system,
> and cooperate through typed contracts without ever depending on each other.*

See [`02-architecture.md`](02-architecture.md) for how that is possible.
