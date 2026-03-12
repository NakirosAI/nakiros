# Desktop App - Agent Entry Point

## Read Order
1. Read `ARCHITECTURE.md` first (single source of truth).
2. Then inspect only the files relevant to the requested change.

## Non-Negotiable Rules
- IPC channels: use `IPC_CHANNELS` from `@nakiros/shared` only.
- IPC typing must stay aligned across:
  - `electron/main.ts`
  - `electron/preload.ts`
  - `src/global.d.ts`
  - shared types in `@nakiros/shared`
- UI: Tailwind utilities first, no inline styles unless strictly justified.
- i18n: use `useTranslation(namespace)`, no `isFr` pattern, no hardcoded FR/EN ternaries.
- Reuse existing UI primitives in `src/components/ui/` before creating new ones.
- Reuse constants/utilities/hooks before duplicating logic.
- Never edit generated files in `dist-electron/`.

## Default Working Style
- Keep components focused (orchestrator + subcomponents).
- Keep cross-process contracts explicit and typed.
- Prefer small, incremental refactors over broad rewrites.
- Validate with `pnpm tsc --noEmit` when available.
