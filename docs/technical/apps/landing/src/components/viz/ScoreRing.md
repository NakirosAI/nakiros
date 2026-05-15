# ScoreRing.tsx

**Path:** `apps/landing/src/components/viz/ScoreRing.tsx`

Circular SVG ring that encodes a numeric score as an arc fill. Used in the Factory section skill table to show per-skill pass rates. Arc colour is auto-derived from ratio or overridden via `color` prop.

## Exports

### `ScoreRing`

```ts
export function ScoreRing({ value, max, size, label, color }: ScoreRingProps): JSX.Element
```

Circular SVG ring that encodes a numeric score as an arc fill.

Used in the Factory section to show per-skill pass rates. The arc is drawn with a CSS transition on `stroke-dashoffset` for a smooth mount animation. When `color` is omitted the stroke colour is chosen automatically based on the ratio: healthy / accent / watch / critical.

### `ScoreRingProps`

```ts
interface ScoreRingProps {
  /** Numeric score to display inside and encode as arc fill. */
  value: number;
  /** Maximum possible value; used to compute the fill ratio. Default: 100. */
  max?: number;
  /** Diameter of the SVG in pixels. Default: 56. */
  size?: number;
  /** Optional text label rendered below the numeric value. */
  label?: string;
  /** Arc stroke colour. When omitted the colour is derived automatically from
   *  the pass ratio: ≥85% healthy, ≥60% accent, ≥40% watch, else critical. */
  color?: string;
}
```

Props for `ScoreRing`.
