# utils/

**Path:** `apps/frontend/src/utils/`

Pure helpers shared across views: dates, file-type classification, id generation, language resolution, string utilities.

## Files

- [dates.ts](./dates.md) — Date helpers: freshness colour, age in days, i18n-aware short relative time formatting.
- [file-types.ts](./file-types.md) — MIME-like classification for skill asset files displayed in the UI.
- [ids.ts](./ids.md) — Short unique-id generator backed by `crypto.randomUUID()`.
- [language.ts](./language.md) — Resolves the user's language preference into a concrete language code.
- [strings.ts](./strings.md) — String helpers shared across views.
