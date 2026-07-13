import { useMemo } from 'react';
import type { CodexConversationAnalysis, ConversationAnalysis } from '@nakiros/shared';

interface Props {
  analysis: ConversationAnalysis | CodexConversationAnalysis;
  width?: number;
  height?: number;
}

const MAX_SAMPLES = 80;

/**
 * Tiny sparkline for a conversation row — plots the real `contextSamples`
 * against the effective context window. The fill is tinted by the final
 * health zone so the eye groups rows by trajectory at a glance.
 */
export function ConvSparkline({ analysis, width = 120, height = 28 }: Props) {
  const yMax = analysis.contextWindow ?? analysis.maxContextTokens ?? 1;

  const samples = useMemo(
    () => downsample(analysis.contextSamples, MAX_SAMPLES),
    [analysis.contextSamples],
  );

  if (samples.length < 2) {
    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        aria-hidden="true"
      />
    );
  }

  const xFor = (pct: number) => pct * width;
  const yFor = (tokens: number) =>
    height - (Math.min(tokens, yMax) / yMax) * (height - 2) - 1;

  const tone = toneFor(analysis.healthZone);

  const points = samples.map((s) => `${xFor(s.offsetPct).toFixed(1)},${yFor(s.tokens).toFixed(1)}`);
  const linePath = `M${points.join(' L')}`;
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d={areaPath} fill={tone} fillOpacity={0.18} />
      <path d={linePath} fill="none" stroke={tone} strokeWidth={1.4} strokeLinecap="round" />
    </svg>
  );
}

function toneFor(zone: ConversationAnalysis['healthZone']): string {
  if (zone === 'degraded') return 'var(--n-critical)';
  if (zone === 'watch') return 'var(--n-watch)';
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
