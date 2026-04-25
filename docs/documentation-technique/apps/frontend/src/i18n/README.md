# i18n/

**Path:** `apps/frontend/src/i18n/`

i18next bootstrap for the frontend. Statically imports every FR/EN namespace JSON, asks the daemon for the system language, then initialises i18next once.

## Files

- [index.ts](./index.md) — i18next bootstrap module exposing the configured `i18n` instance and an `i18nReady` promise consumers await before rendering.
