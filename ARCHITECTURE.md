# Nakiros — Architecture

## What Nakiros is

A local daemon + web UI that observes Claude Code usage and gives you a
workshop to audit, evaluate, fix, and create **skills**. Local-first, open
source, distributed as a single npm package (`nakiros`). No cloud, no
account, no telemetry.

## Monorepo layout

```
apps/
  nakiros/        # Published npm package: Fastify daemon + CLI entry + bundled React UI
  frontend/      # React SPA (private workspace dep of nakiros, bundled into dist/ui/)
  landing/       # Marketing site (Cloudflare Pages, independent deploy)
packages/
  shared/        # @nakiros/shared — cross-package types + IPC channel constants
  agents-bundle/ # @nakiros/agents-bundle — team agents (PM, architect, dev, …)
```

Only `apps/nakiros` is published on npm. `apps/frontend` is a build-time
dependency (its `dist/` gets copied into `apps/nakiros/dist/ui/`).

## Runtime architecture

### Daemon (`apps/nakiros/src/daemon/`)

- **Fastify** server on `127.0.0.1:<port>` (default `4242`, fallback if taken).
- **`POST /ipc/:channel`** — generic IPC dispatcher that looks up the channel
  in the handler registry and invokes it with `request.body.args`.
- **`GET /ws`** — WebSocket connection that broadcasts all events from the
  event bus as `{channel, payload}` JSON frames.
- **`GET /*`** — static serving of the bundled React UI (`dist/ui/` in prod,
  `apps/frontend/dist/` in dev). SPA fallback to `index.html`.
- **Bootstrap** (`bootstrapDaemonRuntime`): called at boot by `bin/nakiros.ts`.
  Syncs bundled skills → `~/.nakiros/skills/`, restores in-flight runs, sweeps
  stray eval artifacts.

### Frontend (`apps/frontend/src/`)

- React 19 + Vite + Tailwind 4 + lucide-react.
- Entry: `main.tsx` imports `lib/nakiros-client.ts` **first**, which installs
  `window.nakiros` backed by HTTP (`fetch`) and WebSocket (subscribe to
  channels). Everything else calls `window.nakiros.*` as if it were native.
- Views orchestrated by `App.tsx` → `Home` → `NakirosSkillsView` /
  `GlobalSkillsView` / `Dashboard(project)`. Dashboard has sidebar tabs
  (ProjectOverview, SkillsView, ConversationsView, RecommendationsView).
- Skill views embed `EvalRunsView`, `AuditView`, `FixView`, `SkillAuditsTab`.

### Landing (`apps/landing/src/`)

- Same stack, standalone. Sections: Navbar, Hero, Etymology, Features,
  HowItWorks, OpenSource, FinalCta, Footer.
- Version badge fetches `registry.npmjs.org/nakiros` at runtime — no redeploy
  needed when a new npm version ships. Handles pre-release dist-tags (shows
  `v0.1.0-beta.1 · beta` with amber styling when no stable is out).

## IPC contract

### Channels
- Source of truth: `packages/shared/src/ipc-channels.ts` (constant object
  `IPC_CHANNELS`). Every channel name is a key — **no hardcoded strings**
  anywhere else.
- 4 layers must stay aligned when adding a channel:
  1. `packages/shared/src/ipc-channels.ts`
  2. `apps/nakiros/src/daemon/handlers/<domain>.ts` (implementation)
  3. `apps/nakiros/src/daemon/handlers/index.ts` (registry)
  4. `apps/frontend/src/lib/nakiros-client.ts` + `src/global.d.ts` (client)

### Dispatch
- Request: `POST /ipc/:channel` with `{ "args": [...] }`
- Response: `{ "ok": true, "result": <value> }` on success,
  `{ "ok": false, "error": "<message>" }` on throw, `404 Not Found` if the
  channel isn't registered.

### Event stream
- Handlers and services can push events via `eventBus.broadcast(channel, payload)`
  (`src/daemon/event-bus.ts`). Every connected WebSocket receives the event
  as `{channel, payload}` JSON. Client subscribes via `subscribe(channel, cb)`
  in `nakiros-client.ts`.

## Runners (skill operations)

Four runners live in `apps/nakiros/src/services/`:

| Runner | Operates on | Notes |
|---|---|---|
| **Audit** (`audit-runner.ts`) | The real skill dir (`.claude/skills/{name}` or `~/.claude/skills/{name}`) | Read-only. Output archived in `{skillDir}/audits/audit-{iso}.md`. |
| **Eval** (`eval-runner.ts`) | A `tmp_skill` (copy of the real skill in a temp workdir) | Isolated to avoid Claude permission prompts on the real skill. |
| **Fix** (`fix-runner.ts`) | A `tmp_skill` (workdir of in-progress modifications) | Evals can run against this tmp via `fix:runEvalsInTemp`, comparing before/after. Deployed back to real skill at `fix:finish`. |
| **Create** | A `tmp_skill` (new skill being crafted) | Same shape as fix. Deployed at `create:finish`. |

Temp workdir lifecycle: `~/.nakiros/tmp-skills/{runId}/`. Survives daemon
restart (`restoreOrCleanupTempWorkdirs` at boot).

## Storage conventions

Everything under `~/.nakiros/`:

- `preferences.json` — app preferences (lang, theme)
- `projects.json` — discovered Claude projects + dismissed state
- `skills/{name}/` — writable copies of bundled Nakiros skills (synced at boot
  from `apps/nakiros/bundled-skills/` in dev or the packaged tarball in prod).
  Symlinked into `~/.claude/skills/` so Claude Code picks them up.
- `runs/{runId}/` — event log + state for audit/eval/fix/create runs
- `tmp-skills/{runId}/` — temp workdirs for fix/create runs

**Claude-managed**:
- `~/.claude/projects/` — Claude Code project dirs (read by `project-scanner`)
- `~/.claude/skills/` — user-global skills (including symlinks to Nakiros-managed ones)

## Build & publish

- **Dev** (monorepo root): `turbo dev` → runs `@nakiros/frontend` (Vite HMR on
  5173) and `nakiros` (`tsx bin/nakiros.ts`) in parallel. Daemon picks up the
  frontend build from `apps/frontend/dist/`.
- **Prod build** (`turbo build`):
  1. `@nakiros/shared` → `dist/` (tsup)
  2. `@nakiros/frontend` → `dist/` (vite)
  3. `nakiros` → `tsup` bundles `bin/nakiros.ts` (inlining `@nakiros/shared`
     and `@nakiros/agents-bundle`) into `dist/bin/nakiros.js`, then
     `scripts/copy-frontend.mjs` copies `../frontend/dist/` into `dist/ui/`.
- **Publish** (GitHub Release → `.github/workflows/release.yml`):
  - Verifies tag (`v0.1.0-beta.1`) matches `apps/nakiros/package.json` version.
  - Detects pre-release suffix (`-beta`/`-alpha`/`-rc`) and publishes with
    corresponding dist-tag. Stable versions go to `latest`.
  - `npm publish --provenance --access public`.
- **Landing deploy**: Cloudflare Pages direct GitHub integration. Auto-builds
  on push to `main`. Preview URLs for every PR.

## Conventions

- **Tailwind-first** styling. Inline `style={{...}}` only when strictly
  necessary and commented.
- **i18n** via `useTranslation(namespace)`. No `isFr` or FR/EN ternaries in
  JSX. Namespaces in `apps/frontend/src/i18n/locales/{fr,en}/*.json`.
- **TypeScript strict** everywhere. `tsc --noEmit` must be clean before any
  commit that touches types.
- **No new `any`**. `unknown` only when unavoidable and narrowed at the
  boundary.
- **Reuse primitives first**: `apps/frontend/src/components/ui/*` before
  creating new widgets; `apps/frontend/src/constants/*`, `utils/*`, `hooks/*`
  before adding new abstractions.

## Adding a new IPC channel — checklist

1. Add the channel in `packages/shared/src/ipc-channels.ts`.
2. If payloads are non-trivial, type them in `packages/shared/src/types/`.
3. Implement the handler in `apps/nakiros/src/daemon/handlers/<domain>.ts`.
4. Register the handler in `apps/nakiros/src/daemon/handlers/index.ts`.
5. Add the method on `window.nakiros` in
   `apps/frontend/src/lib/nakiros-client.ts`.
6. Type the method in `apps/frontend/src/global.d.ts`.
7. Add i18n keys (FR + EN) if UI-facing.
8. `pnpm -F nakiros exec tsc --noEmit && pnpm -F @nakiros/frontend exec tsc --noEmit`
   before commit.
