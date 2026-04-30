import { useMemo } from 'react';

interface SparklineProps {
  /** Values to plot, in chronological order. Empty array → renders nothing. */
  data: readonly number[];
  /** Pixel width of the SVG canvas. */
  width?: number;
  /** Pixel height of the SVG canvas. */
  height?: number;
  /**
   * CSS color for the stroke. Accepts any CSS color expression — typically a
   * `var(--n-...)` design token. Defaults to the new-design accent.
   */
  stroke?: string;
  /** CSS color for the area fill below the line. Default: accent-soft token. */
  fill?: string;
  /** Whether to fill the area beneath the line. */
  area?: boolean;
  /** Whether to draw a small dot on the last point. */
  dot?: boolean;
  /** Stroke width in pixels. */
  strokeWidth?: number;
  /** Optional accessible label — set when the sparkline isn't purely decorative. */
  ariaLabel?: string;
  /**
   * Marker hint per data point. Overlays a colored dot per kind:
   *  - `'baseline'` → violet (without_skill refresh)
   *  - `'fix-temp'` → amber (in-progress fix experiment)
   * Plain `'skill'` entries render without a marker. Length should
   * match `data`; missing entries render as plain skill points.
   */
  markers?: ReadonlyArray<'skill' | 'baseline' | 'fix-temp'>;
}

/**
 * Inline sparkline matching the new-design `Sparkline` from
 * `apps/Nakiros-new-design/viz.jsx`. Plots `data` as a simple line, with an
 * optional area fill and a final-point dot.
 *
 * Behavior matches the mockup: the y-axis stretches between the dataset
 * `min` and `max` (or `[0, 1]` when constant), with a 2px vertical padding
 * so the stroke doesn't clip. A single-point dataset renders as a flat
 * line at mid-height since that's the most informative degenerate case.
 *
 * Use it purely decorative (no `ariaLabel`) — when wired to real KPIs
 * pass an `ariaLabel` describing the trend ("score moyen sur 30 jours").
 */
/** Violet baseline marker — distinct from the accent line color. */
const BASELINE_MARKER_COLOR = 'oklch(0.62 0.21 295)';
/** Amber `fix-temp` marker — same hue as the watch tone for visibility. */
const FIX_TEMP_MARKER_COLOR = 'oklch(0.74 0.16 75)';

export default function Sparkline({
  data,
  width = 96,
  height = 24,
  stroke = 'var(--n-accent)',
  fill = 'var(--n-accent-soft)',
  area = true,
  dot = false,
  strokeWidth = 1.4,
  ariaLabel,
  markers,
}: SparklineProps) {
  const geometry = useMemo(() => {
    if (data.length === 0) return null;

    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = max - min || 1;
    const padY = 2;
    const usable = height - padY * 2;

    // A single-point dataset has no "step"; render it as a flat midline
    // for legibility instead of dividing by zero.
    if (data.length === 1) {
      const y = height / 2;
      const path = `M 0,${y} L ${width},${y}`;
      const areaPath = `${path} L ${width},${height} L 0,${height} Z`;
      return { path, areaPath, points: [[width / 2, y] as const], last: [width, y] as const };
    }

    const step = width / (data.length - 1);
    const points = data.map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / range) * usable - padY;
      return [x, y] as const;
    });

    const path = 'M ' + points.map((p) => `${p[0]},${p[1]}`).join(' L ');
    const areaPath = `${path} L ${width},${height} L 0,${height} Z`;
    return { path, areaPath, points, last: points[points.length - 1]! };
  }, [data, width, height]);

  if (!geometry) return null;

  return (
    <svg
      width={width}
      height={height}
      role={ariaLabel ? 'img' : 'presentation'}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      className="block overflow-visible"
    >
      {area && <path d={geometry.areaPath} fill={fill} />}
      <path
        d={geometry.path}
        stroke={stroke}
        strokeWidth={strokeWidth}
        fill="none"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Per-kind markers — small colored dots overlaid at each special
          iteration's x. Violet for baseline, amber for fix-temp. The line
          still passes through the point; the dot just flags it visually. */}
      {markers &&
        markers.map((kind, i) => {
          if (!geometry.points[i]) return null;
          if (kind !== 'baseline' && kind !== 'fix-temp') return null;
          const color = kind === 'baseline' ? BASELINE_MARKER_COLOR : FIX_TEMP_MARKER_COLOR;
          return (
            <circle
              key={`marker-${i}`}
              cx={geometry.points[i]![0]}
              cy={geometry.points[i]![1]}
              r="2.6"
              fill={color}
              stroke="var(--n-bg-canvas)"
              strokeWidth={1}
            />
          );
        })}
      {dot && (
        <circle cx={geometry.last[0]} cy={geometry.last[1]} r="2.5" fill={stroke} />
      )}
    </svg>
  );
}
