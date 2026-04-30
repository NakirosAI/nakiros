interface ScoreRingProps {
  /** Numerator. `null` renders a placeholder ring with em-dash centerpiece. */
  value: number | null;
  /** Denominator. Defaults to `100` (raw 0–100 scores). */
  max?: number;
  /** Pixel size of the SVG circle. */
  size?: number;
  /** Optional uppercase mono label rendered below the value. */
  label?: string;
  /**
   * Override stroke color. When omitted, the color is derived from the
   * value/max ratio (healthy / accent / watch / critical thresholds match
   * the new-design semantics).
   */
  color?: string;
  /** Stroke width. Defaults to 3px to match the mockup. */
  strokeWidth?: number;
}

/**
 * Circular score ring — port of the `ScoreRing` primitive in the
 * new-design mockup (`apps/Nakiros-new-design/viz.jsx`). Used in the
 * audit tab header and skill cards to convey "X / Y" at a glance.
 *
 * Color rules (when `color` is not supplied):
 * - ratio ≥ 0.85 → healthy
 * - ratio ≥ 0.60 → accent (Nakiros teal)
 * - ratio ≥ 0.40 → watch
 * - else → critical
 *
 * `value === null` is the explicit "no data yet" path: the ring stays
 * empty and the centerpiece becomes an em-dash. Useful when the score
 * couldn't be parsed from a Markdown audit report.
 */
export default function ScoreRing({
  value,
  max = 100,
  size = 56,
  label,
  color,
  strokeWidth = 3,
}: ScoreRingProps) {
  const radius = size / 2 - 4;
  const circumference = 2 * Math.PI * radius;

  const hasValue = value !== null && Number.isFinite(value) && max > 0;
  const ratio = hasValue ? Math.max(0, Math.min(1, value / max)) : 0;

  const autoColor = !hasValue
    ? 'var(--n-fg-faint)'
    : ratio >= 0.85
      ? 'var(--n-healthy)'
      : ratio >= 0.6
        ? 'var(--n-accent)'
        : ratio >= 0.4
          ? 'var(--n-watch)'
          : 'var(--n-critical)';

  const stroke = color ?? autoColor;
  const valueFontSize = Math.round(size * 0.32);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--n-bg-sunken)"
          strokeWidth={strokeWidth}
        />
        {hasValue && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={circumference - ratio * circumference}
            strokeLinecap="round"
            className="transition-[stroke-dashoffset] duration-300"
          />
        )}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="font-n-mono font-semibold tabular-nums text-n-fg"
          style={{ fontSize: valueFontSize }}
        >
          {hasValue ? value : '—'}
        </span>
        {label && (
          <span className="font-n-mono text-[9px] uppercase tracking-[0.8px] text-n-faint">
            {label}
          </span>
        )}
      </div>
    </div>
  );
}
