import { useMemo } from 'react';
import type { ConversationAnalysis } from '@nakiros/shared';

interface Props {
  analysis: ConversationAnalysis;
}

const WIDTH = 920;
const HEIGHT = 220;
const PAD_L = 50;
const PAD_R = 14;
const PAD_T_BASE = 6;
const PHASE_H = 16;
const EVENT_LANE_H = 22;
const PAD_B = 30;

const HEALTHY_PCT = 0.25;
const WATCH_PCT = 0.75;

const MAX_SAMPLES = 220;

interface Phase {
  from: number;
  to: number;
  label: 'Implementation' | 'Recovery' | 'Drift' | 'Deadlock' | 'Wrap-up';
  tone: 'neutral' | 'healthy' | 'watch' | 'critical';
}

/**
 * Conversation sismograph — PR10a, ctx-only enriched.
 *
 * Renders the real `analysis.contextSamples` curve over a window of health
 * bands, with a top phase strip + event lane carrying compaction and
 * friction markers, and a time-axis at the bottom (T+m + absolute clock).
 *
 * The 5-tracks fidelity of the mockup needs `billedSamples`, `cacheSamples`,
 * `toolBuckets`, `pausePoints` time-series the analyzer doesn't expose
 * yet — see memory `project_nakiros_sismograph_5tracks_backend_2026_04_27`
 * (PR10c). This component is the seed that PR10c will extend rather than
 * replace.
 */
export function Sismograph({ analysis }: Props) {
  const padT = PAD_T_BASE + PHASE_H + EVENT_LANE_H;
  const innerW = WIDTH - PAD_L - PAD_R;
  const innerH = HEIGHT - padT - PAD_B;

  const yMax = analysis.contextWindow;
  const yFor = (tokens: number) => padT + innerH - (Math.min(tokens, yMax) / yMax) * innerH;
  const xFor = (pct: number) => PAD_L + pct * innerW;

  const samples = useMemo(
    () => downsample(analysis.contextSamples, MAX_SAMPLES),
    [analysis.contextSamples],
  );

  const segments = useMemo(() => {
    if (samples.length < 2) return [] as Array<{ d: string; tone: string }>;
    const out: Array<{ d: string; tone: string }> = [];
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1];
      const b = samples[i];
      out.push({
        d: `M${xFor(a.offsetPct).toFixed(1)},${yFor(a.tokens).toFixed(1)} L${xFor(b.offsetPct).toFixed(1)},${yFor(b.tokens).toFixed(1)}`,
        tone: zoneToneVar(b.tokens / yMax),
      });
    }
    return out;
  }, [samples, yMax]);

  // Build the area path (filled under the curve) using the same downsampled set.
  const areaPath = useMemo(() => {
    if (samples.length < 2) return '';
    const head = samples
      .map((s) => `${xFor(s.offsetPct).toFixed(1)},${yFor(s.tokens).toFixed(1)}`)
      .join(' L');
    const baseline = `${xFor(1).toFixed(1)},${(padT + innerH).toFixed(1)} L${xFor(0).toFixed(1)},${(padT + innerH).toFixed(1)}`;
    return `M${head} L${baseline} Z`;
  }, [samples, innerH, padT]);

  const phases = useMemo(() => derivePhases(analysis), [analysis]);
  const ticks = useMemo(() => niceTicks(analysis.durationMs / 60000), [analysis.durationMs]);
  const startTime = useMemo(() => safeStartTime(analysis.startedAt), [analysis.startedAt]);

  const healthyTopY = yFor(yMax * HEALTHY_PCT);
  const watchTopY = yFor(yMax * WATCH_PCT);
  const trackBottom = padT + innerH;

  const winLabel = yMax >= 1_000_000 ? '1M' : `${Math.round(yMax / 1000)}k`;

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="block w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label="Conversation sismograph"
      >
        {/* === Phase strip (top) === */}
        {phases.map((p, i) => (
          <PhaseRect key={`p${i}`} phase={p} innerW={innerW} />
        ))}

        {/* === Event lane label === */}
        <text
          x={PAD_L - 8}
          y={PAD_T_BASE + PHASE_H + EVENT_LANE_H / 2 + 3}
          textAnchor="end"
          fontFamily="var(--n-font-mono)"
          fontSize={9}
          fill="var(--n-fg-faint)"
          style={{ letterSpacing: '0.6px', textTransform: 'uppercase' }}
        >
          events
        </text>

        {/* === Health bands behind the track === */}
        <rect
          x={PAD_L}
          y={padT}
          width={innerW}
          height={watchTopY - padT}
          fill="var(--n-critical)"
          fillOpacity={0.10}
        />
        <rect
          x={PAD_L}
          y={watchTopY}
          width={innerW}
          height={healthyTopY - watchTopY}
          fill="var(--n-watch)"
          fillOpacity={0.09}
        />
        <rect
          x={PAD_L}
          y={healthyTopY}
          width={innerW}
          height={trackBottom - healthyTopY}
          fill="var(--n-healthy)"
          fillOpacity={0.08}
        />

        {/* === Track label === */}
        <text
          x={PAD_L - 8}
          y={padT + innerH / 2 + 3}
          textAnchor="end"
          fontFamily="var(--n-font-mono)"
          fontSize={9}
          fill="var(--n-fg-subtle)"
          style={{ letterSpacing: '0.6px', textTransform: 'uppercase' }}
        >
          ctx
        </text>

        {/* === Zone boundary dashed lines === */}
        <line
          x1={PAD_L}
          x2={WIDTH - PAD_R}
          y1={watchTopY}
          y2={watchTopY}
          stroke="var(--n-critical)"
          strokeOpacity={0.4}
          strokeDasharray="3 3"
          strokeWidth={1}
        />
        <line
          x1={PAD_L}
          x2={WIDTH - PAD_R}
          y1={healthyTopY}
          y2={healthyTopY}
          stroke="var(--n-watch)"
          strokeOpacity={0.4}
          strokeDasharray="3 3"
          strokeWidth={1}
        />
        <text
          x={WIDTH - PAD_R - 4}
          y={watchTopY - 3}
          textAnchor="end"
          fontFamily="var(--n-font-mono)"
          fontSize={9}
          fill="var(--n-fg-faint)"
        >
          {Math.round((yMax * WATCH_PCT) / 1000)}k
        </text>
        <text
          x={WIDTH - PAD_R - 4}
          y={healthyTopY - 3}
          textAnchor="end"
          fontFamily="var(--n-font-mono)"
          fontSize={9}
          fill="var(--n-fg-faint)"
        >
          {Math.round((yMax * HEALTHY_PCT) / 1000)}k
        </text>
        <text
          x={WIDTH - PAD_R - 4}
          y={padT + 8}
          textAnchor="end"
          fontFamily="var(--n-font-mono)"
          fontSize={9}
          fontWeight={600}
          fill="var(--n-fg-muted)"
        >
          window {winLabel}
        </text>

        {/* === Vertical compaction guides (dim, full-height) === */}
        {analysis.compactions.map((c, i) => {
          const x = xFor(c.offsetPct);
          return (
            <line
              key={`cv${i}`}
              x1={x}
              x2={x}
              y1={PAD_T_BASE + PHASE_H + EVENT_LANE_H}
              y2={padT + innerH}
              stroke="var(--n-info)"
              strokeOpacity={0.35}
              strokeDasharray="2 3"
              strokeWidth={1}
            />
          );
        })}

        {/* === Filled area + segmented line === */}
        {areaPath && <path d={areaPath} fill="var(--n-track-context)" fillOpacity={0.12} />}
        {segments.map((s, i) => (
          <path
            key={`seg${i}`}
            d={s.d}
            fill="none"
            stroke={s.tone}
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {/* === Event lane: compactions + frictions === */}
        {analysis.compactions.map((c, i) => (
          <EventDot
            key={`ec${i}`}
            x={xFor(c.offsetPct)}
            y={PAD_T_BASE + PHASE_H + EVENT_LANE_H / 2}
            color="var(--n-info)"
            tooltip={`Compaction · ${Math.round(c.preTokens / 1000)}k → ${Math.round(c.postTokens / 1000)}k`}
          />
        ))}
        {analysis.frictionPoints.map((f, i) => (
          <EventDot
            key={`ef${i}`}
            x={xFor(f.offsetPct)}
            y={PAD_T_BASE + PHASE_H + EVENT_LANE_H / 2}
            color="var(--n-critical)"
            tooltip={`${f.matchedPattern}: ${f.snippet.slice(0, 80)}`}
          />
        ))}

        {/* === X-axis ticks === */}
        <line
          x1={PAD_L}
          x2={WIDTH - PAD_R}
          y1={padT + innerH}
          y2={padT + innerH}
          stroke="var(--n-border-default)"
        />
        {ticks.map((m) => {
          const x = xFor(Math.min(1, m / Math.max(1, analysis.durationMs / 60000)));
          return (
            <g key={`tick${m}`}>
              <line
                x1={x}
                x2={x}
                y1={padT + innerH}
                y2={padT + innerH + 4}
                stroke="var(--n-border-default)"
              />
              <text
                x={x}
                y={padT + innerH + 14}
                textAnchor="middle"
                fontFamily="var(--n-font-mono)"
                fontSize={9.5}
                fill="var(--n-fg-subtle)"
              >
                T+{fmtTimeLabel(m)}
              </text>
              {startTime && (
                <text
                  x={x}
                  y={padT + innerH + 25}
                  textAnchor="middle"
                  fontFamily="var(--n-font-mono)"
                  fontSize={8.5}
                  fill="var(--n-fg-faint)"
                >
                  {addClock(startTime, m)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function PhaseRect({ phase, innerW }: { phase: Phase; innerW: number }) {
  const x = PAD_L + phase.from * innerW;
  const w = (phase.to - phase.from) * innerW;
  const fill = phase.tone === 'neutral' ? 'var(--n-bg-raised)' : `var(--n-${phase.tone}-soft)`;
  const stroke =
    phase.tone === 'neutral' ? 'var(--n-border-default)' : `var(--n-${phase.tone})`;
  const textColor =
    phase.tone === 'neutral' ? 'var(--n-fg-muted)' : `var(--n-${phase.tone})`;
  return (
    <g>
      <rect
        x={x + 1}
        y={PAD_T_BASE}
        width={Math.max(0, w - 2)}
        height={PHASE_H - 4}
        fill={fill}
        stroke={stroke}
        strokeOpacity={0.5}
        strokeWidth={0.75}
        rx={3}
      />
      <text
        x={x + w / 2}
        y={PAD_T_BASE + (PHASE_H - 4) / 2 + 3}
        textAnchor="middle"
        fontFamily="var(--n-font-mono)"
        fontSize={9}
        fill={textColor}
        style={{ letterSpacing: '0.5px', textTransform: 'uppercase' }}
      >
        {phase.label}
      </text>
    </g>
  );
}

function EventDot({
  x,
  y,
  color,
  tooltip,
}: {
  x: number;
  y: number;
  color: string;
  tooltip: string;
}) {
  return (
    <g>
      <circle cx={x} cy={y} r={3.5} fill={color} />
      <line
        x1={x}
        x2={x}
        y1={y + 3.5}
        y2={PAD_T_BASE + PHASE_H + EVENT_LANE_H}
        stroke={color}
        strokeOpacity={0.7}
        strokeWidth={1}
      />
      <title>{tooltip}</title>
    </g>
  );
}

// --- helpers ----------------------------------------------------------------

function zoneToneVar(pct: number): string {
  if (pct > WATCH_PCT) return 'var(--n-critical)';
  if (pct > HEALTHY_PCT) return 'var(--n-watch)';
  return 'var(--n-healthy)';
}

function downsample<T>(samples: T[], target: number): T[] {
  if (samples.length <= target) return samples;
  const step = samples.length / target;
  const out: T[] = [];
  for (let i = 0; i < target; i++) {
    out.push(samples[Math.floor(i * step)]);
  }
  const last = samples[samples.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

/**
 * Phase strip is inferred entirely client-side from compactions + healthZone:
 * - first segment is always "Implementation",
 * - segments between compactions are "Recovery",
 * - the last segment is upgraded to "Drift" / "Deadlock" / "Wrap-up" based
 *   on the conversation's overall healthZone.
 *
 * Real phase clustering (would need conversation-level signals not in the
 * analyzer today) is deferred to PR10c.
 */
function derivePhases(analysis: ConversationAnalysis): Phase[] {
  const cuts = [...analysis.compactions]
    .map((c) => c.offsetPct)
    .filter((p) => p > 0.01 && p < 0.99)
    .sort((a, b) => a - b);

  const boundaries = [0, ...cuts, 1];
  const segments: Phase[] = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const isFirst = i === 0;
    const isLast = i === boundaries.length - 2;
    let label: Phase['label'];
    let tone: Phase['tone'];
    if (isFirst) {
      label = 'Implementation';
      tone = 'healthy';
    } else if (isLast) {
      if (analysis.healthZone === 'degraded') {
        label = 'Deadlock';
        tone = 'critical';
      } else if (analysis.healthZone === 'watch') {
        label = 'Drift';
        tone = 'watch';
      } else {
        label = 'Wrap-up';
        tone = 'neutral';
      }
    } else {
      label = 'Recovery';
      tone = 'watch';
    }
    segments.push({
      from: boundaries[i],
      to: boundaries[i + 1],
      label,
      tone,
    });
  }
  return segments;
}

/**
 * Pick a small set of "round" minute marks so the X-axis labels stay readable.
 * Mirrors the niceTicks helper in `apps/Nakiros-new-design/viz.jsx`.
 */
function niceTicks(durMin: number): number[] {
  const step =
    durMin <= 30 ? 5 : durMin <= 90 ? 15 : durMin <= 240 ? 30 : durMin <= 720 ? 60 : 120;
  const ticks: number[] = [];
  for (let m = 0; m <= durMin; m += step) ticks.push(m);
  if (ticks[ticks.length - 1] !== durMin) ticks.push(Math.round(durMin));
  return ticks;
}

function fmtTimeLabel(min: number): string {
  if (min < 60) return `${Math.round(min)}m`;
  const h = Math.floor(min / 60);
  const m = Math.round(min - h * 60);
  return m === 0 ? `${h}h` : `${h}h${m.toString().padStart(2, '0')}`;
}

function safeStartTime(iso: string): { h: number; m: number } | null {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return { h: d.getHours(), m: d.getMinutes() };
}

function addClock(start: { h: number; m: number }, offsetMin: number): string {
  const total = (start.h * 60 + start.m + offsetMin) % (24 * 60);
  const h = Math.floor(total / 60);
  const m = Math.floor(total % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
