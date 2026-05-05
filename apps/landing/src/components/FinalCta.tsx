import { useI18n } from '@/i18n/I18nProvider';

/**
 * Final CTA section (anchor `#install`) — v2 design.
 *
 * Full-width tinted card with radial gradient, hero title, sub copy,
 * and inline install command. Pure conversion block.
 */
export function FinalCta() {
  const { messages } = useI18n();
  const c = messages.cta;

  return (
    <section id="get-started" className="relative z-10 py-24">
      <div className="mx-auto max-w-[1180px] px-6 md:px-9">
        <div
          className="relative overflow-hidden rounded-xl px-12 py-14 text-center"
          style={{
            background: 'linear-gradient(180deg, var(--bg-surface), oklch(0.10 0.006 220))',
            border: '1px solid var(--accent-line)',
          }}
        >
          {/* Radial glow */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background: 'radial-gradient(ellipse 600px 300px at 50% 0%, var(--accent-soft), transparent 70%)',
            }}
          />

          <div className="relative">
            <h2 className="mx-auto mb-2.5 max-w-[720px] text-[36px] font-medium leading-tight tracking-[-0.6px] text-[color:var(--fg)]">
              {c.title}
            </h2>
            <p className="mx-auto mb-7 max-w-[480px] text-[16px] leading-relaxed text-[color:var(--fg-muted)]">
              {c.sub}
            </p>
            {/* Install command inline */}
            <div
              className="lp-mono mx-auto inline-flex items-center gap-2.5 rounded-lg px-4 py-2.5 text-[14px]"
              style={{
                background: 'var(--bg-sunken)',
                border: '1px solid var(--border-default)',
              }}
            >
              <span style={{ color: 'var(--accent)' }}>$</span>
              <span style={{ color: 'var(--fg)' }}>{messages.hero.installCommand}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
