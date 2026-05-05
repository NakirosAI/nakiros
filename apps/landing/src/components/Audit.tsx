import { useI18n } from '@/i18n/I18nProvider';

/**
 * "Audit" section — forensic report card from a worker.
 * Maps to section 04 of v2 (AuditSection).
 */
export function Audit() {
  const { messages } = useI18n();
  const c = messages.audit;

  return (
    <section id="audit" className="relative z-10 py-24">
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

        {/* Report card */}
        <div className="overflow-hidden rounded-[10px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)]">
          {/* Header row */}
          <div className="flex items-center justify-between border-b border-[color:var(--border-subtle)] bg-[color:var(--bg-sunken)] px-5 py-3.5">
            <div className="flex items-center gap-2.5">
              {/* Audit icon */}
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
                <path d="M14 3v5h5M9 13l2 2 4-4" />
              </svg>
              <span className="lp-mono text-[12px] text-[color:var(--fg)]">{c.target}</span>
              <span className="h-3 w-px bg-[color:var(--border-subtle)]" />
              <span className="lp-mono text-[11px] text-[color:var(--fg-faint)]">
                worker · sonnet · 1m48s
              </span>
            </div>
            {/* Verdict badge */}
            <span
              className="lp-mono inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[11.5px] font-medium"
              style={{
                background: 'var(--critical-soft)',
                color: 'var(--critical)',
                border: '1px solid oklch(0.74 0.16 25 / 0.4)',
              }}
            >
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: 'var(--critical)' }}
              />
              {c.verdict}
            </span>
          </div>

          {/* Bullet rows */}
          {c.bullets.map((b, i) => (
            <div
              key={i}
              className="grid"
              style={{
                gridTemplateColumns: '40px 1fr',
                borderBottom: i === c.bullets.length - 1 ? 'none' : '1px solid var(--border-subtle)',
              }}
            >
              <div
                className="lp-mono flex items-center justify-center border-r border-[color:var(--border-subtle)] bg-[color:var(--bg-sunken)] text-[9px] tracking-[0.5px] text-[color:var(--fg-faint)]"
              >
                {String(i + 1).padStart(2, '0')}
              </div>
              <div
                className="grid items-baseline gap-4 px-5 py-3.5"
                style={{ gridTemplateColumns: '110px 1fr' }}
              >
                <span className="lp-mono text-[10.5px] uppercase tracking-[0.6px] text-[color:var(--accent)]">
                  {b.k}
                </span>
                <span className="text-[14px] leading-[1.55] text-[color:var(--fg)]">{b.v}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
