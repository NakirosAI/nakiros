# Sparkline.tsx

**Path:** `apps/landing/src/components/viz/Sparkline.tsx`

Minimal SVG sparkline used in the Factory section skill table. Normalises a data series to the available height, draws a polyline, and optionally fills the area beneath it. Returns `null` when data is empty. The SVG is `aria-hidden`.

## Exports

### `Sparkline`

```ts
export function Sparkline({ data, w, h, color, fill, area, dot }: SparklineProps): JSX.Element | null
```

Minimal SVG sparkline used in the Factory section skill table.

Normalises the data series to the available height, draws a polyline, and optionally fills the area beneath it. Returns `null` when data is empty. The SVG has `aria-hidden` and carries no interactive state.

### `SparklineProps`

```ts
interface SparklineProps {
  /** Series of numeric data points, rendered left-to-right. */
  data: number[];
  /** SVG width in pixels. Default: 96. */
  w?: number;
  /** SVG height in pixels. Default: 24. */
  h?: number;
  /** Stroke colour for the line. Default: `var(--accent)`. */
  color?: string;
  /** Fill colour for the area under the line. Default: `var(--accent-soft)`. */
  fill?: string;
  /** Whether to render a filled area polygon under the line. Default: true. */
  area?: boolean;
  /** Whether to render a circle at the last data point. Default: false. */
  dot?: boolean;
}
```

Props for `Sparkline`.
