interface HBarProps {
  /** Numerator. Clamped to `[0, max]`. */
  value: number;
  /** Denominator. Must be > 0; passing 0 renders an empty bar. */
  max: number;
  /**
   * CSS color for the filled portion. Typically a `var(--n-...)` token.
   * Defaults to the new-design accent.
   */
  color?: string;
  /** Pixel height of the bar. */
  height?: number;
  /** Tailwind/CSS width override. Defaults to `100%`. */
  className?: string;
  /** Optional accessible label — set when the bar carries information. */
  ariaLabel?: string;
}

/**
 * Tiny horizontal usage bar — port of the `HBar` primitive in the
 * new-design mockup (`apps/Nakiros-new-design/viz.jsx`). Used for
 * compact "X of Y" indicators (tool error rate, eval pass rate, etc.)
 * inside lists where a full progress bar would be too heavy.
 *
 * Renders a sunken track with a colored fill, both pill-shaped. Width
 * defaults to 100% so the bar stretches into whatever container it
 * lives in.
 */
export default function HBar({
  value,
  max,
  color = 'var(--n-accent)',
  height = 4,
  className,
  ariaLabel,
}: HBarProps) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const percent = ratio * 100;
  return (
    <div
      role={ariaLabel ? 'progressbar' : 'presentation'}
      aria-label={ariaLabel}
      aria-valuenow={ariaLabel ? Math.round(percent) : undefined}
      aria-valuemin={ariaLabel ? 0 : undefined}
      aria-valuemax={ariaLabel ? 100 : undefined}
      aria-hidden={ariaLabel ? undefined : true}
      className={'overflow-hidden rounded-full bg-n-sunken ' + (className ?? 'w-full')}
      style={{ height }}
    >
      <div
        className="h-full rounded-full transition-[width] duration-200"
        style={{ width: `${percent}%`, background: color }}
      />
    </div>
  );
}
