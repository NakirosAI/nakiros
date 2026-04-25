# FinalCta.tsx

**Path:** `apps/landing/src/components/FinalCta.tsx`

Final call-to-action section of the landing page (anchor `#install`). Surfaces the install command for `@nakirosai/nakiros` via the `InstallCommand` pill, a follow-up command, and a GitHub link to `NakirosAI/nakiros`. All copy is pulled from the `cta` block of the active locale through `useI18n`.

## Exports

### `FinalCta`

```ts
export function FinalCta(): JSX.Element
```

React component for the closing CTA block. Renders `messages.cta.title`, `messages.cta.description`, `messages.cta.command`, `messages.cta.then`, `messages.cta.then2`, and `messages.cta.github`.
