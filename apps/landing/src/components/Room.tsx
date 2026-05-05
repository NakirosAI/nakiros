import { useState } from 'react';
import { AlertTriangle, XCircle, Check } from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';
import { ClaudeTree } from './ClaudeTree';
import { SpecDonut } from './viz/SpecDonut';

type TabKey = 'tree' | 'audit' | 'eval';

/**
 * "Control Room" section — tabbed panel showcasing three concrete views
 * Nakiros offers on a `.claude/` folder: the canonical tree, an audit
 * report, and an eval matrix. Each tab is a static snapshot styled after
 * the real screens in `apps/frontend` so the landing reads visually
 * coherent with the in-app UI.
 */
export function Room() {
  const { messages } = useI18n();
  const c = messages.room;
  const [active, setActive] = useState<TabKey>('tree');

  const meta =
    active === 'tree'
      ? c.tree.metaLabel
      : active === 'audit'
      ? c.audit.metaLabel
      : c.eval.metaLabel;

  return (
    <section id="room" className="relative z-10 py-24">
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

        <div className="overflow-hidden rounded-[10px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)]">
          <div className="flex items-center border-b border-[color:var(--border-subtle)] bg-[color:var(--bg-sunken)]">
            {c.tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActive(tab.key as TabKey)}
                className="lp-mono shrink-0 border-b-2 border-r border-[color:var(--border-subtle)] px-5 py-3 text-[12px] tracking-[0.4px] transition-colors"
                style={{
                  background:
                    tab.key === active ? 'var(--bg-surface)' : 'transparent',
                  color: tab.key === active ? 'var(--fg)' : 'var(--fg-faint)',
                  borderBottomColor:
                    tab.key === active ? 'var(--accent)' : 'transparent',
                }}
              >
                {tab.label}
              </button>
            ))}
            <span className="flex-1" />
            <span className="lp-mono pr-4 text-[10.5px] text-[color:var(--fg-faint)]">
              {meta}
            </span>
          </div>

          {active === 'tree' && <TreePanel />}
          {active === 'audit' && <AuditPanel />}
          {active === 'eval' && <EvalPanel />}
        </div>
      </div>
    </section>
  );
}

// ── Panel 1: tree + spec donut ─────────────────────────────────────────────

function TreePanel() {
  const { messages } = useI18n();
  const t = messages.room.tree;
  return (
    <div className="grid lg:grid-cols-[1.2fr_0.8fr]">
      <div className="border-b border-[color:var(--border-subtle)] py-3.5 lg:border-b-0 lg:border-r">
        <div
          className="lp-mono grid items-center border-b border-[color:var(--border-subtle)] bg-[color:var(--bg-sunken)] px-3 py-1.5"
          style={{
            gridTemplateColumns: '1fr 70px 88px',
            fontSize: 9.5,
            letterSpacing: 0.7,
            color: 'var(--fg-faint)',
            textTransform: 'uppercase',
          }}
        >
          <span>artifact</span>
          <span style={{ textAlign: 'right' }}>score</span>
          <span style={{ textAlign: 'right' }}>spec</span>
        </div>
        <ClaudeTree highlight="proposal-engine" />
      </div>

      <div className="bg-[color:var(--bg-sunken)] p-6">
        <p className="lp-mono mb-3.5 text-[10.5px] uppercase tracking-[1.4px] text-[color:var(--fg-subtle)]">
          {t.coverageLabel}
        </p>
        <div className="mb-5 flex items-center gap-4">
          <SpecDonut pass={11} fail={4} size={84} />
          <div>
            <p
              className="lp-mono text-2xl font-medium text-[color:var(--fg)]"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {t.coverageValue}
            </p>
            <p className="lp-mono mt-0.5 text-[11px] text-[color:var(--fg-muted)]">
              {t.coverageHint}
            </p>
          </div>
        </div>
        <ul className="grid gap-3">
          {t.whatYouGet.map((point, i) => (
            <li key={i} className="flex items-start gap-3">
              <Check
                size={14}
                strokeWidth={2.2}
                style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 3 }}
                aria-hidden="true"
              />
              <span className="text-[13.5px] leading-[1.5] text-[color:var(--fg-muted)]">
                {point}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ── Panel 2: audit report ──────────────────────────────────────────────────

type AuditTone = 'critical' | 'watch' | 'healthy' | 'fg';

function AuditPanel() {
  const { messages } = useI18n();
  const a = messages.room.audit;

  return (
    <div className="p-6 md:p-8">
      <div
        className="mb-5 flex items-start gap-3.5 rounded-[10px] border px-4 py-3.5"
        style={{
          borderColor: 'var(--watch-soft)',
          background:
            'linear-gradient(180deg, oklch(0.82 0.14 80 / 0.08), transparent 60%)',
        }}
      >
        <div
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md"
          style={{
            background: 'var(--watch-soft)',
            color: 'var(--watch)',
          }}
        >
          <AlertTriangle size={18} strokeWidth={2.5} />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <span className="lp-mono text-[10.5px] uppercase tracking-[1.2px] text-[color:var(--fg-subtle)]">
            {a.eyebrow}
          </span>
          <span className="text-[20px] font-semibold text-[color:var(--fg)]">
            {a.headline}
          </span>
          <span className="text-[12.5px] leading-snug text-[color:var(--fg-muted)]">
            {a.subline}
          </span>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {a.kpis.map((kpi, i) => (
          <Kpi key={i} label={kpi.label} value={kpi.value} tone={kpi.tone as AuditTone} />
        ))}
      </div>

      <p className="lp-mono mb-2 text-[9.5px] uppercase tracking-[0.7px] text-[color:var(--fg-faint)]">
        {a.findingsLabel}
      </p>
      <div className="overflow-hidden rounded-[10px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-sunken)]">
        {a.findings.map((f, i) => (
          <FindingRow
            key={f.code}
            code={f.code}
            text={f.text}
            severity={f.severity as 'critical' | 'warn'}
            isLast={i === a.findings.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone: AuditTone }) {
  const color = tone === 'fg' ? 'var(--fg)' : `var(--${tone})`;
  return (
    <div className="rounded-[10px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-sunken)] px-3.5 py-3.5">
      <div className="lp-mono mb-1 text-[9.5px] uppercase tracking-[0.7px] text-[color:var(--fg-faint)]">
        {label}
      </div>
      <div
        className="text-[22px] font-semibold leading-tight"
        style={{ color, fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </div>
    </div>
  );
}

function FindingRow({
  code,
  text,
  severity,
  isLast,
}: {
  code: string;
  text: string;
  severity: 'critical' | 'warn';
  isLast: boolean;
}) {
  const tone = severity === 'critical' ? 'critical' : 'watch';
  const Icon = severity === 'critical' ? XCircle : AlertTriangle;
  return (
    <div
      className="flex items-start gap-3 px-4 py-3"
      style={{
        borderBottom: isLast ? 'none' : '1px solid var(--border-subtle)',
      }}
    >
      <Icon
        size={15}
        strokeWidth={2.2}
        style={{ color: `var(--${tone})`, flexShrink: 0, marginTop: 2 }}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <span
          className="lp-mono mr-2 text-[10px] uppercase tracking-[0.7px]"
          style={{ color: `var(--${tone})` }}
        >
          {code}
        </span>
        <span className="text-[13px] leading-snug text-[color:var(--fg-muted)]">
          {text}
        </span>
      </div>
    </div>
  );
}

// ── Panel 3: eval matrix ───────────────────────────────────────────────────

const TAG_TONE: Record<string, string> = {
  stable: 'var(--healthy)',
  fixed: 'var(--accent)',
  new: 'var(--info)',
  flaky: 'var(--watch)',
  broken: 'var(--critical)',
};

function passRateTone(rate: number): { bg: string; fg: string } {
  if (rate >= 0.85) return { bg: 'var(--healthy-soft)', fg: 'var(--healthy)' };
  if (rate >= 0.5) return { bg: 'var(--watch-soft)', fg: 'var(--watch)' };
  return { bg: 'var(--critical-soft)', fg: 'var(--critical)' };
}

function parseRate(cell: string | null): number | null {
  if (!cell) return null;
  const [a, b] = cell.split('/').map((n) => parseInt(n, 10));
  if (!b) return null;
  return a / b;
}

function EvalPanel() {
  const { messages } = useI18n();
  const e = messages.room.eval;

  return (
    <div className="p-6 md:p-8">
      <div className="mb-4">
        <span className="lp-mono mb-1 block text-[10.5px] uppercase tracking-[1.2px] text-[color:var(--fg-subtle)]">
          {e.eyebrow}
        </span>
        <h3 className="mb-1.5 text-[18px] font-semibold text-[color:var(--fg)]">
          {e.headline}
        </h3>
        <p className="max-w-[640px] text-[12.5px] leading-snug text-[color:var(--fg-muted)]">
          {e.subline}
        </p>
      </div>

      <div className="overflow-x-auto rounded-[10px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-sunken)]">
        <table className="w-full border-separate border-spacing-0 text-[11.5px]">
          <thead>
            <tr>
              <th
                className="lp-mono sticky left-0 z-10 min-w-[220px] border-b border-[color:var(--border-subtle)] bg-[color:var(--bg-sunken)] px-3.5 py-3 text-left text-[10.5px] font-medium uppercase tracking-[1px] text-[color:var(--fg-subtle)]"
              >
                EVAL
              </th>
              {e.iterations.map((it, idx) => {
                const isBaseline = it.kind === 'baseline';
                return (
                  <th
                    key={idx}
                    className="lp-mono min-w-[64px] border-b border-[color:var(--border-subtle)] px-1.5 py-3 text-center text-[10px] font-medium text-[color:var(--fg-subtle)]"
                    style={{
                      background: isBaseline
                        ? 'var(--bg-canvas)'
                        : 'transparent',
                    }}
                  >
                    <div className="flex items-center justify-center gap-1">
                      {isBaseline && (
                        <span
                          className="lp-mono rounded-[3px] px-1 py-px text-[8px] font-semibold uppercase tracking-[0.6px]"
                          style={{
                            background: 'var(--accent-soft)',
                            color: 'var(--accent)',
                          }}
                        >
                          B
                        </span>
                      )}
                      <span>iter {it.n}</span>
                    </div>
                    <div
                      className="mt-0.5 text-[9px]"
                      style={{
                        color:
                          it.model === 'opus'
                            ? 'var(--violet)'
                            : 'var(--accent)',
                      }}
                    >
                      {it.model}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {e.rows.map((row) => (
              <EvalRowGroup key={row.name} row={row} iterations={e.iterations} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface EvalRow {
  name: string;
  tag: string;
  withSkill: (string | null)[];
  withoutSkill: (string | null)[];
}

interface EvalIter {
  n: number;
  kind: string;
  model: string;
}

function EvalRowGroup({ row, iterations }: { row: EvalRow; iterations: EvalIter[] }) {
  return (
    <>
      <tr>
        <td
          rowSpan={2}
          className="lp-mono sticky left-0 z-10 border-b border-[color:var(--border-subtle)] bg-[color:var(--bg-sunken)] px-3.5 py-1.5 align-top text-[12px]"
        >
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[color:var(--fg)]">{row.name}</span>
              <TagBadge tag={row.tag} />
            </div>
            <span className="text-[9.5px] text-[color:var(--fg-faint)]">
              with-skill ▲ / baseline ▽
            </span>
          </div>
        </td>
        {row.withSkill.map((cell, i) => {
          const isBaselineCol = iterations[i].kind === 'baseline';
          return (
            <td
              key={i}
              className="px-1 pb-px pt-1 text-center"
              style={{
                background: isBaselineCol ? 'var(--bg-canvas)' : 'transparent',
              }}
            >
              {isBaselineCol ? (
                <span className="lp-mono text-[10px] text-[color:var(--fg-faint)]">·</span>
              ) : (
                <EvalCell value={cell} />
              )}
            </td>
          );
        })}
      </tr>
      <tr>
        {row.withoutSkill.map((cell, i) => {
          const isBaselineCol = iterations[i].kind === 'baseline';
          return (
            <td
              key={i}
              className="border-b border-[color:var(--border-subtle)] px-1 pb-1.5 pt-px text-center"
              style={{
                background: isBaselineCol ? 'var(--bg-canvas)' : 'transparent',
              }}
            >
              <EvalCell value={cell} baseline />
            </td>
          );
        })}
      </tr>
    </>
  );
}

function EvalCell({ value, baseline = false }: { value: string | null; baseline?: boolean }) {
  if (!value) {
    return (
      <span
        className="lp-mono inline-flex h-7 w-12 items-center justify-center rounded-[3px] border border-dashed text-[10px]"
        style={{
          borderColor: 'var(--border-subtle)',
          color: 'var(--fg-faint)',
        }}
      >
        —
      </span>
    );
  }
  if (baseline) {
    return (
      <span
        className="lp-mono inline-flex h-7 w-12 items-center justify-center rounded-[3px] border text-[11px] font-medium"
        style={{
          background: 'var(--bg-raised)',
          color: 'var(--fg-muted)',
          borderColor: 'var(--border-default)',
        }}
      >
        {value}
      </span>
    );
  }
  const rate = parseRate(value);
  const tone = rate != null ? passRateTone(rate) : { bg: 'transparent', fg: 'var(--fg-muted)' };
  return (
    <span
      className="lp-mono inline-flex h-7 w-12 items-center justify-center rounded-[3px] border text-[11px] font-medium"
      style={{
        background: tone.bg,
        color: tone.fg,
        borderColor: 'oklch(0.3 0.012 240 / 0.4)',
      }}
    >
      {value}
    </span>
  );
}

function TagBadge({ tag }: { tag: string }) {
  const tone = TAG_TONE[tag] ?? 'var(--fg-muted)';
  return (
    <span
      className="lp-mono inline-flex items-center gap-1 rounded-[3px] border px-1 py-px text-[9.5px] uppercase tracking-[0.6px]"
      style={{
        borderColor: `${tone}33`,
        color: tone,
        background: `${tone}14`,
      }}
    >
      <span className="h-1 w-1 rounded-full" style={{ background: tone }} />
      {tag}
    </span>
  );
}
