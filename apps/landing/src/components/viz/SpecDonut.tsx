interface SpecDonutProps {
  pass: number;
  fail: number;
  size?: number;
}

export function SpecDonut({ pass, fail, size = 72 }: SpecDonutProps) {
  const total = pass + fail;
  const r = size / 2 - 6;
  const circumference = 2 * Math.PI * r;
  const passRatio = total === 0 ? 0 : pass / total;
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
          stroke="var(--critical)"
          strokeWidth="4"
        />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="var(--healthy)"
          strokeWidth="4"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - passRatio)}
          strokeLinecap="butt"
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
            fontSize: 16,
            fontWeight: 600,
            color: 'var(--fg)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {pass}/{total}
        </span>
        <span
          style={{
            fontSize: 9,
            color: 'var(--fg-faint)',
            textTransform: 'uppercase',
            letterSpacing: 0.7,
          }}
        >
          spec
        </span>
      </div>
    </div>
  );
}
