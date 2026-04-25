# src/

**Path:** `apps/landing/src/`

Source of the Nakiros marketing landing page (Vite + React + TypeScript). Static marketing content only — independent from the in-app web UI in `apps/frontend`. Deployed as a standalone bundle.

## Subfolders

- [components/](./components/README.md) — Section components composing the landing page.
- [i18n/](./i18n/README.md) — Locale provider and `useI18n` hook.
- [lib/](./lib/README.md) — Shared helpers (classname combinator, npm version hook).

## Files

- [App.tsx](./App.md) — Root component composing the marketing sections in vertical order.
- [main.tsx](./main.md) — Vite/React entry point mounting `<App />` inside `<I18nProvider>`.
