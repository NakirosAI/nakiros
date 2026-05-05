import { useI18n } from '@/i18n/I18nProvider';

/**
 * SVG network diagram — all local, no outbound.
 * Dimensions and colors reference CSS vars so they react to theme.
 */
function NetworkDiagram() {
  return (
    <div
      className="relative overflow-hidden rounded-[10px] p-7"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      <p className="lp-mono mb-4 text-[10.5px] uppercase tracking-[1.4px] text-[color:var(--fg-subtle)]">
        NETWORK · YOUR MACHINE
      </p>
      <svg
        viewBox="0 0 400 280"
        width="100%"
        style={{ display: 'block' }}
        aria-label="Network diagram: nakirosd at the center, reads .claude, writes ~/.nakiros, spawns claude cli, served to the browser"
        role="img"
      >
        {/* Outer machine boundary */}
        <rect x="2" y="2" width="396" height="276" rx="8" fill="none" stroke="var(--border-subtle)" strokeDasharray="3 4" />
        <text x="14" y="20" fontFamily="var(--font-mono)" fontSize="9.5" fill="var(--fg-faint)" letterSpacing="1">MACHINE</text>

        {/* nakirosd — center, accent */}
        <rect x="145" y="117" width="110" height="46" rx="6" fill="var(--accent-soft)" stroke="var(--accent-line)" />
        <text x="200" y="139" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="11" fill="var(--accent-strong)">nakirosd</text>
        <text x="200" y="155" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9.5" fill="var(--accent)">127.0.0.1:4242</text>

        {/* browser ui — top-left */}
        <rect x="15" y="40" width="110" height="46" rx="6" fill="var(--bg-sunken)" stroke="var(--border-default)" />
        <text x="70" y="62" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="11" fill="var(--fg)">browser ui</text>
        <text x="70" y="78" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9.5" fill="var(--fg-faint)">localhost:4242</text>

        {/* .claude/ — top-right */}
        <rect x="275" y="40" width="110" height="46" rx="6" fill="var(--bg-sunken)" stroke="var(--border-default)" />
        <text x="330" y="62" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="11" fill="var(--fg)">.claude/</text>
        <text x="330" y="78" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9.5" fill="var(--fg-faint)">skills · agents · rules</text>

        {/* ~/.nakiros — bottom-left */}
        <rect x="15" y="194" width="110" height="46" rx="6" fill="var(--bg-sunken)" stroke="var(--border-default)" />
        <text x="70" y="216" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="11" fill="var(--fg)">~/.nakiros</text>
        <text x="70" y="232" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9.5" fill="var(--fg-faint)">JSON + JSONL</text>

        {/* claude cli — bottom-right */}
        <rect x="275" y="194" width="110" height="46" rx="6" fill="var(--bg-sunken)" stroke="var(--border-default)" />
        <text x="330" y="216" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="11" fill="var(--fg)">claude cli</text>
        <text x="330" y="232" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9.5" fill="var(--fg-faint)">your existing plan</text>

        {/* Arrows from / to nakirosd */}
        {/* browser ui ↔ nakirosd (bidirectional) */}
        <path d="M 125 75 L 145 125" stroke="var(--accent)" strokeWidth="1.4" markerEnd="url(#ar)" markerStart="url(#ar-rev)" fill="none" />
        {/* .claude/ → nakirosd (reads) */}
        <path d="M 275 75 L 255 125" stroke="var(--accent)" strokeWidth="1.4" markerEnd="url(#ar)" fill="none" />
        {/* nakirosd → ~/.nakiros (writes) */}
        <path d="M 145 155 L 125 205" stroke="var(--accent)" strokeWidth="1.4" markerEnd="url(#ar)" fill="none" />
        {/* nakirosd → claude cli (spawns) */}
        <path d="M 255 155 L 275 205" stroke="var(--accent)" strokeWidth="1.4" markerEnd="url(#ar)" fill="none" />

        {/* Arrow labels */}
        <text x="130" y="108" fontFamily="var(--font-mono)" fontSize="9" fill="var(--fg-faint)">serves</text>
        <text x="244" y="108" textAnchor="end" fontFamily="var(--font-mono)" fontSize="9" fill="var(--fg-faint)">reads</text>
        <text x="130" y="186" fontFamily="var(--font-mono)" fontSize="9" fill="var(--fg-faint)">writes</text>
        <text x="244" y="186" textAnchor="end" fontFamily="var(--font-mono)" fontSize="9" fill="var(--fg-faint)">spawns</text>

        <defs>
          <marker id="ar" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 0 L 8 4 L 0 8 z" fill="var(--accent)" />
          </marker>
          <marker id="ar-rev" viewBox="0 0 8 8" refX="1" refY="4" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 8 0 L 0 4 L 8 8 z" fill="var(--accent)" />
          </marker>
        </defs>
      </svg>

      {/* Live pill */}
      <div className="absolute right-4 top-4 flex items-center gap-1.5">
        <span className="live-dot" aria-hidden="true" />
        <span className="lp-mono text-[10.5px] text-[color:var(--fg-muted)]">
          no api · no extra cost
        </span>
      </div>
    </div>
  );
}

/**
 * "Local-first" section — two-column with bullet points and SVG network diagram.
 * Maps to section 07 of v2 (LocalSection).
 */
export function Local() {
  const { messages } = useI18n();
  const c = messages.local;

  return (
    <section id="local" className="relative z-10 py-24">
      <div className="mx-auto max-w-[1180px] px-6 md:px-9">
        <div className="grid items-center gap-14 lg:grid-cols-2">
          {/* Left — copy */}
          <div>
            <p className="lp-mono mb-3.5 text-[10.5px] uppercase tracking-[1.4px] text-[color:var(--fg-subtle)]">
              {c.label}
            </p>
            <h2 className="mb-6 text-[38px] font-medium leading-tight tracking-[-0.6px] text-[color:var(--fg)]">
              {c.title}
            </h2>
            <ul className="mt-6 grid gap-3.5">
              {c.points.map((p, i) => (
                <li key={i} className="flex items-start gap-3.5">
                  <span
                    className="lp-mono mt-px shrink-0 text-[11px] text-[color:var(--accent)]"
                    style={{ minWidth: 26 }}
                  >
                    0{i + 1}
                  </span>
                  <span className="text-[14.5px] leading-[1.55] text-[color:var(--fg-muted)]">
                    {p}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Right — diagram */}
          <NetworkDiagram />
        </div>
      </div>
    </section>
  );
}
