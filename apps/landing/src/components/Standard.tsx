import { useI18n } from '@/i18n/I18nProvider';

/**
 * "Standardized" section — spec-check table + proof side panel.
 * Maps to section 03 of v2 (StandardSection).
 */
export function Standard() {
  const { messages } = useI18n();
  const c = messages.standard;

  return (
    <section id="standard" className="relative z-10 py-24">
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

        <div className="grid gap-3.5 lg:grid-cols-[1fr_320px]">
          {/* Checks table */}
          <div className="overflow-hidden rounded-[10px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)]">
            {/* Table header */}
            <div
              className="lp-mono grid border-b border-[color:var(--border-subtle)] bg-[color:var(--bg-sunken)] px-4 py-2.5"
              style={{
                gridTemplateColumns: '1fr 80px 80px 1.6fr',
                fontSize: 9.5,
                letterSpacing: 0.7,
                textTransform: 'uppercase',
                color: 'var(--fg-faint)',
              }}
            >
              <span>check</span>
              <span className="text-center">pass</span>
              <span className="text-center">fail</span>
              <span>what it validates</span>
            </div>

            {c.checks.map((row, i) => (
              <div
                key={i}
                className="grid items-center gap-2.5 px-4 py-3.5"
                style={{
                  gridTemplateColumns: '1fr 80px 80px 1.6fr',
                  borderBottom: i === c.checks.length - 1 ? 'none' : '1px solid var(--border-subtle)',
                }}
              >
                <div className="flex items-center gap-2">
                  {/* File icon */}
                  <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="var(--fg-faint)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
                    <path d="M14 3v5h5" />
                  </svg>
                  <span className="lp-mono text-[12.5px] text-[color:var(--fg)]">{row.name}</span>
                </div>
                <span
                  className="lp-mono text-center text-[13px] text-[color:var(--healthy)]"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {row.pass}
                </span>
                <span
                  className="lp-mono text-center text-[13px]"
                  style={{
                    fontVariantNumeric: 'tabular-nums',
                    color: row.fail > 0 ? 'var(--critical)' : 'var(--fg-faint)',
                  }}
                >
                  {row.fail}
                </span>
                <span className="text-[12.5px] leading-[1.5] text-[color:var(--fg-muted)]">
                  {row.info}
                </span>
              </div>
            ))}
          </div>

          {/* Proof side panel */}
          <div className="rounded-[10px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)] p-5">
            <p className="lp-mono mb-3.5 text-[10.5px] uppercase tracking-[1.4px] text-[color:var(--fg-subtle)]">
              {c.proofLabel}
            </p>
            <ul className="grid gap-2">
              {c.proofItems.map((url, i) => (
                <li
                  key={i}
                  className="flex items-center gap-2 rounded-md border border-[color:var(--border-subtle)] bg-[color:var(--bg-sunken)] px-2.5 py-2"
                >
                  {/* External link icon */}
                  <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
                    <path d="M14 4h6v6M20 4l-9 9M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6" />
                  </svg>
                  <span className="lp-mono overflow-hidden text-ellipsis text-[11.5px] text-[color:var(--fg-muted)]">
                    {url}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-3.5 rounded-md border border-[color:var(--accent-line)] bg-[color:var(--accent-soft)] px-3 py-2.5">
              <span className="lp-mono text-[11px] text-[color:var(--accent-strong)]">
                schema versioned. tracked.
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
