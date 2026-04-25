# main.tsx

**Path:** `apps/frontend/src/main.tsx`

Browser entry point for the frontend bundle. Imports the IPC client polyfill, awaits i18n initialization, then mounts [`App`](./App.md) into `#root` inside `React.StrictMode`. No exports.

## Exports

_None — this file is a side-effect-only entry point._

Side effects:
- Imports `./lib/nakiros-client` for its side effect (registers the `window.nakiros` shim against the daemon WebSocket).
- Imports `./styles/globals.css`.
- Awaits [`i18nReady`](./i18n/index.md) before calling `ReactDOM.createRoot(...).render(...)`.
