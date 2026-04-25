# constants/

**Path:** `apps/frontend/src/constants/`

Centralised constants used across views: layout pixel widths, window-level event names, z-index scale.

## Files

- [layout.ts](./layout.md) — Fixed pixel widths used by the shell layout.
- [org.ts](./org.md) — Window-level event names dispatched outside the React tree so listeners can refresh themselves without a full reload.
- [zIndex.ts](./zIndex.md) — Centralised z-index scale to keep stacking contexts predictable.
