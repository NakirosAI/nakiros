# Fix.tsx

**Path:** `apps/landing/src/components/Fix.tsx`

Renders the "Fix" section (section 05, v2 landing layout) — a 4-stage audit-to-fix loop with a proposal diff card and an eval-results matrix. Left card shows a mock `proposal-engine v2` unified diff; right card shows EVAL_SESSIONS (4 sessions × baseline/v1/v2). All copy from `messages.fix`.

## Exports

### `Fix`

```ts
export function Fix(): JSX.Element
```

"Fix" section — 4-stage audit-to-fix loop with a proposal diff card and an eval-results matrix. Occupies section 05 of the v2 landing layout.

Left card shows `proposal-engine v2` with a mock unified diff of SKILL.md. Right card shows an eval matrix (4 sessions × baseline/v1/v2) and a summary chip. All copy is driven by `messages.fix`; EVAL_SESSIONS is a static mock array.
