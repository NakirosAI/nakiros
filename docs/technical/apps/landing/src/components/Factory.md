# Factory.tsx

**Path:** `apps/landing/src/components/Factory.tsx`

Renders the "Skills Factory" section (section 06, v2 landing layout) — a responsive skills table with pass-rate rings (`ScoreRing`) and trend sparklines (`Sparkline`). Data is a static mock (SKILLS array with seeded random-walk trends). All copy from `messages.factory`.

## Exports

### `Factory`

```ts
export function Factory(): JSX.Element
```

"Skills Factory" section — skills table with pass-rate rings and trend sparklines. Occupies section 06 of the v2 landing layout.

Renders SKILLS as a responsive table: skill name + description, iteration count, eval count, audit count, a `ScoreRing` for pass rate, and a `Sparkline` trend line. Column headers are hidden on mobile and shown at md breakpoint. All copy comes from `messages.factory`.
