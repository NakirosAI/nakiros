import type { ReactElement } from 'react';
import { AlertTriangle, CheckCircle, Sparkles, TrendingDown, TrendingUp, Zap } from 'lucide-react';
import clsx from 'clsx';
import type { EvalMatrixTag as Tag } from '@nakiros/shared';

/** Compact badge summarising an eval's behaviour across iterations. */
export function EvalMatrixTagBadge({ tag }: { tag: Tag }) {
  const { label, icon, className, tooltip } = describe(tag);
  return (
    <span
      title={tooltip}
      className={clsx(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap',
        className,
      )}
    >
      {icon}
      {label}
    </span>
  );
}

function describe(tag: Tag): { label: string; icon: ReactElement; className: string; tooltip: string } {
  switch (tag.kind) {
    case 'stable':
      return {
        label: 'STABLE',
        icon: <CheckCircle size={10} />,
        className: 'bg-emerald-500/20 text-emerald-400',
        tooltip: `Pass rate is consistent (σ = ${(tag.variance * 100).toFixed(0)}%).`,
      };
    case 'flaky':
      return {
        label: 'FLAKY',
        icon: <AlertTriangle size={10} />,
        className: 'bg-amber-500/20 text-amber-400',
        tooltip: `Pass rate oscillates since iter ${tag.since} (σ = ${(tag.variance * 100).toFixed(0)}%). The skill itself changed between diverging iterations — either the skill is non-deterministic or an assertion is ill-specified.`,
      };
    case 'broken':
      return {
        label: 'BROKEN',
        icon: <TrendingDown size={10} />,
        className: 'bg-red-500/20 text-red-400',
        tooltip: `Pass rate dropped by ${(tag.drop * 100).toFixed(0)}% at iter ${tag.since}, and the skill fingerprint changed — this is a real regression caused by a recent edit.`,
      };
    case 'fixed':
      return {
        label: 'FIXED',
        icon: <TrendingUp size={10} />,
        className: 'bg-emerald-500/20 text-emerald-400',
        tooltip: `Pass rate gained +${(tag.gain * 100).toFixed(0)}% at iter ${tag.since} following a skill change. A recent edit resolved this test.`,
      };
    case 'new':
      return {
        label: 'NEW',
        icon: <Sparkles size={10} />,
        className: 'bg-sky-500/20 text-sky-400',
        tooltip: `This eval first appeared at iter ${tag.since}.`,
      };
    case 'noisy':
      return {
        label: 'NOISY',
        icon: <Zap size={10} />,
        className: 'bg-slate-500/20 text-slate-400',
        tooltip: `Pass rate varies (σ = ${(tag.variance * 100).toFixed(0)}%) but the skill fingerprint didn't change between diverging iterations. Likely LLM-judge variance — don't treat as a regression.`,
      };
  }
}
