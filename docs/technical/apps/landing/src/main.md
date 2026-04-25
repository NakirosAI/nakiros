# main.tsx

**Path:** `apps/landing/src/main.tsx`

Vite/React entry point for the landing page. Creates the root via `createRoot`, mounts `<App />` wrapped in `<I18nProvider>` and side-effect-imports `./index.css` so Tailwind styles ship with the bundle. The script is referenced from `apps/landing/index.html`.

## Exports

_None — entry point / side-effect module._

Side effects:

- Calls `createRoot(document.getElementById('root')!).render(...)` immediately at import time.
- Imports `./index.css` for Tailwind base/utility styles.
