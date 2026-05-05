import { useI18n } from '@/i18n/I18nProvider';

/**
 * "Install" section — terminal-style demo of the install + first run flow.
 * Adapted from v2 lp-sections.jsx → InstallSection. Lines are static mock
 * output; numbers stay coherent with the rest of the landing copy
 * (4 skills · 3 agents · 2 rules · 1 output-style).
 *
 * The bottom tip surfaces the `nakiros service install` command shipped
 * recently for launchd / systemd autostart.
 */
export function Install() {
  const { messages } = useI18n();
  const c = messages.install;

  return (
    <section id="install" className="relative z-10 py-24">
      <div className="mx-auto max-w-[1180px] px-6 md:px-9">
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

        <div
          className="overflow-hidden rounded-[10px]"
          style={{
            border: '1px solid var(--border-subtle)',
            background: 'var(--bg-surface)',
          }}
        >
          {/* Terminal title bar */}
          <div
            className="flex items-center gap-2 border-b px-3.5 py-2.5"
            style={{
              borderColor: 'var(--border-subtle)',
              background: 'var(--bg-sunken)',
            }}
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: 'oklch(0.65 0.18 25)' }} />
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: 'oklch(0.78 0.16 80)' }} />
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: 'oklch(0.74 0.14 145)' }} />
            <span
              className="lp-mono ml-3 text-[11px]"
              style={{ color: 'var(--fg-faint)' }}
            >
              {c.terminalLabel}
            </span>
          </div>

          {/* Terminal body */}
          <div
            className="lp-mono px-5 py-5 text-[13px] leading-[1.75]"
            style={{ color: 'var(--fg)' }}
          >
            {c.lines.map((line, i) => (
              <div
                key={i}
                style={{
                  color: line.accent
                    ? 'var(--accent)'
                    : line.muted
                    ? 'var(--fg-faint)'
                    : 'var(--fg)',
                }}
                className="break-all"
              >
                <span
                  className="mr-2.5 inline-block"
                  style={{
                    color: line.p === '$' ? 'var(--accent)' : 'var(--fg-faint)',
                    minWidth: 12,
                  }}
                >
                  {line.p}
                </span>
                {line.c}
              </div>
            ))}
            <div>
              <span className="mr-2.5 inline-block" style={{ color: 'var(--accent)', minWidth: 12 }}>
                $
              </span>
              <span className="cursor-blink" />
            </div>
          </div>
        </div>

        {/* Bottom row — system req + autostart tip */}
        <div className="mt-5 grid gap-3 md:grid-cols-[auto_1fr] md:items-center md:gap-6">
          <span
            className="lp-mono text-[10.5px] uppercase tracking-[1.4px]"
            style={{ color: 'var(--fg-subtle)' }}
          >
            {c.systemReq}
          </span>
          <div
            className="flex items-start gap-3 rounded-[10px] px-4 py-3"
            style={{
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-sunken)',
            }}
          >
            <span
              className="lp-mono shrink-0 text-[10px] uppercase tracking-[1.2px]"
              style={{ color: 'var(--accent)', marginTop: 2 }}
            >
              {c.tipLabel}
            </span>
            <span
              className="text-[13px] leading-snug"
              style={{ color: 'var(--fg-muted)' }}
            >
              {c.tip}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
