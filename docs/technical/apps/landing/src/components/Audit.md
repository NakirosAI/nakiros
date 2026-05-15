# Audit.tsx

**Path:** `apps/landing/src/components/Audit.tsx`

Renders the "Audit" section (section 04, v2 landing layout) — a static mock forensic report card produced by a Nakiros worker on a single skill. The card shows a header row with target skill, model, elapsed time, and a verdict badge, followed by numbered bullet rows. All copy is i18n-driven via `messages.audit`.

## Exports

### `Audit`

```ts
export function Audit(): JSX.Element
```

"Audit" section — forensic report card produced by a Nakiros worker on a single skill. Occupies section 04 of the v2 landing layout.

Renders a static mock of an audit result: a header row showing the target skill, model, elapsed time, and a verdict badge, followed by numbered bullet rows sourced from `messages.audit.bullets`. All copy is i18n-driven.
