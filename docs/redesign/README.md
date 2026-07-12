# Nakiros Redesign — Modular AI Tooling Suite

> **Status (2026-07-11): product vision kept, separate distribution on hold.**
> The migration to separately-installable modules (phases 0–2 were implemented
> on the now-deleted `migration/modular-suite` branch) was stopped by decision:
> the plugin/distribution machinery (per-module npm packages, manifest scan,
> catalog, dynamic front bundles) costs more than it buys while everything
> ships as one package anyway. The **product identities** (Techne, Hestia,
> Argos, Pinax), the naming, and the design principles below remain the target.
> If module separation is revisited, prefer a *modular monolith*: clear
> internal boundaries, one deliverable. Docs 02/03/05/06/07 + `migration-plan.md`
> describe the abandoned distribution design — read them as reference, not plan.

This folder consolidates the product + architecture redesign that turns Nakiros
from a single "Claude `.claude` manager" into a **modular, open-source suite of
independent products for AI agent tooling** — Claude first, but not Claude only.

Nothing here is implemented yet. These documents capture decisions made during
design so the team can build in parallel against a shared, agreed target.

## Reading order

| # | Document | What it answers |
|---|----------|-----------------|
| 01 | [`01-vision.md`](01-vision.md) | Why we pivot, what the products are, the naming |
| 02 | [`02-architecture.md`](02-architecture.md) | One host, one port, modules as in-process plugins |
| 03 | [`03-module-contract.md`](03-module-contract.md) | The `ModuleManifest` contract + module lifecycle |
| 04 | [`04-frontend.md`](04-frontend.md) | Shared shell + `@nakirosai/ui`, modules ship their own screens |
| 05 | [`05-inter-module-contracts.md`](05-inter-module-contracts.md) | The recommendation bridge, `provides`/`consumes` |
| 06 | [`06-package-topology.md`](06-package-topology.md) | The npm package map + `install -g` behaviour |
| 07 | [`07-migration.md`](07-migration.md) | How today's `apps/nakiros` splits into modules (mapping + couplings) |
| 07b | [`migration-plan.md`](migration-plan.md) | The sequenced, PR-by-PR execution plan + risk register |
| 08 | [`modules/`](modules/) | One spec per module: Techne, Hestia, Argos, Pinax |
| 09 | [`features/project-bootstrap.md`](features/project-bootstrap.md) | **Active** — bootstrap the whole `.claude` from the codebase (Hestia promise, built in the current app) |

## Glossary — the products

| Name | Greek root | Scope |
|------|-----------|-------|
| **Nakiros** | — | The suite + the host runtime that loads modules. Not a feature itself. |
| **Techne** | τέχνη, *craft* | Agent Skill authoring (agentskills.io standard), decoupled from any project; installs into a project, global, or a plugin. |
| **Hestia** | Ἑστία, *hearth* | Configuration of the agent's "home": `.claude`, `.codex`, `.cursor` (CLAUDE.md, rules, subagents, hooks, permissions, mcp, output-styles). |
| **Argos** | Ἄργος, *the all-seeing* | Conversation analysis + drift detection + friction-pattern recommendations. Optional module. |
| **Pinax** | πίναξ, *register / index* | Cross-repo, per-entity code knowledge base, readable by humans and AI, fed by connectors (Jira, Confluence, …). The largest net-new build. |

## Principles that hold across every document

- **Open source, no licensing tiers.** Modules are free and composable.
- **Local-first.** No network calls, no telemetry, no accounts. User data lives
  under `~/.nakiros/`.
- **Independence at the dependency level.** Modules never import each other; they
  only communicate through `@nakirosai/shared` contracts.
- **One process, one port.** Installing N modules must not spawn N daemons or N
  URLs. See [`02-architecture.md`](02-architecture.md).
- **Reuse over duplication.** The runner, the design system, and the contracts
  are shared kernels — never re-implemented per module.
