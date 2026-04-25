# OpenSource.tsx

**Path:** `apps/landing/src/components/OpenSource.tsx`

"Open source" section of the landing page. Two-column block: the left side shows the headline, description, and a GitHub link to `NakirosAI/nakiros`; the right side renders a checkmark bullet list of values from `messages.openSource.bullets`.

## Exports

### `OpenSource`

```ts
export function OpenSource(): JSX.Element
```

React component for the open-source block. Reads `messages.openSource.title`, `messages.openSource.description`, `messages.openSource.cta`, and `messages.openSource.bullets` via `useI18n`.
