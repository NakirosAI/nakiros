import { useMemo, useRef, useState } from 'react';
import type { ConversationAnalysis, ConversationCostSample, ConversationFrictionZone, SentimentTrace, SentimentEntry, SentimentLabel } from '@nakiros/shared';
import { useTranslation } from 'react-i18next';

interface Props {
  analysis: ConversationAnalysis;
  /** Optional sentiment trace from the sentiment pre-pass service. */
  sentimentTrace?: SentimentTrace | null;
}

const W = 920;
const PAD_L = 70;
const PAD_R = 18;
const PAD_T = 6;
const EVENT_LANE_H = 28;
const COST_H = 200;
const GAP = 10;
const CTX_H = 80;
/** Thin dot row for the sentiment track — placed below the ctx track. */
const SENTIMENT_GAP = 8;
const SENTIMENT_H = 20;
const PAD_B = 36;

const Y_COST_BASE = PAD_T + EVENT_LANE_H + COST_H;
const Y_CTX_TOP = Y_COST_BASE + GAP;
const Y_CTX_BASE = Y_CTX_TOP + CTX_H;
const Y_SENTIMENT_TOP = Y_CTX_BASE + SENTIMENT_GAP;
const Y_SENTIMENT_MID = Y_SENTIMENT_TOP + SENTIMENT_H / 2;
const Y_SENTIMENT_BASE = Y_SENTIMENT_TOP + SENTIMENT_H;
const H = Y_SENTIMENT_BASE + PAD_B;
const INNER_W = W - PAD_L - PAD_R;

const HEALTHY_PCT = 0.25;
const WATCH_PCT = 0.75;
const MAX_SAMPLES = 220;

const M_INPUT = 1;
const M_OUTPUT = 5;
const M_CACHE_READ = 0.1;
const M_CACHE_5M = 1.25;
const M_CACHE_1H = 2;

interface StackPoint {
  tMs: number;
  /** Cumulative billed for input layer. */
  input: number;
  /** Cumulative billed for input + output. */
  output: number;
  /** Cumulative billed for input + output + cacheRead. */
  cacheRead: number;
  /** Cumulative billed for input + output + cacheRead + cache useful (cache_create not from a wasted rewrite). */
  cacheUseful: number;
  /** Total cumulative billed (top of stack). */
  total: number;
}

/**
 * Sismograph — variante A (cost-stacked + ctx).
 *
 * Reads `analysis.costSamples` to render a stacked area of the cumulative
 * billed-equivalent split by origin (input · output · cache read · cache
 * useful · cache wasted-after-pause). The wasted layer is tinted critical so
 * cache rewrites after a > TTL pause are immediately visible.
 *
 * Below the cost track, a smaller context track shows ctx % of window with
 * health bands. Pause and compaction markers anchor the timeline; friction
 * and tool-error are accessible via the hover tooltip and the Impact panel
 * (kept off the chart to reduce visual noise).
 */
export function Sismograph({ analysis, sentimentTrace }: Props) {
  const { t } = useTranslation('conversations');
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverT, setHoverT] = useState<number | null>(null);
  const [hoverSentiment, setHoverSentiment] = useState<{
    entry: SentimentEntry;
    x: number;
    y: number;
  } | null>(null);
  const [hoverZone, setHoverZone] = useState<{
    zone: ConversationFrictionZone;
    x: number;
  } | null>(null);

  // Downsample for paths (keeps SVG light on huge sessions).
  const samples = useMemo(
    () => downsample(analysis.costSamples ?? [], MAX_SAMPLES),
    [analysis.costSamples],
  );

  // Build cumulative stack points from raw cost samples.
  const stackPoints = useMemo(() => buildStack(samples), [samples]);

  const totalBilled = stackPoints.length > 0 ? stackPoints[stackPoints.length - 1].total : 0;

  const durationMs = analysis.durationMs;
  const xFor = (tMs: number) =>
    PAD_L + (durationMs > 0 ? Math.min(1, tMs / durationMs) : 0) * INNER_W;
  const yCost = (v: number) =>
    Y_COST_BASE - (totalBilled > 0 ? Math.min(1, v / totalBilled) : 0) * COST_H;

  // Stacked area paths
  const stackPaths = useMemo(() => {
    if (stackPoints.length < 2) return null;
    const pathFor = (top: (p: StackPoint) => number, bottom: (p: StackPoint) => number) => {
      const topPts = stackPoints.map((p) => `${xFor(p.tMs).toFixed(1)},${yCost(top(p)).toFixed(1)}`).join(' L');
      const botPts = [...stackPoints].reverse().map((p) => `${xFor(p.tMs).toFixed(1)},${yCost(bottom(p)).toFixed(1)}`).join(' L');
      return `M${topPts} L${botPts} Z`;
    };
    return {
      input: pathFor((p) => p.input, () => 0),
      output: pathFor((p) => p.output, (p) => p.input),
      cacheRead: pathFor((p) => p.cacheRead, (p) => p.output),
      cacheUseful: pathFor((p) => p.cacheUseful, (p) => p.cacheRead),
      cacheWasted: pathFor((p) => p.total, (p) => p.cacheUseful),
      totalLine: 'M ' + stackPoints.map((p) => `${xFor(p.tMs).toFixed(1)},${yCost(p.total).toFixed(1)}`).join(' L'),
    };
    // xFor/yCost depend on durationMs and totalBilled
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stackPoints, durationMs, totalBilled]);

  // Context track
  const ctxYMax = analysis.contextWindow;
  const yCtx = (v: number) =>
    Y_CTX_BASE - (ctxYMax > 0 ? Math.min(1, v / ctxYMax) : 0) * CTX_H;
  const ctxPath = useMemo(() => {
    const pts = (analysis.costSamples ?? []).map((s) => {
      const ctx = s.input + s.cacheRead + s.cache5m + s.cache1h;
      return `${xFor(s.tMs).toFixed(1)},${yCtx(ctx).toFixed(1)}`;
    });
    if (pts.length < 2) return { area: '', line: '' };
    const linePath = 'M ' + pts.join(' L');
    const areaPath = linePath + ` L ${xFor(durationMs).toFixed(1)},${Y_CTX_BASE} L ${xFor(0).toFixed(1)},${Y_CTX_BASE} Z`;
    return { area: areaPath, line: linePath };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis.costSamples, durationMs, ctxYMax]);

  const ctxWatchY = yCtx(ctxYMax * HEALTHY_PCT);
  const ctxCritY = yCtx(ctxYMax * WATCH_PCT);

  // Time axis ticks
  const ticks = useMemo(() => niceTicks(durationMs / 60_000), [durationMs]);
  const startClock = useMemo(() => safeStartTime(analysis.startedAt), [analysis.startedAt]);

  // Hover handling
  const onMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current || durationMs <= 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const xPx = ((e.clientX - rect.left) / rect.width) * W;
    if (xPx < PAD_L || xPx > W - PAD_R) {
      setHoverT(null);
      return;
    }
    const t = (xPx - PAD_L) / INNER_W;
    setHoverT(Math.max(0, Math.min(1, t)));
  };
  const onMouseLeave = () => setHoverT(null);

  // Find nearest sample for tooltip
  const hoverSample = useMemo(() => {
    if (hoverT === null || (analysis.costSamples ?? []).length === 0) return null;
    const targetMs = hoverT * durationMs;
    let best: ConversationCostSample | null = null;
    let bestD = Infinity;
    for (const s of analysis.costSamples) {
      const d = Math.abs(s.tMs - targetMs);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
  }, [hoverT, analysis.costSamples, durationMs]);

  const hoverNearestMarker = useMemo(() => {
    if (hoverT === null) return null;
    const targetMs = hoverT * durationMs;
    const window = durationMs * 0.02;
    type M = { kind: 'compaction' | 'pause' | 'friction' | 'error'; tMs: number; label: string; detail?: string };
    const all: M[] = [];
    for (const c of analysis.compactions) {
      const tMs = new Date(c.timestamp).getTime() - new Date(analysis.startedAt).getTime();
      all.push({ kind: 'compaction', tMs, label: t('hover.compaction'), detail: c.trigger });
    }
    for (const p of analysis.pausePoints) {
      all.push({
        kind: 'pause',
        tMs: p.tMs,
        label: t('hover.pause'),
        detail: `${Math.round(p.gapMs / 60_000)}min · ${fmtTokensShort(p.wastedTokens)} rewrite`,
      });
    }
    for (const f of analysis.frictionPoints) {
      const tMs = new Date(f.timestamp).getTime() - new Date(analysis.startedAt).getTime();
      const kind = frictionKindFromPattern(f.matchedPattern);
      const label =
        kind === 'sentiment' ? t('hover.frictionSentiment') :
        kind === 'backtrack' ? t('hover.frictionBacktrack') :
        kind === 'repetition' ? t('hover.frictionRepetition') :
        t('hover.friction');
      const detail = frictionDetail(kind, f.matchedPattern, f.snippet);
      all.push({ kind: 'friction', tMs, label, detail });
    }
    let nearest: (M & { d: number }) | null = null;
    for (const m of all) {
      const d = Math.abs(m.tMs - targetMs);
      if (d <= window && (!nearest || d < nearest.d)) {
        nearest = { ...m, d };
      }
    }
    return nearest;
  }, [hoverT, analysis, durationMs, t]);

  // Build sentiment dot positions — X is estimated from messageIndex proportional to duration;
  // Y is the label-signed confidence score mapped into the SENTIMENT_H band.
  const sentimentDots = useMemo(() => {
    const entries = sentimentTrace?.entries ?? [];
    // Denominator MUST be the user-message count (matches messageIndex's 1..N
    // user numbering), not the total message count — using total clusters dots
    // at the start because user messages are typically fewer than assistant ones.
    const userMsgCount =
      sentimentTrace && sentimentTrace.observed > 0 ? sentimentTrace.observed : 1;
    return entries.map((e) => {
      // Estimate tMs by distributing user messages uniformly across the session duration.
      const tMs = (e.messageIndex / userMsgCount) * durationMs;
      const x = xFor(tMs);
      // Positive → above mid, Negative → below mid, Neutral → at mid.
      const amplitude = scoreToAmplitude(e.label, e.score);
      const y = Y_SENTIMENT_MID - amplitude * (SENTIMENT_H / 2);
      // Opacity gradient — low-confidence dots fade into the background, high-confidence
      // dots stand out. Clamp to [0.25, 1.0] so even low-score dots remain visible.
      const opacity = Math.max(0.25, Math.min(1.0, e.score));
      return { x, y, color: labelToColor(e.label), opacity, entry: e };
    });
    // xFor depends on durationMs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sentimentTrace, durationMs]);

  if ((analysis.costSamples ?? []).length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-[var(--n-fg-muted)]">
        {t('drawer.noTimelineData', { defaultValue: 'Pas de données temporelles disponibles' })}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden"
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" preserveAspectRatio="none">
        {/* Event lane label */}
        <text
          x={PAD_L - 12}
          y={PAD_T + EVENT_LANE_H / 2 + 3}
          textAnchor="end"
          fontFamily="var(--n-font-mono)"
          fontSize={9}
          fill="var(--n-fg-faint)"
          style={{ letterSpacing: '0.6px', textTransform: 'uppercase' }}
        >
          events
        </text>

        {/* Track labels */}
        <text
          x={PAD_L - 12}
          y={PAD_T + EVENT_LANE_H + 14}
          textAnchor="end"
          fontFamily="var(--n-font-mono)"
          fontSize={9}
          fill="var(--n-fg-subtle)"
          style={{ letterSpacing: '0.6px', textTransform: 'uppercase' }}
        >
          cost
        </text>
        <text
          x={PAD_L - 12}
          y={Y_CTX_TOP + CTX_H / 2 + 3}
          textAnchor="end"
          fontFamily="var(--n-font-mono)"
          fontSize={9}
          fill="var(--n-fg-subtle)"
          style={{ letterSpacing: '0.6px', textTransform: 'uppercase' }}
        >
          ctx
        </text>
        {sentimentDots.length > 0 && (
          <text
            x={PAD_L - 12}
            y={Y_SENTIMENT_MID + 3}
            textAnchor="end"
            fontFamily="var(--n-font-mono)"
            fontSize={9}
            fill="var(--n-fg-faint)"
            style={{ letterSpacing: '0.6px', textTransform: 'uppercase' }}
          >
            {t('drawer.sentimentTrack')}
          </text>
        )}

        {/* Friction zone background rectangles — rendered first (lowest z-order) */}
        {(analysis.frictionZones ?? []).map((zone, i) => {
          const zoneStartMs = new Date(zone.startTimestamp).getTime() - new Date(analysis.startedAt).getTime();
          const zoneEndMs = new Date(zone.endTimestamp).getTime() - new Date(analysis.startedAt).getTime();
          const x1 = xFor(zoneStartMs);
          const x2 = xFor(zoneEndMs);
          const rectWidth = Math.max(2, x2 - x1);
          const rectHeight = Y_SENTIMENT_BASE - PAD_T;
          const fillOpacity = zone.severity === 'high' ? 0.16 : zone.severity === 'medium' ? 0.10 : 0.06;
          return (
            <rect
              key={`fz${i}`}
              x={x1}
              y={PAD_T}
              width={rectWidth}
              height={rectHeight}
              fill="var(--n-critical, #e0405a)"
              fillOpacity={fillOpacity}
              style={{ cursor: 'default' }}
              onMouseEnter={() => setHoverZone({ zone, x: (x1 + x2) / 2 })}
              onMouseLeave={() => setHoverZone(null)}
            />
          );
        })}

        {/* Vertical tick gridlines */}
        {ticks.map((m, i) => {
          const x = xFor(m * 60_000);
          const gridBottom = sentimentDots.length > 0 ? Y_SENTIMENT_BASE : Y_CTX_BASE;
          return (
            <line
              key={i}
              x1={x}
              x2={x}
              y1={PAD_T + EVENT_LANE_H}
              y2={gridBottom}
              stroke="var(--n-border-subtle)"
              strokeDasharray="1 4"
              opacity="0.6"
            />
          );
        })}

        {/* Ctx zone bands */}
        <rect
          x={PAD_L}
          y={Y_CTX_TOP}
          width={INNER_W}
          height={ctxCritY - Y_CTX_TOP}
          fill="var(--n-critical)"
          fillOpacity={0.06}
        />
        <rect
          x={PAD_L}
          y={ctxCritY}
          width={INNER_W}
          height={ctxWatchY - ctxCritY}
          fill="var(--n-watch)"
          fillOpacity={0.06}
        />
        <rect
          x={PAD_L}
          y={ctxWatchY}
          width={INNER_W}
          height={Y_CTX_BASE - ctxWatchY}
          fill="var(--n-healthy)"
          fillOpacity={0.06}
        />
        <line
          x1={PAD_L}
          x2={W - PAD_R}
          y1={ctxCritY}
          y2={ctxCritY}
          stroke="var(--n-critical)"
          strokeOpacity={0.35}
          strokeDasharray="2 4"
        />
        <line
          x1={PAD_L}
          x2={W - PAD_R}
          y1={ctxWatchY}
          y2={ctxWatchY}
          stroke="var(--n-watch)"
          strokeOpacity={0.35}
          strokeDasharray="2 4"
        />

        {/* Vertical event guides (compactions + pauses, full chart) */}
        {analysis.compactions.map((c, i) => {
          const tMs = new Date(c.timestamp).getTime() - new Date(analysis.startedAt).getTime();
          const x = xFor(tMs);
          return (
            <line
              key={`cv${i}`}
              x1={x}
              x2={x}
              y1={PAD_T + EVENT_LANE_H / 2}
              y2={Y_CTX_BASE}
              stroke="var(--n-info)"
              strokeOpacity={0.35}
              strokeDasharray="2 3"
            />
          );
        })}
        {analysis.pausePoints.map((p, i) => (
          <line
            key={`pv${i}`}
            x1={xFor(p.tMs)}
            x2={xFor(p.tMs)}
            y1={PAD_T + EVENT_LANE_H / 2}
            y2={Y_CTX_BASE}
            stroke="var(--n-violet)"
            strokeOpacity={0.45}
            strokeDasharray="2 3"
          />
        ))}

        {/* Cost track baseline + ctx baseline */}
        <line
          x1={PAD_L}
          x2={W - PAD_R}
          y1={Y_COST_BASE}
          y2={Y_COST_BASE}
          stroke="var(--n-border-default)"
        />
        <line
          x1={PAD_L}
          x2={W - PAD_R}
          y1={Y_CTX_BASE}
          y2={Y_CTX_BASE}
          stroke="var(--n-border-default)"
        />

        {/* Cost stacked areas (bottom to top) */}
        {stackPaths && (
          <>
            <path d={stackPaths.input} fill="oklch(0.78 0.10 195)" fillOpacity={0.55} />
            <path d={stackPaths.output} fill="oklch(0.80 0.13 165)" fillOpacity={0.55} />
            <path d={stackPaths.cacheRead} fill="oklch(0.78 0.10 240)" fillOpacity={0.4} />
            <path d={stackPaths.cacheUseful} fill="oklch(0.74 0.13 295)" fillOpacity={0.35} />
            <path d={stackPaths.cacheWasted} fill="var(--n-critical)" fillOpacity={0.55} />
            <path
              d={stackPaths.totalLine}
              fill="none"
              stroke="var(--n-accent)"
              strokeWidth={1.3}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.9}
            />
          </>
        )}

        {/* Total billed label on the right */}
        {totalBilled > 0 && (
          <text
            x={W - PAD_R - 4}
            y={yCost(totalBilled) - 4}
            textAnchor="end"
            fontFamily="var(--n-font-mono)"
            fontSize={11}
            fill="var(--n-accent)"
            fontWeight={500}
          >
            {fmtTokensShort(totalBilled)}
          </text>
        )}

        {/* Ctx track */}
        <path d={ctxPath.area} fill="var(--n-track-context)" fillOpacity={0.18} />
        <path
          d={ctxPath.line}
          fill="none"
          stroke="var(--n-track-context)"
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Sentiment track — thin dot row below ctx, one dot per scored user message */}
        {sentimentDots.length > 0 && (
          <>
            <line
              x1={PAD_L}
              x2={W - PAD_R}
              y1={Y_SENTIMENT_MID}
              y2={Y_SENTIMENT_MID}
              stroke="var(--n-border-subtle)"
              strokeDasharray="1 3"
              opacity={0.4}
            />
            {sentimentDots.map((d, i) => (
              <circle
                key={i}
                cx={d.x}
                cy={d.y}
                r={3}
                fill={d.color}
                fillOpacity={d.opacity}
                style={{ cursor: 'default' }}
                onMouseEnter={() => setHoverSentiment({ entry: d.entry, x: d.x, y: d.y })}
                onMouseLeave={() => setHoverSentiment(null)}
              >
                <title>{`#${d.entry.messageIndex} · ${d.entry.label} ${d.entry.score.toFixed(2)}`}</title>
              </circle>
            ))}
          </>
        )}

        {/* Markers (drop-pins on event lane) */}
        {analysis.compactions.map((c, i) => {
          const tMs = new Date(c.timestamp).getTime() - new Date(analysis.startedAt).getTime();
          return (
            <Marker
              key={`mc${i}`}
              x={xFor(tMs)}
              color="var(--n-info)"
              tooltip={`Compaction · ${c.trigger}`}
            />
          );
        })}
        {analysis.pausePoints.map((p, i) => (
          <Marker
            key={`mp${i}`}
            x={xFor(p.tMs)}
            color="var(--n-violet)"
            tooltip={`Pause ${Math.round(p.gapMs / 60_000)}min · ${fmtTokensShort(p.wastedTokens)} rewrite`}
          />
        ))}

        {/* Crosshair vertical line */}
        {hoverT !== null && (
          <line
            x1={PAD_L + hoverT * INNER_W}
            x2={PAD_L + hoverT * INNER_W}
            y1={PAD_T}
            y2={sentimentDots.length > 0 ? Y_SENTIMENT_BASE : Y_CTX_BASE}
            stroke="var(--n-fg)"
            strokeWidth={1}
            opacity={0.5}
          />
        )}

        {/* X-axis ticks — anchored below sentiment lane if present, else below ctx */}
        {ticks.map((m, i) => {
          const x = xFor(m * 60_000);
          const isEdge = i === 0 || i === ticks.length - 1;
          const axisY = sentimentDots.length > 0 ? Y_SENTIMENT_BASE : Y_CTX_BASE;
          return (
            <g key={`tick${m}`}>
              <line
                x1={x}
                x2={x}
                y1={axisY}
                y2={axisY + 4}
                stroke="var(--n-border-default)"
              />
              <text
                x={x}
                y={axisY + 14}
                textAnchor="middle"
                fontFamily="var(--n-font-mono)"
                fontSize={9.5}
                fill={isEdge ? 'var(--n-fg-muted)' : 'var(--n-fg-subtle)'}
              >
                T+{fmtTimeLabel(m)}
              </text>
              {startClock && (
                <text
                  x={x}
                  y={axisY + 25}
                  textAnchor="middle"
                  fontFamily="var(--n-font-mono)"
                  fontSize={8.5}
                  fill="var(--n-fg-faint)"
                >
                  {addClock(startClock, m)}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Time pill */}
      {hoverT !== null && (
        <div
          className="pointer-events-none absolute font-mono text-[10.5px] text-[var(--n-bg-canvas)]"
          style={{
            left: `calc(${((PAD_L + hoverT * INNER_W) / W) * 100}% - 28px)`,
            top: 0,
            background: 'var(--n-fg)',
            padding: '2px 6px',
            borderRadius: 3,
            whiteSpace: 'nowrap',
          }}
        >
          T+{fmtTimeLabel((hoverT * durationMs) / 60_000)}
          {startClock && ` · ${addClock(startClock, (hoverT * durationMs) / 60_000)}`}
        </div>
      )}

      {/* Tooltip */}
      {hoverT !== null && hoverSample && (
        <Tooltip
          hoverT={hoverT}
          sample={hoverSample}
          marker={hoverNearestMarker}
          startClock={startClock}
          durationMs={durationMs}
          contextWindow={analysis.contextWindow}
          t={t}
        />
      )}

      {/* Sentiment dot tooltip */}
      {hoverSentiment && (
        <div
          className="pointer-events-none absolute z-20 max-w-xs rounded-md border border-[var(--n-border-default)] bg-[var(--n-bg-surface)] px-3 py-2 text-xs shadow-md"
          style={{
            // Project SVG x coordinate to % of container width, then offset right
            left: `calc(${(hoverSentiment.x / W) * 100}% + 8px)`,
            // Project SVG y coordinate to % of container height.
            // H is the total SVG height; the container maps H to 100% height.
            top: `calc(${(hoverSentiment.y / H) * 100}% - 4px)`,
          }}
        >
          <div className="font-medium text-[var(--n-fg)]">
            {t('drawer.sentimentTooltip.title', {
              index: hoverSentiment.entry.messageIndex,
              label: t(`drawer.sentimentTooltip.labels.${hoverSentiment.entry.label.toLowerCase()}`),
              score: hoverSentiment.entry.score.toFixed(2),
            })}
          </div>
          {hoverSentiment.entry.excerpt && (
            <div className="mt-1 whitespace-pre-wrap break-words text-[var(--n-fg-muted)]">
              {hoverSentiment.entry.excerpt}
            </div>
          )}
        </div>
      )}

      {/* Friction zone hover tooltip */}
      {hoverZone && !hoverSentiment && (
        <div
          className="pointer-events-none absolute z-20 max-w-xs rounded-md border border-[var(--n-border-default)] bg-[var(--n-bg-surface)] px-3 py-2 text-xs shadow-md"
          style={{
            left: `calc(${(hoverZone.x / W) * 100}% + 8px)`,
            top: 28,
          }}
        >
          <div className="mb-1 flex items-center gap-1.5">
            <span
              className="inline-block rounded-sm px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white"
              style={{
                background: 'var(--n-critical, #e0405a)',
                letterSpacing: '0.6px',
              }}
            >
              {hoverZone.zone.severity}
            </span>
            <span className="text-[var(--n-fg-muted)]">
              {(() => {
                const kind = frictionKindFromPattern(hoverZone.zone.reactionPoint.matchedPattern);
                return kind === 'sentiment' ? t('hover.frictionSentiment')
                  : kind === 'backtrack' ? t('hover.frictionBacktrack')
                  : kind === 'repetition' ? t('hover.frictionRepetition')
                  : t('hover.friction');
              })()}
            </span>
          </div>
          <div className="text-[var(--n-fg-muted)]">
            {t('hover.zoneAgentContext', {
              calls: hoverZone.zone.agentContext.toolCallsCount,
              errors: hoverZone.zone.agentContext.toolErrorsCount,
              filesCount: hoverZone.zone.agentContext.filesTouched.length,
              defaultValue: `Agent: {{calls}} tool calls, {{errors}} errors, {{filesCount}} files`,
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Marker({ x, color, tooltip }: { x: number; color: string; tooltip: string }) {
  const y = PAD_T + EVENT_LANE_H / 2;
  return (
    <g>
      <circle
        cx={x}
        cy={y}
        r={3.75}
        fill={color}
        stroke="var(--n-bg-surface)"
        strokeWidth={1.5}
      />
      <line
        x1={x}
        x2={x}
        y1={y + 4}
        y2={PAD_T + EVENT_LANE_H}
        stroke={color}
        strokeWidth={1}
        opacity={0.7}
      />
      <title>{tooltip}</title>
    </g>
  );
}

function Tooltip({
  hoverT,
  sample,
  marker,
  startClock,
  durationMs,
  contextWindow,
  t,
}: {
  hoverT: number;
  sample: ConversationCostSample;
  marker: { kind: string; label: string; detail?: string } | null;
  startClock: { h: number; m: number } | null;
  durationMs: number;
  contextWindow: number;
  t: ReturnType<typeof useTranslation>[0];
}) {
  const onLeft = hoverT > 0.55;
  const xPct = ((PAD_L + hoverT * INNER_W) / W) * 100;
  const tMin = (hoverT * durationMs) / 60_000;
  const ctx = sample.input + sample.cacheRead + sample.cache5m + sample.cache1h;
  const ctxPct = contextWindow > 0 ? Math.round((ctx / contextWindow) * 100) : 0;

  return (
    <div
      className="pointer-events-none absolute z-10 rounded-md border border-[var(--n-border-default)] bg-[var(--n-bg-surface)] px-2.5 py-2 font-mono text-[11px] shadow-lg"
      style={{
        left: onLeft ? 'auto' : `calc(${xPct}% + 12px)`,
        right: onLeft ? `calc(${100 - xPct}% + 12px)` : 'auto',
        top: 28,
        minWidth: 200,
      }}
    >
      <div className="mb-1.5 flex justify-between gap-3 border-b border-[var(--n-border-subtle)] pb-1.5">
        <span className="text-[var(--n-fg)]">T+{fmtTimeLabel(tMin)}</span>
        {startClock && <span className="text-[var(--n-fg-muted)]">{addClock(startClock, tMin)}</span>}
      </div>
      <Row color="var(--n-accent)" label={t('hover.cumBilled')} value={fmtTokensShort(sample.cumBilled)} />
      <Row color="oklch(0.78 0.10 195)" label="input" value={fmtTokensShort(sample.input)} />
      <Row color="oklch(0.80 0.13 165)" label="output" value={fmtTokensShort(sample.output)} />
      <Row color="oklch(0.78 0.10 240)" label="cache read" value={fmtTokensShort(sample.cacheRead)} />
      {sample.cache5m + sample.cache1h > 0 && (
        <Row
          color={sample.wastedRewrite > 0 ? 'var(--n-critical)' : 'oklch(0.74 0.13 295)'}
          label={sample.wastedRewrite > 0 ? t('hover.wasted') : 'cache write'}
          value={fmtTokensShort(sample.cache5m + sample.cache1h)}
        />
      )}
      <Row color="var(--n-track-context)" label="ctx" value={`${fmtTokensShort(ctx)} (${ctxPct}%)`} />
      {marker && (
        <div className="mt-1.5 border-t border-[var(--n-border-subtle)] pt-1.5">
          <div className="flex items-center gap-1.5">
            <span
              className="block"
              style={{ width: 8, height: 8, borderRadius: 99, background: markerColor(marker.kind) }}
            />
            <span
              className="text-[9.5px] uppercase tracking-wider"
              style={{ color: markerColor(marker.kind), letterSpacing: '0.6px' }}
            >
              {marker.label}
            </span>
          </div>
          {marker.detail && (
            <div className="mt-1 text-[10.5px] text-[var(--n-fg-muted)]">{marker.detail}</div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 py-0.5">
      <span
        className="block flex-shrink-0"
        style={{ width: 8, height: 8, borderRadius: 99, background: color }}
      />
      <span
        className="flex-1 text-[9.5px] uppercase text-[var(--n-fg-muted)]"
        style={{ letterSpacing: '0.6px' }}
      >
        {label}
      </span>
      <span className="tabular-nums text-[var(--n-fg)]">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Friction helpers
// ---------------------------------------------------------------------------

/** Classify a `matchedPattern` string into one of the known friction families. */
export function frictionKindFromPattern(matchedPattern: string): 'sentiment' | 'backtrack' | 'repetition' | 'other' {
  if (matchedPattern.startsWith('sentiment:')) return 'sentiment';
  if (matchedPattern.startsWith('backtrack:')) return 'backtrack';
  if (matchedPattern.startsWith('repetition:')) return 'repetition';
  return 'other';
}

function parseBacktrack(matchedPattern: string): { file: string; from: string; to: string } | null {
  const m = matchedPattern.match(/^backtrack:(.+):T(\d+)→T(\d+)$/);
  return m ? { file: m[1], from: m[2], to: m[3] } : null;
}

function parseRepetition(matchedPattern: string): { turn: string; jaccard: number } | null {
  const m = matchedPattern.match(/^repetition:T(\d+):([\d.]+)$/);
  return m ? { turn: m[1], jaccard: parseFloat(m[2]) } : null;
}

/**
 * Build a human-readable tooltip detail line for a friction point.
 * - sentiment: show the snippet (user message text is informative)
 * - backtrack: show the file basename and turn range
 * - repetition: show the turn and similarity percentage
 * - other: fall back to the snippet
 */
function frictionDetail(
  kind: 'sentiment' | 'backtrack' | 'repetition' | 'other',
  matchedPattern: string,
  snippet: string,
): string {
  if (kind === 'backtrack') {
    const parsed = parseBacktrack(matchedPattern);
    if (parsed) {
      const basename = parsed.file.split('/').pop() ?? parsed.file;
      return `${basename} · T${parsed.from}→T${parsed.to}`;
    }
  }
  if (kind === 'repetition') {
    const parsed = parseRepetition(matchedPattern);
    if (parsed) {
      return `turn T${parsed.turn} · ${Math.round(parsed.jaccard * 100)}% similar`;
    }
  }
  // sentiment + other: snippet is the most informative detail
  return `"${snippet.slice(0, 60)}…"`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildStack(samples: ConversationCostSample[]): StackPoint[] {
  const out: StackPoint[] = [];
  let cumInput = 0;
  let cumOutput = 0;
  let cumCacheRead = 0;
  let cumCacheUseful = 0;
  let cumCacheWasted = 0;
  for (const s of samples) {
    cumInput += s.input * M_INPUT;
    cumOutput += s.output * M_OUTPUT;
    cumCacheRead += s.cacheRead * M_CACHE_READ;
    const cache5mWasted = Math.min(s.wastedRewrite, s.cache5m);
    const cache1hWasted = Math.max(0, s.wastedRewrite - s.cache5m);
    const cache5mUseful = s.cache5m - cache5mWasted;
    const cache1hUseful = s.cache1h - cache1hWasted;
    const usefulBilled = cache5mUseful * M_CACHE_5M + cache1hUseful * M_CACHE_1H;
    const wastedBilled = cache5mWasted * M_CACHE_5M + cache1hWasted * M_CACHE_1H;
    cumCacheUseful += usefulBilled;
    cumCacheWasted += wastedBilled;
    out.push({
      tMs: s.tMs,
      input: cumInput,
      output: cumInput + cumOutput,
      cacheRead: cumInput + cumOutput + cumCacheRead,
      cacheUseful: cumInput + cumOutput + cumCacheRead + cumCacheUseful,
      total: cumInput + cumOutput + cumCacheRead + cumCacheUseful + cumCacheWasted,
    });
  }
  return out;
}

function downsample<T>(samples: T[], target: number): T[] {
  if (samples.length <= target) return samples;
  const step = samples.length / target;
  const out: T[] = [];
  for (let i = 0; i < target; i++) out.push(samples[Math.floor(i * step)]);
  const last = samples[samples.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

function niceTicks(durMin: number): number[] {
  if (durMin <= 0) return [0];
  const step =
    durMin <= 30 ? 5 : durMin <= 90 ? 15 : durMin <= 240 ? 30 : durMin <= 720 ? 60 : 120;
  const ticks: number[] = [];
  for (let m = 0; m <= durMin; m += step) ticks.push(m);
  if (ticks[ticks.length - 1] !== durMin) ticks.push(Math.round(durMin));
  return ticks;
}

function fmtTimeLabel(min: number): string {
  if (min < 1) return `${Math.round(min * 60)}s`;
  if (min < 60) return `${Math.round(min)}m`;
  const h = Math.floor(min / 60);
  const m = Math.round(min - h * 60);
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
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

function fmtTokensShort(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 10_000) return `${Math.round(v / 1000)}k`;
  if (v >= 1_000) return `${(v / 1000).toFixed(1)}k`;
  return Math.round(v).toString();
}

function scoreToAmplitude(label: SentimentLabel, score: number): number {
  if (label === 'Negative') return -score;
  if (label === 'Positive') return score;
  return 0;
}

function labelToColor(label: SentimentLabel): string {
  // Use existing palette: --n-critical (red-leaning) for Negative,
  // --n-healthy (green-leaning) for Positive, --n-fg-faint for Neutral.
  if (label === 'Negative') return 'var(--n-critical)';
  if (label === 'Positive') return 'var(--n-healthy)';
  return 'var(--n-fg-faint)';
}

function markerColor(kind: string): string {
  switch (kind) {
    case 'compaction':
      return 'var(--n-info)';
    case 'pause':
      return 'var(--n-violet)';
    case 'friction':
      return 'var(--n-critical)';
    case 'error':
      return 'var(--n-watch)';
    default:
      return 'var(--n-fg-subtle)';
  }
}
