import { useI18n } from '@/i18n/I18nProvider';
import { Sparkline } from './viz/Sparkline';
import { ScoreRing } from './viz/ScoreRing';

// Deterministic random walk for sparklines (seeded, no Math.random)
function rw(n: number, base = 50, step = 8, max = 100, seed = 1): number[] {
  let s = seed;
  const r = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  let v = base;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    v += (r() - 0.5) * step * 2;
    if (v < 0) v = 0;
    if (v > max) v = max;
    out.push(v);
  }
  return out;
}

interface Skill {
  id: string;
  name: string;
  desc: string;
  iteration: number;
  evals: number;
  audits: number;
  passRate: number | null;
  trend: number[];
  draft?: boolean;
}

const SKILLS: Skill[] = [
  {
    id: 'nakiros-skill-factory',
    name: 'nakiros-skill-factory',
    desc: 'Creates, audits, and improves agent skills for any project. Use when creating a new skill, reviewing existing…',
    iteration: 12, evals: 6, audits: 2, passRate: 76,
    trend: rw(12, 60, 9, 100, 7),
  },
  {
    id: 'nakiros-conversation-analyst',
    name: 'nakiros-conversation-analyst',
    desc: 'Performs a deep, narrative analysis of a single Claude Code JSONL conversation to identify…',
    iteration: 5, evals: 4, audits: 1, passRate: 80,
    trend: rw(12, 55, 9, 100, 9),
  },
  {
    id: 'proposal-engine',
    name: 'proposal-engine',
    desc: 'Detects recurring frictions across conversations and proposes targeted skill improvements with deltas.',
    iteration: 8, evals: 3, audits: 2, passRate: 60,
    trend: rw(12, 50, 12, 100, 11),
  },
  {
    id: 'commit-message-writer',
    name: 'commit-message-writer',
    desc: 'Writes conventional commit messages from a diff. Skill in creation — eval pending.',
    iteration: 1, evals: 1, audits: 0, passRate: null,
    trend: rw(12, 30, 6, 100, 13),
    draft: true,
  },
];

function NumCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-1.5 md:flex-col md:items-center md:gap-0">
      <span className="lp-mono text-[10px] uppercase tracking-wider text-[color:var(--fg-faint)] md:hidden">
        {label}
      </span>
      <span
        className="lp-mono text-[13px] text-[color:var(--fg-muted)]"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * "Skills Factory" section — table with pass-rate rings and trend sparklines.
 * Maps to section 06 of v2 (FactorySection).
 */
export function Factory() {
  const { messages } = useI18n();
  const c = messages.factory;

  return (
    <section id="factory" className="relative z-10 py-24">
      <div className="mx-auto max-w-[1180px] px-6 md:px-9">
        {/* Section head */}
        <div className="mb-10">
          <p className="lp-mono mb-3.5 text-[10.5px] uppercase tracking-[1.4px] text-[color:var(--fg-subtle)]">
            {c.label}
          </p>
          <h2 className="mb-2 max-w-[720px] text-[38px] font-medium leading-tight tracking-[-0.6px] text-[color:var(--fg)]">
            {c.title}
          </h2>
          <p className="max-w-[560px] text-[15px] leading-relaxed text-[color:var(--fg-muted)]">
            {c.sub}
          </p>
        </div>

        <div className="overflow-hidden rounded-[10px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)]">
          {/* Table header — hidden on mobile, shown md+ */}
          <div
            className="lp-mono hidden border-b border-[color:var(--border-subtle)] bg-[color:var(--bg-sunken)] px-4 py-2.5 uppercase md:grid md:grid-cols-[2fr_60px_60px_60px_72px_1fr] md:gap-3"
            style={{
              fontSize: 9.5,
              letterSpacing: 0.7,
              color: 'var(--fg-faint)',
            }}
          >
            {c.cols.map((h, i) => (
              <span
                key={i}
                className={i >= 1 && i <= 3 ? 'text-center' : i === 4 ? 'text-center' : 'text-left'}
              >
                {h}
              </span>
            ))}
          </div>

          {SKILLS.map((s, i) => {
            const passColor =
              s.passRate == null ? 'var(--accent)'
              : s.passRate >= 85 ? 'var(--healthy)'
              : s.passRate >= 70 ? 'var(--accent)'
              : s.passRate >= 50 ? 'var(--watch)'
              : 'var(--critical)';
            const fillColor =
              s.passRate != null && s.passRate >= 85
                ? 'var(--healthy-soft)'
                : 'var(--accent-soft)';
            const isLast = i === SKILLS.length - 1;

            return (
              <div
                key={s.id}
                className="px-4 py-3.5 md:grid md:items-center md:gap-3 md:grid-cols-[2fr_60px_60px_60px_72px_1fr]"
                style={{
                  borderBottom: isLast ? 'none' : '1px solid var(--border-subtle)',
                }}
              >
                <div className="min-w-0">
                  <p className="lp-mono text-[13px] font-medium text-[color:var(--fg)]">
                    {s.name}
                  </p>
                  <p
                    className="mt-0.5 text-[12px] text-[color:var(--fg-muted)] md:overflow-hidden md:text-ellipsis md:whitespace-nowrap md:pr-3"
                  >
                    {s.desc}
                  </p>
                </div>

                {/* Stats — flex-wrap row on mobile, individual grid cells on md+ */}
                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 md:mt-0 md:contents">
                  <NumCell label="iter"   value={s.iteration} />
                  <NumCell label="evals"  value={s.evals} />
                  <NumCell label="audits" value={s.audits} />
                  <div className="flex items-center justify-center md:justify-center">
                    {s.passRate != null ? (
                      <ScoreRing value={s.passRate} size={42} />
                    ) : (
                      <span
                        className="lp-mono inline-flex items-center rounded px-1.5 py-0.5 text-[10.5px] font-medium"
                        style={{
                          background: 'var(--info-soft)',
                          color: 'var(--info)',
                          border: '1px solid oklch(0.78 0.10 240 / 0.4)',
                        }}
                      >
                        draft
                      </span>
                    )}
                  </div>
                  <div className="flex items-center">
                    <Sparkline
                      data={s.trend}
                      w={140}
                      h={28}
                      color={passColor}
                      fill={fillColor}
                      dot
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
