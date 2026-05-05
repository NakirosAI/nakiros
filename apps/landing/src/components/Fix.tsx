import { useI18n } from '@/i18n/I18nProvider';

// Eval cell component (pass/total badge)
function EvalCell({ pass, total, baseline = false }: { pass: number; total: number; baseline?: boolean }) {
  const ratio = pass / total;
  let tone = 'healthy';
  if (ratio < 0.85) tone = 'watch';
  if (ratio < 0.5)  tone = 'critical';

  if (baseline) {
    return (
      <div
        className="lp-mono flex h-7 w-12 items-center justify-center rounded text-[11px] font-medium"
        style={{
          background: 'var(--bg-raised)',
          color: 'var(--fg-muted)',
          border: '1px solid var(--border-default)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {pass}/{total}
      </div>
    );
  }
  return (
    <div
      className="lp-mono flex h-7 w-12 items-center justify-center rounded text-[11px] font-medium"
      style={{
        background: `var(--${tone}-soft)`,
        color: `var(--${tone})`,
        border: `1px solid oklch(0.3 0.012 240 / 0.4)`,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {pass}/{total}
    </div>
  );
}

const EVAL_SESSIONS: Array<[string, [number, number], [number, number], [number, number]]> = [
  ['session #24', [3, 9], [7, 9], [8, 9]],
  ['session #25', [4, 8], [6, 8], [7, 8]],
  ['session #29', [2, 7], [5, 7], [6, 7]],
  ['session #45', [1, 9], [5, 9], [7, 9]],
];

/**
 * "Fix" section — 4-stage loop + proposal card with diff + eval results.
 * Maps to section 05 of v2 (FixSection).
 */
export function Fix() {
  const { messages } = useI18n();
  const c = messages.fix;

  return (
    <section id="fix" className="relative z-10 py-24">
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

        {/* 4-stage strip */}
        <div className="relative mb-6 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          {/* Dashed connector line */}
          <div
            aria-hidden
            className="absolute left-6 right-6 top-7 hidden h-px lg:block"
            style={{
              background: 'repeating-linear-gradient(90deg, var(--accent-line) 0 4px, transparent 4px 8px)',
            }}
          />
          {c.stages.map((s, i) => (
            <div
              key={i}
              className="relative rounded-[10px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)] p-4"
            >
              <div className="mb-2.5 flex items-center gap-2.5">
                <div
                  className="lp-mono flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
                  style={{
                    background: 'var(--accent-soft)',
                    border: '1px solid var(--accent-line)',
                    color: 'var(--accent-strong)',
                  }}
                >
                  {s.n}
                </div>
                <span className="text-[14px] font-medium text-[color:var(--fg)]">{s.label}</span>
              </div>
              <p className="text-[12.5px] leading-[1.55] text-[color:var(--fg-muted)]">{s.desc}</p>
            </div>
          ))}
        </div>

        {/* Proposal + Eval cards */}
        <div className="grid gap-3.5 lg:grid-cols-[1.1fr_0.9fr]">
          {/* Proposal card */}
          <div className="rounded-[10px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)] p-5">
            <div className="mb-3.5 flex items-center gap-2">
              <span
                className="lp-mono text-[10.5px] uppercase tracking-[1.4px]"
                style={{ color: 'var(--accent)' }}
              >
                {c.cardLabel}
              </span>
              <span className="flex-1" />
              <span
                className="lp-mono inline-flex items-center rounded px-1.5 py-0.5 text-[10.5px] font-medium"
                style={{
                  background: 'var(--info-soft)',
                  color: 'var(--info)',
                  border: '1px solid oklch(0.78 0.10 240 / 0.4)',
                }}
              >
                versioned
              </span>
            </div>
            <p
              className="lp-mono mb-2.5 text-[18px]"
              style={{ color: 'var(--accent-strong)' }}
            >
              proposal-engine v2
            </p>
            <p className="mb-4 text-[14px] leading-[1.55] text-[color:var(--fg-muted)]">
              {c.detail}
            </p>

            {/* Diff block */}
            <div
              className="lp-mono overflow-hidden rounded-lg text-[12px]"
              style={{
                background: 'var(--bg-sunken)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div className="border-b border-[color:var(--border-subtle)] px-3 py-1.5 text-[10.5px] uppercase tracking-[0.5px] text-[color:var(--fg-faint)]">
                .claude/skills/proposal-engine/SKILL.md
              </div>
              <div className="px-3 py-2.5 leading-[1.7]">
                <div style={{ color: 'var(--fg-faint)' }}>--- a/SKILL.md</div>
                <div style={{ color: 'var(--fg-faint)' }}>+++ b/SKILL.md</div>
                <div style={{ color: 'var(--fg-muted)' }}>{'  '}description: detect frictions...</div>
                <div
                  style={{
                    color: 'var(--healthy)',
                    background: 'var(--healthy-soft)',
                    margin: '0 -12px',
                    padding: '0 12px',
                  }}
                >
                  + retry-budget: 2
                </div>
                <div
                  style={{
                    color: 'var(--healthy)',
                    background: 'var(--healthy-soft)',
                    margin: '0 -12px',
                    padding: '0 12px',
                  }}
                >
                  + short-circuit: permission_denied
                </div>
                <div style={{ color: 'var(--fg-muted)' }}>
                  {'  '}allowed-tools: [Bash, Edit, Read]
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="mt-4 flex flex-wrap gap-2.5">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-[13px] font-medium transition-colors"
                style={{
                  background: 'var(--accent)',
                  color: 'oklch(0.14 0.012 240)',
                  border: '1px solid transparent',
                }}
              >
                <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12l4 4 10-10" />
                </svg>
                {c.acceptLabel}
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-[13px] font-medium transition-colors"
                style={{
                  background: 'transparent',
                  color: 'var(--fg)',
                  border: '1px solid var(--border-default)',
                }}
              >
                <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 4v16M19 4v16M5 8h6M5 16h6M19 8h-6M19 16h-6" />
                </svg>
                {c.diffLabel}
              </button>
            </div>
          </div>

          {/* Eval results card */}
          <div className="flex flex-col rounded-[10px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)] p-5">
            <p className="lp-mono mb-3.5 text-[10.5px] uppercase tracking-[1.4px] text-[color:var(--fg-subtle)]">
              EVAL · 9 SAMPLED CONVS
            </p>
            <div className="mb-4 flex items-baseline gap-3.5">
              <span
                className="lp-mono leading-none tracking-[-1px]"
                style={{
                  fontSize: 64,
                  fontWeight: 500,
                  color: 'var(--healthy)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {c.delta}
              </span>
              <span className="lp-mono text-[12px] text-[color:var(--fg-muted)]">
                {c.deltaLabel}
              </span>
            </div>

            {/* Eval matrix */}
            <div
              className="lp-mono mb-3.5 grid gap-1.5"
              style={{ gridTemplateColumns: 'auto repeat(3, 1fr)' }}
            >
              <span />
              {(['baseline', 'v1', 'v2'] as const).map((label) => (
                <span key={label} className="text-center text-[10px] text-[color:var(--fg-faint)]">
                  {label}
                </span>
              ))}
              {EVAL_SESSIONS.map(([name, b, v1, v2], i) => (
                <>
                  <span
                    key={`name-${i}`}
                    className="self-center text-[10.5px] text-[color:var(--fg-muted)]"
                  >
                    {name}
                  </span>
                  <div key={`b-${i}`} className="flex justify-center">
                    <EvalCell pass={b[0]} total={b[1]} baseline />
                  </div>
                  <div key={`v1-${i}`} className="flex justify-center">
                    <EvalCell pass={v1[0]} total={v1[1]} />
                  </div>
                  <div key={`v2-${i}`} className="flex justify-center">
                    <EvalCell pass={v2[0]} total={v2[1]} />
                  </div>
                </>
              ))}
            </div>

            {/* Summary chip */}
            <div
              className="lp-mono mt-auto flex items-center gap-2.5 rounded-md px-3 py-2.5 text-[11.5px]"
              style={{
                background: 'var(--healthy-soft)',
                border: '1px solid oklch(0.80 0.13 165 / 0.3)',
                color: 'var(--healthy)',
              }}
            >
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12l4 4 10-10" />
              </svg>
              v2 beats v1 on 9 / 9 sessions
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
