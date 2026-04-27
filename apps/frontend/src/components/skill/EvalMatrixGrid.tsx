import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, FlaskConical, MoreHorizontal, Play, RefreshCw } from 'lucide-react';
import type {
  EvalMatrix,
  EvalMatrixCell,
  EvalMatrixRow,
  EvalMatrixTag,
  GetEvalMatrixRequest,
  Skill,
  SkillEvalDefinition,
} from '@nakiros/shared';
import Sparkline from '../viz/Sparkline';
import EvalDiffOverlay from './EvalDiffOverlay';
import { launchEvalBatch, type OpenRunTabCallback } from '../../lib/run-launcher';
import type { SkillTabIdentity } from '../../hooks/useTabs';

interface EvalMatrixGridProps {
  /** The full skill, used for the eval definitions list (prompt, assertions). */
  skill: Skill;
  /** Forwarded as-is to `window.nakiros.getEvalMatrix`. */
  request: GetEvalMatrixRequest;
  /** Identity used by the "Run evals" button to launch a new batch. */
  identity?: SkillTabIdentity;
  /** Wired by NewShell — opens the resulting eval run in a new tab. */
  onOpenRunTab?: OpenRunTabCallback;
}

type ViewMode = 'evolution' | 'models';

/**
 * New-design Evals tab — port of `EvalsTab` in
 * `apps/Nakiros-new-design/screens-skills.jsx:272-399`. Renders the
 * full mockup layout: control toolbar, Evals définies list, sub-nav
 * (Évolution / Modèles), iteration × eval matrix with double rows
 * (with-skill / baseline), and a legend.
 *
 * Wired to real data via the existing `eval:getMatrix` IPC channel —
 * no daemon change. The legacy `EvalMatrix` component is intentionally
 * not reused (its hex tokens would clash with the OKLch new shell).
 *
 * Out of scope for PR5a:
 * - Cell click → detail drawer (PR5b)
 * - Eval diff overlay between two iterations (PR5b)
 * - Functional model multi-select filter (UI is rendered but inert)
 * - Functional `Run evals` button (PR6)
 * - "Modèles" sub-nav view (toggle exists, content placeholdered)
 */
export default function EvalMatrixGrid({ skill, request, identity, onOpenRunTab }: EvalMatrixGridProps) {
  const { t } = useTranslation('skills');
  const [matrix, setMatrix] = useState<EvalMatrix | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [includeBaseline, setIncludeBaseline] = useState(true);
  const [view, setView] = useState<ViewMode>('evolution');
  /**
   * Iteration the user wants to compare with its predecessor in the
   * diff overlay. Stored as the iteration number itself; the overlay
   * computes prev = iterations[idx - 1] from the matrix.
   */
  const [diffIteration, setDiffIteration] = useState<number | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    window.nakiros
      .getEvalMatrix(request)
      .then((data) => {
        if (cancelled) return;
        setMatrix(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [request.scope, request.projectId, request.pluginName, request.marketplaceName, request.skillName]);

  const definitions = skill.evals?.definitions ?? [];
  const totalAssertions = useMemo(
    () => definitions.reduce((acc, d) => acc + d.assertions.length, 0),
    [definitions],
  );

  const baselinePresent = useMemo(
    () =>
      !!matrix?.rows.some((row) => row.withoutSkill.some((cell) => cell !== null)),
    [matrix],
  );

  const headlinePassRate = useMemo(() => {
    if (!matrix) return null;
    const last = matrix.metrics.passRateByIteration.at(-1);
    return last == null ? null : Math.round(last * 100);
  }, [matrix]);

  const lastIteration = matrix?.iterations.at(-1);
  const tagCounts = matrix?.metrics.tagCounts;

  return (
    <div className="px-7 py-5 font-n-sans">
      {/* Control bar */}
      <div className="mb-3.5 rounded-n-lg border border-n-border-subtle bg-n-surface px-3.5 py-2.5">
        <div className="flex flex-wrap items-center gap-3.5">
          <div className="flex items-center gap-2">
            <span className="font-n-mono text-[11px] text-n-subtle">Modèle</span>
            <ModelChip name="Sonnet" active />
            <ModelChip name="Opus" />
            <ModelChip name="Haiku" />
          </div>
          <Divider />
          <CustomCheckbox
            checked={includeBaseline && baselinePresent}
            disabled={!baselinePresent}
            onChange={setIncludeBaseline}
            label={t('evalsTab.includeBaseline', {
              defaultValue: 'Inclure baseline (without-skill)',
            })}
          />
          <span className="flex-1" />
          <button
            type="button"
            disabled={!identity || !onOpenRunTab || isLaunching}
            onClick={async () => {
              if (!identity || !onOpenRunTab || isLaunching) return;
              setIsLaunching(true);
              try {
                await launchEvalBatch(
                  identity,
                  { includeBaseline: includeBaseline && baselinePresent },
                  onOpenRunTab,
                );
              } catch (err) {
                console.error('[evals] launchEvalBatch failed', err);
              } finally {
                setIsLaunching(false);
              }
            }}
            className={
              'inline-flex h-7 items-center gap-1.5 rounded-n-sm border border-n-accent-line bg-n-accent-soft px-3 font-n-mono text-[11.5px] text-n-accent ' +
              (identity && onOpenRunTab && !isLaunching
                ? 'hover:bg-n-accent-soft'
                : 'opacity-60')
            }
          >
            {isLaunching ? (
              <RefreshCw size={12} strokeWidth={2.25} className="animate-spin" />
            ) : (
              <Play size={12} strokeWidth={2.25} />
            )}
            {isLaunching
              ? t('runEvalsStarting', { defaultValue: 'Starting…' })
              : t('runEvals', { defaultValue: 'Run evals' })}
          </button>
        </div>
      </div>

      {/* Evals définies */}
      <SectionLabel
        right={
          <span className="font-n-mono text-[11px] text-n-faint">
            {definitions.length} eval{definitions.length > 1 ? 's' : ''} · {totalAssertions}{' '}
            {t('evalsTab.assertions', { defaultValue: 'assertions' })}
          </span>
        }
      >
        {t('evalsTab.defined', { defaultValue: 'Evals définies' })}
      </SectionLabel>
      {/* Cap the definitions list to ~3 visible rows so a long list of
          long prompts doesn't push the matrix off-screen. Internal
          scroll keeps everything reachable. */}
      <div className="mb-5 max-h-[260px] overflow-y-auto rounded-n-md">
        {definitions.length === 0 ? (
          <div className="rounded-n-md border border-dashed border-n-border-default bg-n-surface px-4 py-6 text-center font-n-mono text-[11.5px] text-n-faint">
            {t('evalsTab.noDefinitions', {
              defaultValue: 'No eval defined for this skill yet.',
            })}
          </div>
        ) : (
          <div className="grid gap-1.5">
            {definitions.map((def) => (
              <EvalDefinitionRow key={def.name} def={def} />
            ))}
          </div>
        )}
      </div>

      {/* Sub-nav + headline */}
      <div className="mb-3 flex flex-wrap items-center gap-3.5">
        <SubNav active={view} onChange={setView} />
        <span className="font-n-mono text-[11px] text-n-subtle">
          pass rate{' '}
          <span style={{ color: passRateColor(headlinePassRate) }}>
            {headlinePassRate == null ? '—' : `${headlinePassRate}%`}
          </span>
          {lastIteration != null && (
            <span className="text-n-faint"> · iter {lastIteration}</span>
          )}
        </span>
        {matrix && matrix.metrics.passRateByIteration.length > 0 && (
          <Sparkline
            data={matrix.metrics.passRateByIteration.map((r) => Math.round(r * 100))}
            width={120}
            height={22}
            stroke="var(--n-accent)"
            fill="var(--n-accent-soft)"
          />
        )}
        <span className="flex-1" />
        {tagCounts && <TagCountBadges counts={tagCounts} />}
      </div>

      {/* Body */}
      {error && (
        <div className="rounded-n-md border border-n-critical bg-n-critical-soft px-3 py-2 font-n-mono text-[12px] text-n-critical">
          {error}
        </div>
      )}

      {!error && loading && !matrix && (
        <div className="flex items-center gap-2 px-1 font-n-mono text-[12px] text-n-muted">
          <RefreshCw size={12} className="animate-spin" />
          {t('common:loading', { defaultValue: 'Loading…' })}
        </div>
      )}

      {!error && matrix && view === 'evolution' && matrix.iterations.length === 0 && (
        <div className="rounded-n-lg border border-dashed border-n-border-default bg-n-surface px-6 py-12 text-center">
          <FlaskConical size={20} className="mx-auto mb-3 text-n-faint" strokeWidth={1.75} />
          <div className="text-[13px] text-n-fg">
            {t('evalsTab.empty', { defaultValue: 'No eval iteration recorded yet.' })}
          </div>
          <div className="mt-1 text-[12px] text-n-muted">
            {t('evalsTab.emptyHint', {
              defaultValue: 'Run a first batch via the Run evals button (coming soon).',
            })}
          </div>
        </div>
      )}

      {!error && matrix && view === 'evolution' && matrix.iterations.length > 0 && (
        <>
          <MatrixTable
            matrix={matrix}
            includeBaseline={includeBaseline && baselinePresent}
            onSelectIteration={setDiffIteration}
          />
          <Legend hasBaseline={baselinePresent} />
        </>
      )}

      {matrix && diffIteration !== null && (
        <EvalDiffOverlay
          matrix={matrix}
          skill={skill}
          initialIteration={diffIteration}
          baseRequest={request}
          onClose={() => setDiffIteration(null)}
        />
      )}

      {!error && matrix && view === 'models' && (
        <div className="rounded-n-lg border border-dashed border-n-border-default bg-n-surface px-6 py-12 text-center text-n-muted">
          <div className="font-n-mono text-[10.5px] uppercase tracking-[1.2px] text-n-subtle">
            modèles
          </div>
          <div className="mt-2 text-[13px] text-n-fg">Coming soon</div>
          <div className="mt-1 text-[12px]">A/B/C model comparison view, see PR follow-up.</div>
        </div>
      )}
    </div>
  );
}

// ── Toolbar bits ───────────────────────────────────────────────────────────

function ModelChip({ name, active }: { name: string; active?: boolean }) {
  return (
    <span
      className={
        'rounded-n-xs border px-2 py-0.5 font-n-mono text-[11px] ' +
        (active
          ? 'border-n-accent-line bg-n-accent-soft text-n-accent-strong'
          : 'border-n-border-subtle bg-n-sunken text-n-muted')
      }
    >
      {name}
    </span>
  );
}

function Divider() {
  return <span className="h-3.5 w-px bg-n-border-subtle" />;
}

function CustomCheckbox({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled: boolean;
  onChange(next: boolean): void;
  label: string;
}) {
  return (
    <label
      className={
        'inline-flex items-center gap-1.5 text-[12px] ' +
        (disabled ? 'cursor-not-allowed text-n-faint' : 'cursor-pointer text-n-muted hover:text-n-fg')
      }
    >
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        className={
          'inline-flex h-[14px] w-[14px] items-center justify-center rounded-n-xs border transition-colors ' +
          (checked
            ? 'border-n-accent-line bg-n-accent-soft'
            : 'border-n-border-subtle bg-n-sunken')
        }
      >
        {checked && <Check size={10} strokeWidth={3} className="text-n-accent" />}
      </span>
      {label}
    </label>
  );
}

// ── Evals définies row ─────────────────────────────────────────────────────

function EvalDefinitionRow({ def }: { def: SkillEvalDefinition }) {
  const assertCount = def.assertions.length;
  return (
    <div className="rounded-n-md border border-n-border-subtle bg-n-surface px-3.5 py-2.5">
      <div className="flex items-center gap-3">
        <FlaskConical size={13} strokeWidth={2.25} className="flex-shrink-0 text-n-accent" />
        <span className="font-n-mono text-[12.5px] font-medium text-n-fg">{def.name}</span>
        <span className="font-n-mono text-[10.5px] text-n-faint">{assertCount} assertions</span>
        <span className="flex-1" />
        <button
          type="button"
          disabled
          aria-label="More"
          className="flex-shrink-0 rounded-n-xs p-1 text-n-faint opacity-60"
        >
          <MoreHorizontal size={14} strokeWidth={2} />
        </button>
      </div>
      <p className="mt-1.5 text-[12px] leading-snug text-n-muted">{def.prompt}</p>
    </div>
  );
}

// ── Sub-nav + tag badges ───────────────────────────────────────────────────

function SubNav({ active, onChange }: { active: ViewMode; onChange(v: ViewMode): void }) {
  const items: Array<{ id: ViewMode; label: string }> = [
    { id: 'evolution', label: 'Évolution' },
    { id: 'models', label: 'Modèles' },
  ];
  return (
    <div className="inline-flex items-center gap-0.5 rounded-n-md border border-n-border-subtle bg-n-sunken p-0.5">
      {items.map((item) => {
        const isActive = active === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={
              'rounded-n-xs px-2.5 py-1 font-n-mono text-[11.5px] transition-colors ' +
              (isActive
                ? 'bg-n-raised text-n-fg'
                : 'bg-transparent text-n-muted hover:text-n-fg')
            }
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function TagCountBadges({
  counts,
}: {
  counts: EvalMatrix['metrics']['tagCounts'];
}) {
  // Only surface non-zero counts to keep the bar tidy.
  const ordered: Array<{
    key: keyof EvalMatrix['metrics']['tagCounts'];
    color: string;
  }> = [
    { key: 'stable', color: 'var(--n-healthy)' },
    { key: 'fixed', color: 'var(--n-accent)' },
    { key: 'flaky', color: 'var(--n-watch)' },
    { key: 'noisy', color: 'var(--n-watch)' },
    { key: 'broken', color: 'var(--n-critical)' },
    { key: 'new', color: 'var(--n-info)' },
  ];
  return (
    <div className="flex items-center gap-1.5">
      {ordered.map(({ key, color }) => {
        const n = counts[key];
        if (n === 0) return null;
        return (
          <span
            key={key}
            className="inline-flex items-center gap-1 rounded-n-xs border px-1.5 py-0.5 font-n-mono text-[10.5px]"
            style={{ borderColor: `${color}33`, color, background: `${color}14` }}
          >
            <span className="h-1 w-1 rounded-full" style={{ background: color }} />
            {n} {key}
          </span>
        );
      })}
    </div>
  );
}

// ── Matrix grid ────────────────────────────────────────────────────────────

function MatrixTable({
  matrix,
  includeBaseline,
  onSelectIteration,
}: {
  matrix: EvalMatrix;
  includeBaseline: boolean;
  /** Activated when the user clicks any cell — opens the diff overlay
   *  comparing that iteration with its predecessor. */
  onSelectIteration(iteration: number): void;
}) {
  return (
    <div className="overflow-x-auto rounded-n-lg border border-n-border-subtle bg-n-surface">
      <table className="border-separate border-spacing-0 text-[11.5px]">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 min-w-[220px] border-b border-n-border-subtle bg-n-surface px-3.5 py-3 text-left font-n-mono text-[10.5px] font-medium uppercase tracking-[1px] text-n-subtle">
              EVAL
            </th>
            {matrix.iterations.map((iteration, idx) => (
              <th
                key={iteration}
                className="min-w-[56px] border-b border-n-border-subtle px-1.5 py-3 text-center font-n-mono text-[10px] font-medium text-n-subtle"
                title={matrix.models[idx] ?? undefined}
              >
                <div>iter {iteration}</div>
                {matrix.models[idx] && (
                  <div
                    className="mt-0.5 text-[9px]"
                    style={{ color: modelColor(matrix.models[idx]!) }}
                  >
                    {shortenModelLabel(matrix.models[idx]!)}
                  </div>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map((row) => (
            <RowGroup
              key={row.evalName}
              row={row}
              includeBaseline={includeBaseline}
              onSelectIteration={onSelectIteration}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RowGroup({
  row,
  includeBaseline,
  onSelectIteration,
}: {
  row: EvalMatrixRow;
  includeBaseline: boolean;
  onSelectIteration(iteration: number): void;
}) {
  return (
    <>
      {/* with-skill row — no border-bottom so the cell visually pairs with the baseline below */}
      <tr>
        <td
          rowSpan={includeBaseline ? 2 : 1}
          className="sticky left-0 z-10 border-b border-n-border-subtle bg-n-surface px-3.5 py-1.5 align-top font-n-mono text-[12px]"
        >
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-n-fg">{row.evalName}</span>
              <TagBadge tag={row.tag} />
            </div>
            {includeBaseline && (
              <span className="text-[9.5px] text-n-faint">with-skill ▲ / baseline ▽</span>
            )}
          </div>
        </td>
        {row.withSkill.map((cell, i) => (
          <td
            key={i}
            className={
              'min-w-[56px] text-center ' +
              (includeBaseline ? 'pt-1 pb-px px-1' : 'border-b border-n-border-subtle px-1 py-1')
            }
          >
            <EvalCell
              cell={cell}
              onClick={cell ? () => onSelectIteration(cell.iteration) : undefined}
            />
          </td>
        ))}
      </tr>
      {includeBaseline && (
        <tr>
          {/* The eval-name cell spans both rows, so no leading <td> */}
          {row.withoutSkill.map((cell, i) => (
            <td
              key={i}
              className="min-w-[56px] border-b border-n-border-subtle px-1 pt-px pb-1.5 text-center"
            >
              <EvalCell
                cell={cell}
                baseline
                onClick={cell ? () => onSelectIteration(cell.iteration) : undefined}
              />
            </td>
          ))}
        </tr>
      )}
    </>
  );
}

function EvalCell({
  cell,
  baseline = false,
  onClick,
}: {
  cell: EvalMatrixCell | null;
  baseline?: boolean;
  onClick?: () => void;
}) {
  if (cell === null) {
    return (
      <span className="inline-flex h-7 w-12 items-center justify-center rounded-n-xs border border-dashed border-n-border-subtle bg-transparent font-n-mono text-[10px] text-n-faint">
        —
      </span>
    );
  }

  const tone = passRateTone(cell.passRate);

  if (baseline) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        className="inline-flex h-7 w-12 items-center justify-center rounded-n-xs border bg-n-raised font-n-mono text-[11px] font-medium text-n-muted transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-n-accent"
        style={{ borderColor: 'var(--n-border-default)' }}
        title={cellTooltip(cell)}
      >
        {cell.passed}/{cell.total}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="inline-flex h-7 w-12 items-center justify-center rounded-n-xs border font-n-mono text-[11px] font-medium transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-n-accent"
      style={{
        background: tone.bg,
        color: tone.fg,
        borderColor: 'oklch(0.3 0.012 240 / 0.4)',
      }}
      title={cellTooltip(cell)}
    >
      {cell.passed}/{cell.total}
    </button>
  );
}

function cellTooltip(cell: EvalMatrixCell): string {
  const pct = Math.round(cell.passRate * 100);
  return `${cell.passed}/${cell.total} · ${pct}% · ${cell.tokens.toLocaleString()} tokens`;
}

function passRateTone(rate: number): { bg: string; fg: string } {
  if (rate >= 0.85) return { bg: 'var(--n-healthy-soft)', fg: 'var(--n-healthy)' };
  if (rate >= 0.5) return { bg: 'var(--n-watch-soft)', fg: 'var(--n-watch)' };
  return { bg: 'var(--n-critical-soft)', fg: 'var(--n-critical)' };
}

function passRateColor(pct: number | null): string {
  if (pct == null) return 'var(--n-fg-muted)';
  if (pct >= 85) return 'var(--n-healthy)';
  if (pct >= 50) return 'var(--n-watch)';
  return 'var(--n-critical)';
}

// ── Tag badge ──────────────────────────────────────────────────────────────

function TagBadge({ tag }: { tag: EvalMatrixTag }) {
  const tone = tagTone(tag.kind);
  return (
    <span
      className="inline-flex items-center gap-1 rounded-n-xs border px-1 py-px font-n-mono text-[9.5px] uppercase tracking-[0.6px]"
      style={{ borderColor: `${tone}33`, color: tone, background: `${tone}14` }}
    >
      <span className="h-1 w-1 rounded-full" style={{ background: tone }} />
      {tag.kind}
    </span>
  );
}

function tagTone(kind: EvalMatrixTag['kind']): string {
  switch (kind) {
    case 'stable':
      return 'var(--n-healthy)';
    case 'flaky':
    case 'noisy':
      return 'var(--n-watch)';
    case 'broken':
      return 'var(--n-critical)';
    case 'fixed':
      return 'var(--n-accent)';
    case 'new':
      return 'var(--n-info)';
  }
}

// ── Model column header ────────────────────────────────────────────────────

function shortenModelLabel(model: string): string {
  // Drop the `claude-` prefix and the date suffix for compactness.
  // Keep only the family (sonnet / opus / haiku) and the major version when present.
  const stripped = model.replace(/^claude-/, '').replace(/-\d{4,8}.*$/, '');
  return stripped.toUpperCase();
}

function modelColor(model: string): string {
  const m = model.toLowerCase();
  if (m.includes('opus')) return 'var(--n-violet)';
  if (m.includes('haiku')) return 'var(--n-info)';
  return 'var(--n-fg-faint)';
}

// ── Section label ─────────────────────────────────────────────────────────

function SectionLabel({
  children,
  right,
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-2 flex items-center justify-between font-n-mono text-[10.5px] uppercase tracking-[1.2px] text-n-subtle">
      <span>{children}</span>
      {right}
    </div>
  );
}

// ── Legend ────────────────────────────────────────────────────────────────

function Legend({ hasBaseline }: { hasBaseline: boolean }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3.5 font-n-mono text-[11px] text-n-subtle">
      <LegendSwatch
        bg="var(--n-healthy-soft)"
        border="oklch(0.80 0.13 165 / 0.4)"
        label="≥ 85% pass"
      />
      <LegendSwatch
        bg="var(--n-watch-soft)"
        border="oklch(0.82 0.14 80 / 0.4)"
        label="50–85%"
      />
      <LegendSwatch
        bg="var(--n-critical-soft)"
        border="oklch(0.74 0.16 25 / 0.4)"
        label="< 50%"
      />
      {hasBaseline && (
        <LegendSwatch
          bg="var(--n-bg-raised)"
          border="var(--n-border-default)"
          label="baseline"
        />
      )}
    </div>
  );
}

function LegendSwatch({ bg, border, label }: { bg: string; border: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-2.5 w-4 rounded-n-xs border"
        style={{ background: bg, borderColor: border }}
      />
      {label}
    </span>
  );
}
