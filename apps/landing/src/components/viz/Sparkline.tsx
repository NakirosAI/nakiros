interface SparklineProps {
  data: number[];
  w?: number;
  h?: number;
  color?: string;
  fill?: string;
  area?: boolean;
  dot?: boolean;
}

export function Sparkline({
  data,
  w = 96,
  h = 24,
  color = 'var(--accent)',
  fill = 'var(--accent-soft)',
  area = true,
  dot = false,
}: SparklineProps) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const step = w / (data.length - 1);
  const pts = data.map((v, i): [number, number] => [
    i * step,
    h - ((v - min) / range) * (h - 4) - 2,
  ]);
  const path = 'M ' + pts.map((p) => p.join(',')).join(' L ');
  const areaPath = path + ` L ${w},${h} L 0,${h} Z`;
  const last = pts[pts.length - 1];

  return (
    <svg
      width={w}
      height={h}
      style={{ display: 'block', overflow: 'visible' }}
      aria-hidden="true"
    >
      {area && <path d={areaPath} fill={fill} />}
      <path
        d={path}
        stroke={color}
        strokeWidth="1.4"
        fill="none"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {dot && (
        <circle cx={last[0]} cy={last[1]} r="2.5" fill={color} />
      )}
    </svg>
  );
}
