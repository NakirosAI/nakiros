import { useMemo } from 'react';
import type { ConversationAnalysis } from '@nakiros/shared';

interface Props {
  analysis: ConversationAnalysis;
}

const WIDTH = 720;
const HEIGHT = 120;
const PAD_X = 8;
const PAD_TOP = 16;
const PAD_BOTTOM = 18;

// Anthropic prompt-cache thresholds (see analyzer).
const HEALTHY_CAP = 50_000;
const WATCH_CAP = 150_000;

// Downsample to keep the path light. Conversations with 2000 turns don't need
// 2000 points to tell the lost-in-the-middle story.
const MAX_SAMPLES = 180;

/**
 * Compact visual diagnostic: a sparkline of per-turn context size, with
 * compaction boundaries (vertical) and friction events (triangles below).
 * Horizontal dotted lines show the 50k / 150k health thresholds — peaks
 * crossing 150k sit in the "lost in the middle" zone.
 */
export function ConversationTimeline({ analysis }: Props) {
  const { path, ticks } = useMemo(() => {
    const plotW = WIDTH - PAD_X * 2;
    const plotH = HEIGHT - PAD_TOP - PAD_BOTTOM;

    const samples = downsample(analysis.contextSamples, MAX_SAMPLES);
    // Y scale — cap at max(ctx, 200k) so the thresholds are always visible.
    const yMax = Math.max(analysis.maxContextTokens, 200_000);

    const yFor = (tokens: number) =>
      PAD_TOP + plotH - (Math.min(tokens, yMax) / yMax) * plotH;
    const xFor = (pct: number) => PAD_X + pct * plotW;

    let d = '';
    samples.forEach((s, i) => {
      const x = xFor(s.offsetPct);
      const y = yFor(s.tokens);
      d += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1) + ' ';
    });

    const ticks = [HEALTHY_CAP, WATCH_CAP].map((t) => ({
      y: yFor(t),
      label: `${Math.round(t / 1000)}k`,
    }));

    return { path: d.trim(), ticks };
  }, [analysis.contextSamples, analysis.maxContextTokens]);

  const plotW = WIDTH - PAD_X * 2;
  const yMax = Math.max(analysis.maxContextTokens, 200_000);
  const yFor = (tokens: number) =>
    PAD_TOP + (HEIGHT - PAD_TOP - PAD_BOTTOM) - (Math.min(tokens, yMax) / yMax) * (HEIGHT - PAD_TOP - PAD_BOTTOM);
  const xFor = (pct: number) => PAD_X + pct * plotW;

  const zoneColor =
    analysis.healthZone === 'degraded'
      ? 'var(--danger)'
      : analysis.healthZone === 'watch'
        ? 'var(--warning)'
        : 'var(--success)';

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label="context timeline"
      >
        {/* Zone background */}
        <rect
          x={PAD_X}
          y={PAD_TOP}
          width={plotW}
          height={HEIGHT - PAD_TOP - PAD_BOTTOM}
          fill={zoneColor}
          fillOpacity={0.05}
        />

        {/* Threshold lines: healthy / watch */}
        {ticks.map((t, i) => (
          <g key={i}>
            <line
              x1={PAD_X}
              x2={WIDTH - PAD_X}
              y1={t.y}
              y2={t.y}
              stroke="var(--line-strong)"
              strokeDasharray="2 3"
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

        {/* Sparkline */}
        {path && (
          <path
            d={path}
            fill="none"
            stroke={zoneColor}
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
        )}

        {/* Compaction boundaries — thick magenta verticals */}
        {analysis.compactions.map((c, i) => (
          <g key={'c' + i}>
            <line
              x1={xFor(c.offsetPct)}
              x2={xFor(c.offsetPct)}
              y1={PAD_TOP}
              y2={HEIGHT - PAD_BOTTOM}
              stroke="var(--primary)"
              strokeWidth={2}
            />
            <title>
              Compaction ({c.trigger}) — {Math.round(c.preTokens / 1000)}k → {Math.round(c.postTokens / 1000)}k tokens
            </title>
          </g>
        ))}

        {/* Friction triangles — below the axis */}
        {analysis.frictionPoints.map((f, i) => {
          const x = xFor(f.offsetPct);
          const y = HEIGHT - PAD_BOTTOM + 2;
          return (
            <g key={'f' + i}>
              <polygon
                points={`${x - 3},${y + 6} ${x + 3},${y + 6} ${x},${y}`}
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
  // Always keep last sample so the curve ends where the conversation ends.
  if (out[out.length - 1] !== samples[samples.length - 1]) {
    out.push(samples[samples.length - 1]);
  }
  return out;
}
