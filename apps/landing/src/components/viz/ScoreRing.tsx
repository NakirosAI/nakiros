interface ScoreRingProps {
  value: number;
  max?: number;
  size?: number;
  label?: string;
  color?: string;
}

export function ScoreRing({ value, max = 100, size = 56, label, color }: ScoreRingProps) {
  const r = size / 2 - 4;
  const circumference = 2 * Math.PI * r;
  const ratio = value / max;

  let auto: string;
  if (ratio >= 0.85) auto = 'var(--healthy)';
  else if (ratio >= 0.6) auto = 'var(--accent)';
  else if (ratio >= 0.4) auto = 'var(--watch)';
  else auto = 'var(--critical)';

  const stroke = color ?? auto;
  const cx = size / 2;
  const cy = size / 2;

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg
        width={size}
        height={size}
        style={{ transform: 'rotate(-90deg)' }}
        aria-hidden="true"
      >
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="var(--bg-sunken)"
          strokeWidth="3"
        />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth="3"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - ratio * circumference}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 400ms' }}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
        }}
      >
        <span
          className="lp-mono"
          style={{
            fontSize: size * 0.32,
            fontWeight: 600,
            color: 'var(--fg)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {value}
        </span>
        {label && (
          <span
            style={{
              fontSize: 9,
              color: 'var(--fg-faint)',
              textTransform: 'uppercase',
              letterSpacing: 0.8,
            }}
          >
            {label}
          </span>
        )}
      </div>
    </div>
  );
}
