import { useMemo } from 'react';
import type { ConversationAnalysis } from '@nakiros/shared';

interface Props {
  analysis: ConversationAnalysis;
}

const WIDTH = 720;
const HEIGHT = 140;
const PAD_X = 8;
const PAD_TOP = 18;
const PAD_BOTTOM = 22;

// Health zones as fraction of the effective context window. Must stay in sync
// with HEALTHY_ZONE_PCT / WATCH_ZONE_PCT in the analyzer.
const HEALTHY_PCT = 0.25;
const WATCH_PCT = 0.75;

// Downsample to keep the path light. Conversations with 2000 turns don't need
// 2000 points to tell the story.
const MAX_SAMPLES = 180;

/**
 * The key visualization: shows context-size growth over the conversation
 * against the "lost in the middle" danger zones of the active window.
 *
 * Zones are horizontal bands coloured by health:
 *   0–25% of window = green (healthy)
 *   25–75%          = amber (watch — quality starts drifting)
 *   75–100%         = red   (degraded — lost-in-the-middle territory)
 *
 * Compactions are shown with a purple flag so you see when context was
 * forcibly reset. Friction events sit below the axis as red triangles so
 * you can eyeball whether frustration lined up with a dangerous zone.
 */
export function ConversationTimeline({ analysis }: Props) {
  const plotW = WIDTH - PAD_X * 2;
  const plotH = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const yMax = analysis.contextWindow;

  const yFor = (tokens: number) =>
    PAD_TOP + plotH - (Math.min(tokens, yMax) / yMax) * plotH;
  const xFor = (pct: number) => PAD_X + pct * plotW;

  /**
   * Build the sparkline as a list of coloured segments. Each segment is
   * tinted by the zone its *endpoint* falls into — the eye follows the line
   * from green (healthy) into amber and red (degraded) as context grows.
   */
  const segments = useMemo(() => {
    const samples = downsample(analysis.contextSamples, MAX_SAMPLES);
    if (samples.length < 2) return [] as Array<{ d: string; stroke: string }>;

    const zoneColor = (tokens: number) => {
      const pct = tokens / yMax;
      if (pct > WATCH_PCT) return '#dc2626'; // red-600
      if (pct > HEALTHY_PCT) return '#d97706'; // amber-600
      return '#16a34a'; // green-600
    };

    const segs: Array<{ d: string; stroke: string }> = [];
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1];
      const b = samples[i];
      const x1 = xFor(a.offsetPct).toFixed(1);
      const y1 = yFor(a.tokens).toFixed(1);
      const x2 = xFor(b.offsetPct).toFixed(1);
      const y2 = yFor(b.tokens).toFixed(1);
      segs.push({
        d: `M${x1},${y1} L${x2},${y2}`,
        stroke: zoneColor(b.tokens),
      });
    }
    return segs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis.contextSamples, analysis.contextWindow]);

  const healthyTop = yFor(yMax * HEALTHY_PCT);
  const watchTop = yFor(yMax * WATCH_PCT);
  const bandBottom = PAD_TOP + plotH;

  const windowLabel = yMax >= 1_000_000 ? '1M' : `${Math.round(yMax / 1000)}k`;

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label="context timeline"
      >
        {/* Health zones — the "lost in the middle" geography */}
        {/* Degraded (top 25%) */}
        <rect
          x={PAD_X}
          y={PAD_TOP}
          width={plotW}
          height={watchTop - PAD_TOP}
          fill="#ef4444"
          fillOpacity={0.18}
        />
        {/* Watch (middle 50%) */}
        <rect
          x={PAD_X}
          y={watchTop}
          width={plotW}
          height={healthyTop - watchTop}
          fill="#f59e0b"
          fillOpacity={0.14}
        />
        {/* Healthy (bottom 25%) */}
        <rect
          x={PAD_X}
          y={healthyTop}
          width={plotW}
          height={bandBottom - healthyTop}
          fill="#22c55e"
          fillOpacity={0.12}
        />

        {/* Zone boundary lines */}
        {[
          { y: watchTop, color: '#ef4444', label: `${Math.round((yMax * WATCH_PCT) / 1000)}k` },
          { y: healthyTop, color: '#f59e0b', label: `${Math.round((yMax * HEALTHY_PCT) / 1000)}k` },
        ].map((t, i) => (
          <g key={i}>
            <line
              x1={PAD_X}
              x2={WIDTH - PAD_X}
              y1={t.y}
              y2={t.y}
              stroke={t.color}
              strokeOpacity={0.5}
              strokeDasharray="3 3"
              strokeWidth={1}
            />
            <text
              x={WIDTH - PAD_X - 2}
              y={t.y - 2}
              textAnchor="end"
              fontSize={9}
              fill="var(--text-muted)"
            >
              {t.label}
            </text>
          </g>
        ))}

        {/* Window top label */}
        <text
          x={WIDTH - PAD_X - 2}
          y={PAD_TOP - 4}
          textAnchor="end"
          fontSize={9}
          fontWeight={600}
          fill="var(--text-muted)"
        >
          window {windowLabel}
        </text>

        {/* Sparkline — segments coloured by the zone their endpoint falls
            into, with a dark backbone for contrast. */}
        {segments.length > 0 && (
          <g>
            {segments.map((s, i) => (
              <path
                key={'bg' + i}
                d={s.d}
                fill="none"
                stroke="#0f172a"
                strokeOpacity={0.45}
                strokeWidth={3}
                strokeLinecap="round"
              />
            ))}
            {segments.map((s, i) => (
              <path
                key={'fg' + i}
                d={s.d}
                fill="none"
                stroke={s.stroke}
                strokeWidth={2}
                strokeLinecap="round"
              />
            ))}
          </g>
        )}

        {/* Compaction boundaries */}
        {analysis.compactions.map((c, i) => {
          const x = xFor(c.offsetPct);
          return (
            <g key={'c' + i}>
              <rect
                x={x - 3}
                y={PAD_TOP}
                width={6}
                height={plotH}
                fill="#a855f7"
                fillOpacity={0.22}
              />
              <line
                x1={x}
                x2={x}
                y1={PAD_TOP}
                y2={PAD_TOP + plotH}
                stroke="#a855f7"
                strokeWidth={2}
                strokeDasharray="4 3"
              />
              <rect
                x={x - 7}
                y={PAD_TOP - 13}
                width={14}
                height={12}
                fill="#a855f7"
                rx={2}
              />
              <text
                x={x}
                y={PAD_TOP - 4}
                textAnchor="middle"
                fontSize={9}
                fontWeight={700}
                fill="#fff"
              >
                C{analysis.compactions.length > 1 ? i + 1 : ''}
              </text>
              <title>
                Compaction ({c.trigger}) — {Math.round(c.preTokens / 1000)}k → {Math.round(c.postTokens / 1000)}k tokens
              </title>
            </g>
          );
        })}

        {/* Friction triangles */}
        {analysis.frictionPoints.map((f, i) => {
          const x = xFor(f.offsetPct);
          const y = PAD_TOP + plotH + 3;
          return (
            <g key={'f' + i}>
              <polygon
                points={`${x - 3},${y + 7} ${x + 3},${y + 7} ${x},${y}`}
                fill="var(--danger)"
              />
              <title>
                {f.matchedPattern}: {f.snippet.slice(0, 120)}
              </title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function downsample<T>(samples: T[], target: number): T[] {
  if (samples.length <= target) return samples;
  const step = samples.length / target;
  const out: T[] = [];
  for (let i = 0; i < target; i++) {
    out.push(samples[Math.floor(i * step)]);
  }
  if (out[out.length - 1] !== samples[samples.length - 1]) {
    out.push(samples[samples.length - 1]);
  }
  return out;
}
