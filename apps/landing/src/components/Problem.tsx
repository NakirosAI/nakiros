import { useI18n } from '@/i18n/I18nProvider';

// Inline SVG icons for the 4 pillar cards
function PillarIcon({ name, tone }: { name: string; tone: string }) {
  const paths: Record<string, string> = {
    skill: 'M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6l8-4z',
    plug:  'M9 2v4M15 2v4M7 6h10v5a5 5 0 0 1-10 0zM12 16v6',
    brain: 'M9 4a3 3 0 0 0-3 3v1a3 3 0 0 0-2 5 3 3 0 0 0 2 5v1a3 3 0 0 0 6 0V4a3 3 0 0 0-3 0zM15 4a3 3 0 0 1 3 3v1a3 3 0 0 1 2 5 3 3 0 0 1-2 5v1a3 3 0 0 1-6 0',
    cog:   'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  };
  const d = paths[name] ?? paths.cog;
  const colorVar = `var(--${tone})`;
  const softVar = `var(--${tone}-soft)`;

  return (
    <div
      style={{
        width: 26,
        height: 26,
        borderRadius: 6,
        background: softVar,
        border: `1px solid oklch(from var(--${tone}) l c h / 0.3)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <svg
        width={13}
        height={13}
        viewBox="0 0 24 24"
        fill="none"
        stroke={colorVar}
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d={d} />
      </svg>
    </div>
  );
}

/**
 * "Problem" section — 4 pillar cards showing the unmanaged .claude problem.
 * Maps to section 01 of v2 (lp-sections.jsx / ProblemSection).
 */
export function Problem() {
  const { messages } = useI18n();
  const c = messages.problem;
  const PILLAR_ICONS = ['skill', 'plug', 'brain', 'cog'];

  return (
    <section id="problem" className="relative z-10 py-24">
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

        {/* 4 pillar cards */}
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          {c.pillars.map((p, i) => (
            <div
              key={i}
              className="rounded-[10px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)] p-5 transition-colors hover:border-[color:var(--border-strong)]"
            >
              <div className="mb-3.5 flex items-center justify-between">
                <span className="lp-mono text-[10.5px] uppercase tracking-[1.4px] text-[color:var(--fg-faint)]">
                  FIG.0{i + 1}
                </span>
                <PillarIcon name={PILLAR_ICONS[i]} tone={p.tone} />
              </div>
              <div
                className="lp-mono mb-2.5 leading-none tracking-[-1px]"
                style={{
                  fontSize: 48,
                  fontWeight: 500,
                  color: `var(--${p.tone})`,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {p.k}
              </div>
              <p className="mb-1.5 text-[13.5px] font-medium text-[color:var(--fg)]">
                {p.label}
              </p>
              <p className="text-[12.5px] leading-[1.55] text-[color:var(--fg-muted)]">
                {p.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
