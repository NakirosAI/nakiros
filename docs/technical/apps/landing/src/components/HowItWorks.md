# HowItWorks.tsx

**Path:** `apps/landing/src/components/HowItWorks.tsx`

"How it works" section of the landing page (anchor `#how-it-works`). Renders a 3-column numbered timeline driven by `messages.howItWorks.steps`, with subtle gradient connector lines drawn between cards on `md` breakpoints and up.

## Exports

### `HowItWorks`

```ts
export function HowItWorks(): JSX.Element
```

React component for the timeline block. Reads `messages.howItWorks.title` and `messages.howItWorks.steps` (each entry: `number`, `title`, `description`) via `useI18n`.
