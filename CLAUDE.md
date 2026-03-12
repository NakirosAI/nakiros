# Desktop App - Claude Entry Point

Canonical project memory is in `ARCHITECTURE.md`.

## Mandatory Constraints
- Use `IPC_CHANNELS` from `@nakiros/shared` (no hardcoded IPC channel strings).
- Keep IPC contract synchronized across `main.ts`, `preload.ts`, `global.d.ts`, shared types.
- Tailwind-first styling, avoid inline styles unless unavoidable and documented.
- i18n via `useTranslation(namespace)` only; no language ternary patterns.
- Reuse `src/components/ui/*`, `src/constants/*`, `src/utils/*`, and `src/hooks/*` before adding new abstractions.
- Do not manually edit generated outputs in `dist-electron/`.
