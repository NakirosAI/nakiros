import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Brain,
  CheckCircle,
  FlaskConical,
  GitCompare,
  Plus,
  RefreshCw,
  ShieldCheck,
  Square,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { AgentRunKind, AgentRunStatus } from '@nakiros/shared';

interface NewRunHeaderProps {
  kind: AgentRunKind;
  status: AgentRunStatus;
  /** Display title — typically `run.title` or "Audit · skillName". */
  title: string;
  /**
   * Override for the small kind chip label. When omitted, the chip shows the
   * default kindVisual label (ex "Audit"). Used to surface "Audit CLAUDE.md"
   * for runs that target a CLAUDE.md via `claudemdTarget`.
   */
  kindLabelOverride?: string;
  /** Optional sub-line stats shown right of the title. */
  stats?: Array<{ label: string; value: string }>;
  /** Closes the run tab — wired by the parent. */
  onBack?: () => void;
  /** Stop button shown while running. */
  onStop?: () => void;
  /** Finish button shown once completed (audit / fix / create). */
  onFinish?: () => void;
  /** When true, the Stop button shows a spinner + "Stopping…" copy and
   *  disables itself to block double-clicks. */
  isStopping?: boolean;
  /** Optional progress percentage [0, 100] — if defined, drives the bottom progress bar. */
  progressPct?: number | null;
  /** Optional total step count for the "step N/M" caption. */
  stepTotal?: number;
  /** Optional explicit "done" step count — overrides the percentage-based
   *  computation. Used by eval batches where steps are runs done. */
  stepDone?: number;
}

/**
 * New-design run header — port of `RunHeader` in
 * `apps/Nakiros-new-design/screens-runs.jsx:3-94`. Renders the kind
 * pill, status tone, title, contextual stats, and the action buttons
 * available in the current state. The bottom progress bar appears
 * only while the run is `running` / `pending`.
 *
 * Visual is fully OKLch (font-n-mono labels, OKLch tones for status,
 * shimmer overlay on the progress bar) so the header sits naturally
 * inside the new shell.
 */
export default function NewRunHeader({
  kind,
  status,
  title,
  kindLabelOverride,
  stats = [],
  onBack,
  onStop,
  onFinish,
  isStopping = false,
  progressPct,
  stepTotal,
  stepDone: stepDoneProp,
}: NewRunHeaderProps) {
  const { t } = useTranslation('runs');
  const kindMeta = kindVisual(kind);
  const statusTone = statusVisual(status);
  const Icon = kindMeta.Icon;

  const showProgress =
    (status === 'running' || status === 'pending') &&
    (typeof progressPct === 'number' || typeof stepDoneProp === 'number');

  const stepDone =
    stepDoneProp ??
    (showProgress && stepTotal != null
      ? Math.round(((progressPct ?? 0) / 100) * stepTotal)
      : null);

  return (
    <div className="border-b border-n-border-subtle bg-n-canvas">
      <div className="flex items-center gap-3.5 px-6 py-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 bg-transparent text-[12.5px] text-n-muted hover:text-n-fg"
          >
            <ArrowLeft size={14} strokeWidth={2} />
            {t('back', { defaultValue: 'Back' })}
          </button>
        )}

        <span className="h-3.5 w-px bg-n-border-subtle" />

        <span
          className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-n-md bg-n-sunken"
          style={{ color: kindMeta.color }}
        >
          <Icon size={16} strokeWidth={2} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-n-mono text-[11px] uppercase tracking-[0.6px] text-n-subtle">
              {kindLabelOverride ?? kindMeta.label}
            </span>
            <span
              className="inline-flex items-center gap-1.5 font-n-mono text-[11px]"
              style={{ color: statusTone.color }}
            >
              {statusTone.pulse && (
                <span
                  className="n-pulse h-1.5 w-1.5 rounded-full"
                  style={{ background: statusTone.color }}
                />
              )}
              {statusTone.label}
            </span>
            {showProgress && stepDone !== null && stepTotal != null && (
              <span className="font-n-mono tabular-nums text-[11px] text-n-faint">
                · step {stepDone}/{stepTotal}
              </span>
            )}
          </div>
          <div className="mt-0.5 truncate text-[14px] font-medium text-n-fg" title={title}>
            {title}
          </div>
        </div>

        {stats.length > 0 && (
          <div className="flex flex-shrink-0 items-center gap-3.5">
            {stats.map((stat) => (
              <Stat key={stat.label} label={stat.label} value={stat.value} />
            ))}
          </div>
        )}

        {(onStop || onFinish) && (
          <>
            <span className="h-3.5 w-px bg-n-border-subtle" />
            <div className="flex flex-shrink-0 gap-1.5">
              {onStop && (status === 'running' || status === 'pending') && (
                <ActionButton
                  icon={
                    isStopping ? (
                      <RefreshCw size={12} strokeWidth={2.25} className="animate-spin" />
                    ) : (
                      <Square size={12} strokeWidth={2.25} />
                    )
                  }
                  label={
                    isStopping
                      ? t('stopping', { defaultValue: 'Stopping…' })
                      : t('stop', { defaultValue: 'Stop' })
                  }
                  tone="danger"
                  onClick={onStop}
                  disabled={isStopping}
                />
              )}
              {onFinish && status === 'done' && (
                <ActionButton
                  icon={<CheckCircle size={12} strokeWidth={2.25} />}
                  label={
                    kind === 'fix' || kind === 'edit'
                      ? t('finishAndDeploy', { defaultValue: 'Finish & deploy' })
                      : t('finish', { defaultValue: 'Finish' })
                  }
                  tone="primary"
                  onClick={onFinish}
                />
              )}
            </div>
          </>
        )}
      </div>

      {showProgress && (
        <div className="relative h-[2px] overflow-hidden bg-n-sunken">
          <div
            className="absolute left-0 top-0 h-full transition-[width] duration-500"
            style={{
              width: `${
                typeof progressPct === 'number'
                  ? progressPct
                  : stepDone != null && stepTotal
                    ? (stepDone / stepTotal) * 100
                    : 0
              }%`,
              background: statusTone.color,
            }}
          />
          <div
            className="n-shimmer-bg absolute top-0 h-full w-20 mix-blend-overlay opacity-60"
            style={{
              left: `calc(${
                typeof progressPct === 'number'
                  ? progressPct
                  : stepDone != null && stepTotal
                    ? (stepDone / stepTotal) * 100
                    : 0
              }% - 80px)`,
            }}
          />
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-start gap-px leading-tight">
      <span className="font-n-mono text-[9.5px] uppercase tracking-[0.8px] text-n-faint">
        {label}
      </span>
      <span className="font-n-mono tabular-nums text-[12px] text-n-fg">{value}</span>
    </div>
  );
}

function ActionButton({
  icon,
  label,
  tone,
  onClick,
  disabled = false,
}: {
  icon: React.ReactNode;
  label: string;
  tone: 'primary' | 'danger';
  onClick(): void;
  disabled?: boolean;
}) {
  const cls =
    tone === 'primary'
      ? 'border-n-accent-line bg-n-accent-soft text-n-accent hover:bg-n-accent-soft'
      : 'border-n-critical/40 bg-n-critical-soft text-n-critical hover:bg-n-critical-soft';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        'inline-flex h-7 items-center gap-1.5 rounded-n-sm border px-2.5 font-n-mono text-[11.5px] transition-colors ' +
        cls +
        (disabled ? ' cursor-not-allowed opacity-60' : '')
      }
    >
      {icon}
      {label}
    </button>
  );
}

// ── Visual maps ────────────────────────────────────────────────────────────

function kindVisual(kind: AgentRunKind): { Icon: LucideIcon; color: string; label: string } {
  switch (kind) {
    case 'audit':
      return { Icon: ShieldCheck, color: 'var(--n-info)', label: 'Audit run' };
    case 'eval':
      return { Icon: FlaskConical, color: 'var(--n-accent)', label: 'Eval run' };
    case 'fix':
      return { Icon: Wrench, color: 'var(--n-violet)', label: 'Fix session' };
    case 'edit':
      return { Icon: Wrench, color: 'var(--n-info)', label: 'Edit session' };
    case 'create':
      return { Icon: Plus, color: 'var(--n-healthy)', label: 'Create skill' };
    case 'analyze-convo':
      return { Icon: Brain, color: 'var(--n-watch)', label: 'Analyze conversation' };
    default:
      return { Icon: GitCompare, color: 'var(--n-fg-muted)', label: kind };
  }
}

function statusVisual(
  status: AgentRunStatus,
): { color: string; label: string; pulse?: boolean } {
  switch (status) {
    case 'running':
      return { color: 'var(--n-accent)', label: 'Running', pulse: true };
    case 'pending':
      return { color: 'var(--n-info)', label: 'Starting…', pulse: true };
    case 'awaiting_input':
      return { color: 'var(--n-watch)', label: 'Waiting for input', pulse: true };
    case 'done':
      return { color: 'var(--n-healthy)', label: 'Completed' };
    case 'failed':
      return { color: 'var(--n-critical)', label: 'Failed' };
    case 'cancelled':
      return { color: 'var(--n-fg-faint)', label: 'Stopped' };
  }
}
