# Etymology.tsx

**Path:** `apps/landing/src/components/Etymology.tsx`

"Etymology" section of the landing page (anchor `#etymology`). Explains the origin of the name "Nakiros" by combining *nakama* (Japanese) and *kairos* (Greek) and renders two cards plus a synthesis paragraph. Reads its copy from the `etymology` block of the active locale via `useI18n` and is rendered between the Hero and Features sections inside `App`.

## Exports

### `Etymology`

```ts
export function Etymology(): JSX.Element
```

React component for the etymology block. Pulls `eyebrow`, `title`, `nakama`, `kairos`, and `synthesis` from `messages.etymology` and renders them through an internal `EtymologyCard` (private to this module).
