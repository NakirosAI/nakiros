# Nakiros — Agent Entry Point

## Read order
1. `ARCHITECTURE.md` at the repo root — single source of truth for layout,
   runtime, IPC protocol, runners, storage conventions.
2. `CLAUDE.md` — mandatory constraints.
3. Only the files relevant to the change you're asked to make.

## Non-negotiable rules

- **IPC**: use `IPC_CHANNELS` from `@nakiros/shared`. Keep 4-layer alignment
  (shared / daemon handler + registry / client / global.d.ts).
- **Scope discipline**: Nakiros is skills-only. No workspaces, tickets,
  sprints, orchestration. If a file or concept smells like the old
  workspace/delivery model, don't reintroduce it — it was deliberately
  removed.
- **Local-first**: no outbound network calls from the daemon. Only the
  landing page hits `registry.npmjs.org` (read-only, for the version badge).
  No telemetry. No accounts.
- **No Electron**: the daemon is plain Node. Don't import from `electron`;
  `BrowserWindow`, `ipcMain`, `app.getPath`, `require('fs')` are all
  forbidden. Replace with Fastify routes, `eventBus.broadcast`, `nakirosFile`
  utility, static imports.
- **Runners** keep their tmp_skill isolation contract:
  - audit → reads the real skill directly
  - eval → operates on a `tmp_skill` copy
  - fix / create → operate on a `tmp_skill` workdir, deployed at `finish`
- **UI kit first**: reuse `apps/frontend/src/components/ui/*` before
  introducing new primitives. Tailwind utilities over inline styles. i18n
  via `useTranslation(namespace)`.
- **Don't edit generated files**: anything under `dist/`, `node_modules/`,
  `.turbo/`.

## Default working style

- Small, incremental changes. Prefer orchestrator + leaf components over
  monolithic screens.
- Keep types strict. `unknown` is fine at I/O boundaries; `any` isn't.
- When in doubt, grep the codebase for prior art before inventing a
  convention. If there's a service or hook doing something similar, extend
  it rather than duplicate.
- Validate with `turbo build` and per-package `tsc --noEmit` before handing
  back.
