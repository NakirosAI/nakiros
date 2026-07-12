# 07 — Migration

How today's monolith (`apps/nakiros`: 39 IPC handlers, ~70 services +
`apps/frontend`) splits into the kernel + four modules. This is mostly an
**extraction** exercise, not a rewrite — the "experts" and skill factory are
already bundled skills run through the runner.

## Backend mapping

### Kernel — `@nakirosai/{host, runner, shared, ui}`

- `services/runner-core/*` (16 files: claude-binary, claude-stream, run-store,
  session-jsonl, session-usage, git-worktree, isolated-home, …) → `runner`
- `services/service-manager/*` (launchd, systemd, paths) → `host`
- `daemon/*` (event-bus, port, server) → `host` + module loader
- `services/providers/*` (claude-scanner, cowork-scanner) → `host` provider layer
- `services/conversation-parser.ts`, `claude-config-reader.ts`,
  `preferences.ts`, `version-service.ts` → shared read layer (`host`)

### Techne — `@nakirosai/techne`

- services: `agent-cli`, `agent-installer`, `bundled-skills-{reader,sync}`,
  `skill-{fingerprint,reader,symlink-override}`, `skill-fs/`,
  `plugin-skills-reader`, `claude-global-skills-reader`, all `eval-*` (8 files)
- handlers: `agents`, `bundled-skills`, `eval`, `skill-agent`, `skill-dir`,
  `skills-common`, `plugin-skills`

### Hestia — `@nakirosai/hestia`

- services: `claude-{md,rules,hooks,mcp,permissions,output-styles,agents}-writer`,
  `{hooks,mcp,permissions}-writer`, all `*-audit-history`,
  `dot-claude-snapshot-builder`, `onboarding-installer`, `path-suggester`
- handlers: the 7 `claude-*`, `hooks`, `mcp`, `permissions`, `rules`,
  `output-styles`, `subagents`, `onboarding`, `create`, `edit`

### Argos — `@nakirosai/argos`

- services: `analyze-convo-runner`, `classify-convo-runner`,
  `conversation-{analyzer,deep-analyzer,analysis-cache}`, `drift/`,
  `drift-analyzer`, `baseline-store`, `comparison-runner`,
  `project-{scanner,aggregate-cache}`, all `recommendation-*`
- handlers: `analyze-convo`, `classify-convo`, `drift-hook`, `comparison`,
  `recommendations`, `conversation-ingest`, `projects`

## Front mapping

See [`04-frontend.md`](04-frontend.md) for the full table. Summary:

- shell + `ui` ← `App`, `shell/`, transport, `Home`/`Settings`/`StatusBar`,
  `ui/`, `markdown/`, `diff/`, `runs/`, `RunScreen`
- Techne ← `Skills*`, `Marketplace`, `BundledSkillConflicts`, `skill/`
- Hestia ← `ClaudeMd`/`Rules`/`Hooks`/`Mcp`/`Permissions`/`OutputStyles`/
  `Subagents` (+ subfolders), `Onboarding`, `CreateEntityModal`
- Argos ← `DriftDetectionPanel`, `ConversationIngestPanel`, `ScanView`,
  `ProjectOverview`, `conversations/`, `recommendations/`, `viz/`

## The 3 hard couplings

These are the only places where extraction is more than moving files.

### 1. `audit-runner` + `fix-runner` are shared Techne ↔ Hestia

The audit / fix / eval lifecycle drives both the Skill screens and the `.claude`
screens. → Extract a **generic lifecycle runner** into the kernel
(`runner`/`host`), parameterised per module. Both modules consume it; neither
owns it.

### 2. `recommendations/*` is the Argos → Hestia/Techne bridge

Argos produces cards; Hestia/Techne apply them. → Break the direct dependency:
the `RecoCard` contract lives in `@nakirosai/shared`, Argos `provides`
`recommendation.producer`, Hestia/Techne `consume` it, the host routes
`applyReco` by `applyModule`. See [`05-inter-module-contracts.md`](05-inter-module-contracts.md).
This is the one coupling that *must* be cut for true independence.

### 3. `project-scanner` / `claude-config-reader` are read by Hestia and Argos

Both read the project and its `.claude`. → Put the **read-only project/config
layer in the kernel** (`host` provider layer); both modules consume it. No
ownership dispute.

## Suggested phasing

> The full, sequenced, PR-by-PR execution plan (with per-phase gates and a risk
> register) lives in [`migration-plan.md`](migration-plan.md). The summary below
> is the conceptual order.

1. **Extract the kernel first.** Pull `runner`, `shared`, `ui`, and the host
   skeleton out of `apps/nakiros`/`apps/frontend` with the monolith still
   running on top of them. No behaviour change, fully type-checked.
2. **Introduce `ModuleManifest` + the loader** in the host; register the still-
   monolithic handlers as one synthetic "module" to prove the path.
3. **Cut coupling #2** (recommendation bridge) — the riskiest, do it while there
   is still one codebase to test against.
4. **Carve modules** one at a time (Hestia → Techne → Argos), each becoming its
   own package with its own manifest, front, and skills.
5. **Generalise the lifecycle runner** (coupling #1) as modules are carved.
6. **Pinax** is built greenfield as a module against the finished kernel.

Validation gates stay the same per workspace:

```bash
pnpm -F @nakirosai/host exec tsc --noEmit
pnpm -F @nakirosai/<module> exec tsc --noEmit
turbo build
```
