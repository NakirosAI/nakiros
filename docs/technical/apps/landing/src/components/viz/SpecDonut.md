# SpecDonut.tsx

**Path:** `apps/landing/src/components/viz/SpecDonut.tsx`

Two-colour donut chart showing the ratio of passing to failing spec checks. Used in the Room section tree panel to summarise `.claude/` spec coverage. Displays `pass/total` and the label "spec" in the centre.

## Exports

### `SpecDonut`

```ts
export function SpecDonut({ pass, fail, size }: SpecDonutProps): JSX.Element
```

Two-colour donut chart showing the ratio of passing to failing spec checks.

Used in the Room section tree panel to summarise `.claude/` spec coverage. The healthy (green) arc overlays the critical (red) full-circle base; the overlap visually conveys how much of the spec passes. Displays `pass/total` and the label "spec" in the centre.

### `SpecDonutProps`

```ts
interface SpecDonutProps {
  /** Number of passing spec checks. */
  pass: number;
  /** Number of failing spec checks. */
  fail: number;
  /** Diameter of the SVG in pixels. Default: 72. */
  size?: number;
}
```

Props for `SpecDonut`.
