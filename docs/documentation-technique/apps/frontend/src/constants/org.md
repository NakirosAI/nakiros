# org.ts

**Path:** `apps/frontend/src/constants/org.ts`

Window-level event names dispatched outside the React tree so that
listeners can refresh themselves without a full reload.

## Exports

### `ORG_STATE_CHANGED_EVENT`

```ts
const ORG_STATE_CHANGED_EVENT = 'nakiros:org-state-changed';
```

CustomEvent name dispatched when the org/preferences state changes.
