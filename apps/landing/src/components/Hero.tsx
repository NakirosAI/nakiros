import { useState } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import { NakirosLogo } from './NakirosLogo';
import { ClaudeTree } from './ClaudeTree';
import { InstallCommand } from './InstallCommand';

/**
 * Hero — shows the tree view of .claude/ by default.
 * The "audit → fix" variant (variant b) is kept as a second option but the
 * switcher is hidden — variant A is more immediately compelling for first
 * visitors (they see the tree with scores before reading anything).
 */
export function Hero() {
  const { messages } = useI18n();
  const c = messages.hero;
  const [variant, setVariant] = useState<'a' | 'b'>('a');

  return (
    <section id="top" className="relative z-10 py-14 md:py-20">
      <div className="mx-auto max-w-[1180px] px-6 md:px-9">
        {/* Kicker */}
        <div className="mb-5 flex items-center gap-2.5">
          <span className="h-px w-5" style={{ background: 'var(--accent-line)' }} />
          <span className="lp-mono text-[11px] tracking-[1.6px] text-[color:var(--fg-subtle)]">
            {c.kicker}
          </span>
        </div>

        {/* Headline */}
        <h1 className="mb-5 max-w-[920px] text-[clamp(36px,6vw,64px)] font-medium leading-[1.04] tracking-[-1.5px] text-[color:var(--fg)]">
          {c.titleA}
          <em
            className="lp-mono not-italic"
            style={{
              color: 'var(--accent-strong)',
              background: 'var(--accent-soft)',
              padding: '0 8px',
              borderRadius: 6,
              border: '1px solid var(--accent-line)',
              fontWeight: 500,
            }}
          >
            {c.titleB}
          </em>
          {c.titleC}
        </h1>

        {/* Sub */}
        <p className="mb-6 max-w-[640px] text-[18px] leading-[1.55] text-[color:var(--fg-muted)]">
          {c.sub}
        </p>

        {/* Variant switcher (subtle, not prominent) */}
        <div className="mb-6 flex flex-wrap items-center gap-2.5">
          <div
            className="lp-mono inline-flex items-center rounded-md p-0.5"
            style={{
              background: 'var(--bg-sunken)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            {([
              { id: 'a' as const, label: '.claude/ tree' },
              { id: 'b' as const, label: 'audit → fix' },
            ] as const).map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setVariant(v.id)}
                className="rounded px-2.5 py-1 text-[11px] transition-colors"
                style={{
                  background: variant === v.id ? 'var(--bg-raised)' : 'transparent',
                  color: variant === v.id ? 'var(--fg)' : 'var(--fg-faint)',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {/* Hero card */}
        <div
          className="hero-glow-border scanlines overflow-hidden rounded-xl"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            boxShadow: '0 12px 28px oklch(0 0 0 / 0.5), 0 2px 6px oklch(0 0 0 / 0.4)',
          }}
        >
          {/* Card header */}
          <div className="flex items-center justify-between border-b border-[color:var(--border-subtle)] px-4 py-3">
            <div className="flex items-center gap-2.5">
              <NakirosLogo className="h-4.5 w-4.5" />
              <span className="lp-mono text-[12px] text-[color:var(--fg-muted)]">
                {c.stationLabel}
              </span>
            </div>
            <div className="lp-mono flex items-center gap-2 text-[11px] text-[color:var(--fg-subtle)]">
              <span className="live-dot" aria-hidden="true" />
              <span>{c.runtime}</span>
            </div>
          </div>

          {/* Card body — variant A: tree view */}
          {variant === 'a' && (
            <div
              className="mx-4 my-3.5 rounded-lg"
              style={{
                background: 'var(--bg-canvas)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              {/* Tree header */}
              <div className="flex items-center justify-between border-b border-[color:var(--border-subtle)] px-4 py-2.5">
                <div>
                  <p className="lp-mono text-[11.5px] tracking-[0.6px] text-[color:var(--accent)]">
                    {c.treeLabel}
                  </p>
                  <p className="lp-mono mt-0.5 text-[10.5px] tracking-[0.4px] text-[color:var(--fg-faint)]">
                    {c.treeSub}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <BadgePill tone="critical" dot>2 fail</BadgePill>
                  <BadgePill tone="watch">3 warn</BadgePill>
                  <BadgePill tone="healthy">9 ok</BadgePill>
                </div>
              </div>
              {/* Column headers */}
              <div
                className="lp-mono grid border-b border-[color:var(--border-subtle)] bg-[color:var(--bg-sunken)] px-3 py-1.5"
                style={{
                  gridTemplateColumns: '1fr 70px 88px',
                  fontSize: 9.5,
                  letterSpacing: 0.7,
                  textTransform: 'uppercase',
                  color: 'var(--fg-faint)',
                }}
              >
                <span>artifact</span>
                <span style={{ textAlign: 'right' }}>score</span>
                <span style={{ textAlign: 'right' }}>spec</span>
              </div>
              <ClaudeTree highlight="proposal-engine" />
              {/* Footer row */}
              <div
                className="lp-mono flex items-center justify-between border-t border-[color:var(--border-subtle)] px-4 py-2 text-[10.5px] text-[color:var(--fg-subtle)]"
              >
                <span>{c.shotcaseLabel}</span>
                <span>
                  <span style={{ color: 'var(--accent)' }}>›</span>{' '}
                  proposal-engine — fix proposed
                </span>
              </div>
            </div>
          )}

          {/* Card body — variant B: audit → fix split */}
          {variant === 'b' && (
            <div
              className="lp-mono m-4 grid overflow-hidden rounded-lg text-[12px] sm:grid-cols-2"
              style={{
                background: 'var(--bg-canvas)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              {/* Audit side */}
              <div className="border-b border-[color:var(--border-subtle)] p-3.5 sm:border-b-0 sm:border-r">
                <div className="mb-3 flex items-center gap-2">
                  <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="var(--watch)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
                    <path d="M14 3v5h5M9 13l2 2 4-4" />
                  </svg>
                  <span style={{ color: 'var(--watch)', letterSpacing: 0.6, textTransform: 'uppercase', fontSize: 10.5 }}>
                    audit · proposal-engine
                  </span>
                  <span className="flex-1" />
                  <BadgePill tone="critical">score 60</BadgePill>
                </div>
                <div style={{ color: 'var(--fg-muted)', lineHeight: 1.65 }}>
                  <div style={{ color: 'var(--fg)' }}>
                    <span style={{ color: 'var(--accent)' }}>›</span> Re-reading 9 sessions where this skill ran...
                  </div>
                  <div>· 5/9 retries on Bash <span style={{ color: 'var(--critical)' }}>permission denied</span></div>
                  <div>· no retry budget in SKILL.md</div>
                  <div>· cache rewritten <span style={{ color: 'var(--watch)', fontVariantNumeric: 'tabular-nums' }}>146k</span> tokens for nothing</div>
                  <div className="mt-2.5 text-[10.5px] uppercase tracking-[0.5px] text-[color:var(--fg-faint)]">verdict</div>
                  <div style={{ color: 'var(--fg)' }}>add guard + retry-budget. propose v2.</div>
                </div>
              </div>
              {/* Fix side */}
              <div className="p-3.5" style={{ background: 'var(--bg-sunken)' }}>
                <div className="mb-3 flex items-center gap-2">
                  <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="var(--healthy)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M14 6a4 4 0 1 0 4 4l3 3-3 3-3-3a4 4 0 0 1-4-4l-5 5-3-3 5-5a4 4 0 0 1 4-4l3 3z" />
                  </svg>
                  <span style={{ color: 'var(--healthy)', letterSpacing: 0.6, textTransform: 'uppercase', fontSize: 10.5 }}>
                    proposal v2
                  </span>
                  <span className="flex-1" />
                  <BadgePill tone="healthy">+22%</BadgePill>
                </div>
                <div
                  className="rounded-md px-2.5 py-2 leading-[1.7]"
                  style={{
                    background: 'var(--bg-canvas)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div style={{ color: 'var(--fg-faint)' }}>--- a/SKILL.md</div>
                  <div style={{ color: 'var(--fg-faint)' }}>+++ b/SKILL.md</div>
                  <div style={{ color: 'var(--fg-muted)' }}>{'  '}description: detect frictions...</div>
                  <div style={{ color: 'var(--healthy)', background: 'var(--healthy-soft)', margin: '0 -10px', padding: '0 10px' }}>
                    + retry-budget: 2
                  </div>
                  <div style={{ color: 'var(--healthy)', background: 'var(--healthy-soft)', margin: '0 -10px', padding: '0 10px' }}>
                    + short-circuit: permission_denied
                  </div>
                  <div style={{ color: 'var(--fg-muted)' }}>{'  '}...</div>
                </div>
                <div className="mt-2.5 flex items-center gap-2">
                  <span style={{ color: 'var(--fg-muted)' }}>eval · 9 sessions ·</span>
                  <span style={{ color: 'var(--healthy)' }}>9/9 beat baseline</span>
                </div>
              </div>
            </div>
          )}

          {/* CTA row */}
          <div className="flex flex-wrap items-center gap-3 px-4 pb-4">
            <div className="min-w-0 flex-1">
              <InstallCommand
                command={c.installCommand}
                packageName="@nakirosai/nakiros"
              />
            </div>
            <a
              href="https://github.com/NakirosAI/nakiros"
              target="_blank"
              rel="noreferrer"
              className="lp-mono inline-flex items-center gap-1.5 rounded-md px-3.5 py-2.5 text-[13.5px] text-[color:var(--fg)] transition-colors hover:bg-[color:var(--bg-raised)]"
              style={{ border: '1px solid var(--border-default)' }}
            >
              {c.cta2}
              <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

// Small inline badge helper (used only within Hero to avoid importing)
function BadgePill({
  tone,
  children,
  dot = false,
}: {
  tone: string;
  children: React.ReactNode;
  dot?: boolean;
}) {
  const colorMap: Record<string, { bg: string; fg: string; bd: string }> = {
    healthy:  { bg: 'var(--healthy-soft)',  fg: 'var(--healthy)',  bd: 'oklch(0.80 0.13 165 / 0.4)' },
    watch:    { bg: 'var(--watch-soft)',    fg: 'var(--watch)',    bd: 'oklch(0.82 0.14 80 / 0.4)' },
    critical: { bg: 'var(--critical-soft)', fg: 'var(--critical)', bd: 'oklch(0.74 0.16 25 / 0.4)' },
    info:     { bg: 'var(--info-soft)',     fg: 'var(--info)',     bd: 'oklch(0.78 0.10 240 / 0.4)' },
  };
  const t = colorMap[tone] ?? colorMap.info;
  return (
    <span
      className="lp-mono inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-medium"
      style={{
        background: t.bg,
        color: t.fg,
        border: `1px solid ${t.bd}`,
        whiteSpace: 'nowrap',
      }}
    >
      {dot && (
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: t.fg, flexShrink: 0 }}
        />
      )}
      {children}
    </span>
  );
}
