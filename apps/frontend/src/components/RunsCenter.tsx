import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import {
  Activity,
  CheckCircle,
  Loader2,
  Search,
  Sparkles,
  Wrench,
  X,
  XCircle,
} from 'lucide-react';
import clsx from 'clsx';

import type { AgentRun, AgentRunKind, AgentRunStatus } from '@nakiros/shared';

import { useActiveAgentRuns } from '../hooks/useAgentRun';
import { useAgentRunNavigation } from '../hooks/useAgentRunNavigation';
import { agentRunStore, isTerminal } from '../lib/agent-run-store';

const ACTIVE_STATUSES: ReadonlySet<AgentRunStatus> = new Set([
  'pending',
  'running',
  'awaiting_input',
]);

/**
 * Topbar pill + slide-in drawer surfacing every agent run regardless of
 * `kind`. Visible from any screen so the in-flight indicator survives
 * navigation. The icon shows two distinct counters:
 *
 * - **Active** (primary, spinner) when at least one run is in flight.
 * - **Completed-unread** (success/warning) when terminal runs are waiting
 *   to be acknowledged. The user dismisses each entry (or "clear
 *   completed") to remove them from the list.
 *
 * Clicking a row navigates to the run's native screen via the
 * `useAgentRunNavigation` context.
 */
export function RunsCenter() {
  const onOpenRun = useAgentRunNavigation();
  const runs = useActiveAgentRuns();
  const [open, setOpen] = useState(false);

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const { active, terminal } = useMemo(() => {
    const activeList: AgentRun[] = [];
    const terminalList: AgentRun[] = [];
    for (const run of runs) {
      if (ACTIVE_STATUSES.has(run.status)) activeList.push(run);
      else terminalList.push(run);
    }
    return { active: activeList, terminal: terminalList };
  }, [runs]);

  const activeCount = active.length;
  const terminalCount = terminal.length;
  const total = activeCount + terminalCount;

  return (
    <>
      <PillButton active={activeCount} terminal={terminalCount} onClick={() => setOpen(true)} />

      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <aside
            role="dialog"
            aria-label="Agent runs"
            className="fixed right-0 top-0 z-50 flex h-screen w-96 flex-col border-l border-[var(--line)] bg-[var(--bg-card)] shadow-2xl"
          >
            <header className="flex shrink-0 items-center justify-between border-b border-[var(--line)] px-4 py-3">
              <div className="text-sm font-semibold text-[var(--text-primary)]">
                Runs ({total})
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-muted)] hover:text-[var(--text-primary)]"
                aria-label="Close"
              >
                <X size={14} />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto">
              {total === 0 ? (
                <div className="p-6 text-center text-xs text-[var(--text-muted)]">
                  No runs to show.
                </div>
              ) : (
                <>
                  {activeCount > 0 && (
                    <Section label="Active" count={activeCount}>
                      {active.map((run) => (
                        <RunRow
                          key={run.id}
                          run={run}
                          onClick={() => {
                            onOpenRun(run);
                            setOpen(false);
                          }}
                        />
                      ))}
                    </Section>
                  )}
                  {terminalCount > 0 && (
                    <Section label="Completed" count={terminalCount}>
                      {terminal.map((run) => (
                        <RunRow
                          key={run.id}
                          run={run}
                          onClick={() => {
                            onOpenRun(run);
                            setOpen(false);
                          }}
                          onDismiss={() => agentRunStore.dismiss(run.id)}
                        />
                      ))}
                    </Section>
                  )}
                </>
              )}
            </div>

            {terminalCount > 0 && (
              <footer className="shrink-0 border-t border-[var(--line)] px-4 py-2">
                <button
                  type="button"
                  onClick={() => agentRunStore.dismissAllTerminal()}
                  className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  Clear completed
                </button>
              </footer>
            )}
          </aside>
        </>
      )}
    </>
  );
}

function PillButton({
  active,
  terminal,
  onClick,
}: {
  active: number;
  terminal: number;
  onClick(): void;
}) {
  if (active > 0) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex items-center gap-1.5 rounded-md border border-[var(--primary)]/40 bg-[var(--primary)]/10 px-2.5 py-1.5 text-xs font-medium text-[var(--primary)] transition-colors"
        aria-label={`${active} active agent runs`}
      >
        <Loader2 size={12} className="animate-spin" />
        <span>{active}</span>
        {terminal > 0 && (
          <span className="ml-1 rounded-full bg-emerald-500/20 px-1.5 text-[10px] font-semibold text-emerald-400">
            +{terminal}
          </span>
        )}
      </button>
    );
  }

  if (terminal > 0) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-400 transition-colors"
        aria-label={`${terminal} completed agent runs`}
      >
        <CheckCircle size={12} />
        <span>{terminal}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-md border border-[var(--line)] bg-[var(--bg-soft)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
      aria-label="Agent runs (none)"
    >
      <Activity size={12} />
      <span>0</span>
    </button>
  );
}

function Section({ label, count, children }: { label: string; count: number; children: ReactNode }) {
  return (
    <div>
      <div className="border-b border-[var(--line)] bg-[var(--bg-soft)] px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        {label} · {count}
      </div>
      <ul className="divide-y divide-[var(--line)]">{children}</ul>
    </div>
  );
}

function RunRow({
  run,
  onClick,
  onDismiss,
}: {
  run: AgentRun;
  onClick(): void;
  onDismiss?(): void;
}) {
  return (
    <li className="group flex items-stretch hover:bg-[var(--bg-muted)]">
      <button
        type="button"
        onClick={onClick}
        className="flex flex-1 items-center gap-2 px-4 py-3 text-left text-xs"
      >
        <KindIcon run={run} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-[var(--text-primary)]">{run.title}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
            <span className="uppercase tracking-wide">{run.kind}</span>
            <span>·</span>
            <StatusLabel status={run.status} />
          </div>
        </div>
      </button>
      {onDismiss && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          className="flex shrink-0 items-center justify-center px-3 text-[var(--text-muted)] opacity-0 transition-opacity hover:text-[var(--text-primary)] group-hover:opacity-100"
          aria-label="Dismiss"
        >
          <X size={12} />
        </button>
      )}
    </li>
  );
}

const KIND_ICONS: Record<AgentRunKind, ComponentType<{ size?: number; className?: string }>> = {
  audit: Search,
  eval: Sparkles,
  fix: Wrench,
  create: Sparkles,
};

function KindIcon({ run }: { run: AgentRun }) {
  if (ACTIVE_STATUSES.has(run.status)) {
    return <Loader2 size={14} className="shrink-0 animate-spin text-[var(--primary)]" />;
  }
  if (run.status === 'failed' || run.status === 'cancelled') {
    return <XCircle size={14} className="shrink-0 text-amber-500" />;
  }
  if (run.status === 'done') {
    return <CheckCircle size={14} className="shrink-0 text-emerald-500" />;
  }
  const Icon = KIND_ICONS[run.kind] ?? Activity;
  return <Icon size={14} className="shrink-0 text-[var(--text-muted)]" />;
}

const STATUS_LABELS: Record<AgentRunStatus, string> = {
  pending: 'pending',
  running: 'running',
  awaiting_input: 'waiting input',
  done: 'done',
  failed: 'failed',
  cancelled: 'cancelled',
};

function StatusLabel({ status }: { status: AgentRunStatus }) {
  const tone = isTerminal(status)
    ? status === 'done'
      ? 'text-emerald-500'
      : 'text-amber-500'
    : 'text-[var(--primary)]';
  return <span className={clsx('uppercase tracking-wide', tone)}>{STATUS_LABELS[status]}</span>;
}
