# zIndex.ts

**Path:** `apps/frontend/src/constants/zIndex.ts`

Centralised z-index scale to keep stacking contexts predictable.

## Exports

```ts
const Z_BASE = 0;            // default flow content
const Z_DROPDOWN = 10;       // floating menus, autocompletes
const Z_STICKY = 20;         // sticky headers / toolbars
const Z_MODAL_BACKDROP = 100;
const Z_MODAL = 110;
const Z_TOAST = 200;
const Z_TOOLTIP = 300;       // must sit above everything else
```
