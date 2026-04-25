# Nakiros — Claude Entry Point

Canonical project memory is `ARCHITECTURE.md` at the repo root. Read it
first for layout, runtime, and IPC contract.

## Technical documentation (read before coding)

Full TSDoc mirror lives under [`docs/technical/`](docs/technical/README.md).
Each source file has a leaf markdown documenting its exported symbols, and
each folder has an index (≤ 200 lines) listing children.

**Before implementing a new function, helper, hook, component, runner, or
IPC handler, browse the relevant index** (`apps/nakiros/`, `apps/frontend/`,
`packages/shared/`) to check if the capability already exists. Reuse over
duplication. If you add or change exported symbols, refresh both the TSDoc
and its mirrored markdown via the `code-documentation` skill.

## Mandatory constraints

- Use `IPC_CHANNELS` from `@nakiros/shared` everywhere. **No hardcoded
  channel name strings** in handlers, registry, client, or d.ts.
- Any IPC change must stay aligned across these 4 files:
  1. `packages/shared/src/ipc-channels.ts`
  2. `apps/nakiros/src/daemon/handlers/index.ts` + the `<domain>.ts`
     implementation
  3. `apps/frontend/src/lib/nakiros-client.ts`
  4. `apps/frontend/src/global.d.ts`
- Tailwind-first styling. No inline `style={{...}}` unless unavoidable and
  documented.
- i18n via `useTranslation(namespace)` only. No `isFr` / FR-EN ternaries.
- Reuse `apps/frontend/src/components/ui/*`, `constants/*`, `utils/*`,
  `hooks/*` before adding new abstractions.
- Local-first: no network calls, no telemetry, no secrets in code. Anything
  the user persists goes under `~/.nakiros/`.
- Do not edit generated outputs in `dist/` directories.

## Quick pointers

- Runners live in `apps/nakiros/src/services/{audit,eval,fix}-runner.ts`. The
  tmp_skill pattern (eval/fix/create isolated from the real skill) is
  load-bearing — do not bypass it.
- Event broadcasts from runners use `eventBus.broadcast(channel, payload)`
  from `src/daemon/event-bus.ts`. Never import from `electron`; it's gone.
- The daemon is a plain Node ESM bundle (tsup). Don't use `require()` — use
  static `import` from `'fs'`, `'node:fs'`, etc.

## Validation before closing

```bash
pnpm -F nakiros exec tsc --noEmit
pnpm -F @nakiros/frontend exec tsc --noEmit
pnpm -F @nakiros/landing exec tsc --noEmit
turbo build
```
