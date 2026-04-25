import { useEffect, useRef, useState } from 'react';
import { Activity, Loader2 } from 'lucide-react';
import clsx from 'clsx';

import type { AgentRun } from '@nakiros/shared';

import { useActiveAgentRuns } from '../hooks/useAgentRun';

interface RunsCenterProps {
  /** Invoked when the user clicks one of the listed runs. Hosts handle navigation. */
  onOpenRun?(run: AgentRun): void;
}

/**
 * Topbar pill that surfaces every active agent run regardless of `kind`. A
 * single source of truth for "is something running right now?", visible from
 * any screen so the in-flight indicator survives navigation.
 *
 * v1 lists active runs only; the dropdown is read-only (clicking a run calls
 * `onOpenRun` if provided). Completed-run badges and notifications come in a
 * later iteration.
 */
export function RunsCenter({ onOpenRun }: RunsCenterProps) {
  const runs = useActiveAgentRuns();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Click-outside to close.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const activeCount = runs.filter((r) => r.status === 'running' || r.status === 'pending' || r.status === 'awaiting_input').length;

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          'flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors',
          activeCount > 0
            ? 'border-[var(--primary)]/40 bg-[var(--primary)]/10 text-[var(--primary)]'
            : 'border-[var(--line)] bg-[var(--bg-soft)] text-[var(--text-muted)] hover:text-[var(--text-primary)]',
        )}
        aria-label="Active agent runs"
      >
        {activeCount > 0 ? (
          <Loader2 size={12} className="animate-spin" />
        ) : (
          <Activity size={12} />
        )}
        <span>{activeCount}</span>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-80 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--bg-card)] shadow-lg"
          role="dialog"
        >
          <div className="border-b border-[var(--line)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Runs
          </div>
          {runs.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-[var(--text-muted)]">
              No active runs.
            </div>
          ) : (
            <ul className="max-h-[60vh] divide-y divide-[var(--line)] overflow-y-auto">
              {runs.map((run) => (
                <RunRow
                  key={run.id}
                  run={run}
                  onClick={() => {
                    onOpenRun?.(run);
                    setOpen(false);
                  }}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function RunRow({ run, onClick }: { run: AgentRun; onClick(): void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-[var(--bg-muted)]"
      >
        <KindIcon run={run} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-[var(--text-primary)]">{run.title}</div>
          <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
            {run.kind} · {run.status}
          </div>
        </div>
      </button>
    </li>
  );
}

function KindIcon({ run }: { run: AgentRun }) {
  const isActive = run.status === 'running' || run.status === 'pending' || run.status === 'awaiting_input';
  if (isActive) {
    return <Loader2 size={14} className="shrink-0 animate-spin text-[var(--primary)]" />;
  }
  return <Activity size={14} className="shrink-0 text-[var(--text-muted)]" />;
}
