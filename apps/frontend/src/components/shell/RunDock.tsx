import { useEffect, useRef, useState, useSyncExternalStore, type MouseEvent as ReactMouseEvent } from 'react';
import {
  Brain,
  FlaskConical,
  Plus,
  Rocket,
  ShieldCheck,
  Sparkles,
  Square,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import type { AgentRun, AgentRunKind, AgentRunStatus, Project } from '@nakiros/shared';
import { agentRunStore, isTerminal } from '../../lib/agent-run-store';
import { getRunAPI } from '../../lib/run-api';

interface RunDockProps {
  /** Called when the user activates a run row — open it in a new tab. */
  onOpenRun(run: AgentRun): void;
  /** Project list, used to resolve a run's target into a display label. */
  projects: Project[];
}

/**
 * RunDock — pill in the new-shell topbar showing live counts of agent
 * runs (running / waiting / recently done) with a dropdown listing them
 * grouped by status. Subscribes to {@link agentRunStore} via
 * {@link useSyncExternalStore} so any kind reconciliation tick from
 * `useAgentRunsSync` propagates here without prop wiring.
 *
 * Mirrors the new-design mockup `RunDockTrigger` + `RunDockPanel` but
 * rebuilt on real `AgentRun` data: statuses translate to mockup tones
 * (`pending`/`running` → "running", `awaiting_input` → "waiting",
 * `done` → "done", `failed`/`cancelled` → "failed").
 *
 * Run-detail rendering is out of scope (Phase 4 / `RunScreen`); for now
 * `onOpenRun` opens a placeholder tab.
 */
export default function RunDock({ onOpenRun, projects }: RunDockProps) {
  const runs = useAgentRuns();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const grouped = groupRuns(runs);
  const runningCount = grouped.running.length;
  const waitingCount = grouped.waiting.length;
  const doneCount = grouped.done.length;
  const totalAlerts = waitingCount + doneCount;

  // Click-outside dismissal. Defer the listener attach by a tick so the
  // click that opened the dock doesn't immediately close it.
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    const id = window.setTimeout(() => document.addEventListener('mousedown', onMouseDown), 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [open]);

  if (runs.length === 0) return null;

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Runs"
        className={
          'inline-flex h-6 items-center gap-1.5 rounded-[5px] border px-[9px] font-n-mono text-[11px] leading-none text-n-muted transition-colors ' +
          (open ? 'bg-n-raised ' : 'bg-transparent ') +
          (runningCount > 0 ? 'border-n-accent-line' : 'border-n-border-subtle')
        }
      >
        {runningCount > 0 && (
          <span className="n-pulse h-1.5 w-1.5 rounded-full bg-n-accent" />
        )}
        <span className="text-[10px] tabular-nums text-n-fg">{runningCount}</span>
        <span>running</span>
        {totalAlerts > 0 && (
          <>
            <span className="text-n-faint">·</span>
            <span
              className={
                'text-[10px] tabular-nums ' +
                (doneCount > 0 ? 'text-n-healthy' : 'text-n-watch')
              }
            >
              {doneCount > 0 ? doneCount : waitingCount}
            </span>
            <span>{doneCount > 0 ? 'done' : 'wait'}</span>
          </>
        )}
      </button>

      {open && (
        <RunDockPanel
          grouped={grouped}
          projects={projects}
          onOpenRun={(r) => {
            setOpen(false);
            onOpenRun(r);
          }}
          onDismissRun={(id) => agentRunStore.dismiss(id)}
        />
      )}
    </div>
  );
}

// ── Panel ──────────────────────────────────────────────────────────────────

interface GroupedRuns {
  running: AgentRun[];
  waiting: AgentRun[];
  done: AgentRun[];
  failed: AgentRun[];
}

interface RunDockPanelProps {
  grouped: GroupedRuns;
  projects: Project[];
  onOpenRun(run: AgentRun): void;
  onDismissRun(id: string): void;
}

function RunDockPanel({ grouped, projects, onOpenRun, onDismissRun }: RunDockPanelProps) {
  const total =
    grouped.running.length +
    grouped.waiting.length +
    grouped.done.length +
    grouped.failed.length;

  return (
    <div
      data-rundock
      className="absolute right-0 top-7 z-50 w-[420px] overflow-hidden rounded-n-lg border border-n-border-default bg-n-surface shadow-n-pop"
    >
      <div className="flex items-center justify-between border-b border-n-border-subtle px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <Zap size={14} className="text-n-accent" strokeWidth={2.25} />
          <strong className="text-[13px] text-n-fg">Runs</strong>
          <span className="font-n-mono text-[11px] text-n-faint">{total} active</span>
        </div>
        <button
          type="button"
          className="font-n-mono text-[11px] text-n-subtle hover:text-n-fg"
        >
          view all →
        </button>
      </div>

      <div className="max-h-[420px] overflow-y-auto">
        {grouped.running.length > 0 && (
          <DockGroup label="Running" runs={grouped.running} projects={projects} onOpen={onOpenRun} onDismiss={onDismissRun} />
        )}
        {grouped.waiting.length > 0 && (
          <DockGroup label="Waiting for input" runs={grouped.waiting} projects={projects} onOpen={onOpenRun} onDismiss={onDismissRun} />
        )}
        {grouped.done.length > 0 && (
          <DockGroup label="Completed" runs={grouped.done} projects={projects} onOpen={onOpenRun} onDismiss={onDismissRun} />
        )}
        {grouped.failed.length > 0 && (
          <DockGroup label="Stopped / failed" runs={grouped.failed} projects={projects} onOpen={onOpenRun} onDismiss={onDismissRun} />
        )}
      </div>
    </div>
  );
}

interface DockGroupProps {
  label: string;
  runs: AgentRun[];
  projects: Project[];
  onOpen(run: AgentRun): void;
  onDismiss(id: string): void;
}

function DockGroup({ label, runs, projects, onOpen, onDismiss }: DockGroupProps) {
  return (
    <div>
      <div className="px-3.5 pt-2 pb-1 font-n-mono text-[10.5px] uppercase tracking-[1px] text-n-subtle">
        {label}
      </div>
      {runs.map((run) => (
        <DockRunRow
          key={run.id}
          run={run}
          projects={projects}
          onOpen={() => onOpen(run)}
          onDismiss={() => onDismiss(run.id)}
        />
      ))}
    </div>
  );
}

interface DockRunRowProps {
  run: AgentRun;
  projects: Project[];
  onOpen(): void;
  onDismiss(): void;
}

function DockRunRow({ run, projects, onOpen, onDismiss }: DockRunRowProps) {
  const { Icon, color } = kindVisual(run.kind);
  const tone = statusTone(run.status);
  const targetLabel = resolveTargetLabel(run, projects);
  const dismissable = isTerminal(run.status);
  const stoppable = !isTerminal(run.status) && getRunAPI(run.kind) !== null;
  const [isStopping, setIsStopping] = useState(false);

  const handleStop = async (e: ReactMouseEvent) => {
    e.stopPropagation();
    if (isStopping) return;
    setIsStopping(true);
    try {
      const api = getRunAPI(run.kind);
      if (api) await api.actions.stop(run.id);
    } catch (err) {
      console.error('[run-dock] stop failed', err);
    } finally {
      setIsStopping(false);
    }
  };

  return (
    <div
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onOpen();
      }}
      className="group flex w-full cursor-pointer items-center gap-2.5 border-t border-n-border-subtle px-3.5 py-2.5 text-left transition-colors hover:bg-n-raised"
    >
      <span
        className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-n-xs bg-n-sunken"
        style={{ color }}
      >
        <Icon size={13} strokeWidth={2.25} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-medium text-n-fg">
          {run.title}
        </span>
        <span className="mt-0.5 flex items-center gap-2 font-n-mono text-[10.5px] text-n-subtle">
          <span>{run.kind}</span>
          {targetLabel && (
            <>
              <span className="text-n-faint">·</span>
              <span>{targetLabel}</span>
            </>
          )}
          <span className="text-n-faint">·</span>
          <span className="tabular-nums text-n-faint">{formatElapsed(run)}</span>
        </span>
      </span>
      <span className="flex flex-shrink-0 items-center gap-2">
        <span
          className="inline-flex items-center gap-1.5 font-n-mono text-[10.5px]"
          style={{ color: tone.color }}
        >
          {run.status === 'running' && (
            <span
              className="n-pulse h-[5px] w-[5px] rounded-full"
              style={{ background: tone.color }}
            />
          )}
          {tone.label}
        </span>
        {stoppable && (
          <button
            type="button"
            aria-label="Stop run"
            title="Stop this run"
            onClick={handleStop}
            disabled={isStopping}
            className="inline-flex h-4 w-4 items-center justify-center rounded-n-xs text-n-subtle opacity-0 transition-opacity hover:bg-n-canvas hover:text-n-critical group-hover:opacity-100 disabled:cursor-wait disabled:opacity-30"
          >
            <Square size={9} strokeWidth={2.5} fill="currentColor" />
          </button>
        )}
        {dismissable && (
          <button
            type="button"
            aria-label="Dismiss run"
            onClick={(e) => {
              e.stopPropagation();
              onDismiss();
            }}
            className="inline-flex h-4 w-4 items-center justify-center rounded-n-xs text-n-subtle opacity-0 transition-opacity hover:bg-n-canvas hover:text-n-fg group-hover:opacity-100"
          >
            <X size={10} strokeWidth={2.5} />
          </button>
        )}
      </span>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function useAgentRuns(): AgentRun[] {
  return useSyncExternalStore(
    agentRunStore.subscribe,
    agentRunStore.getActiveSnapshot,
    agentRunStore.getActiveSnapshot,
  );
}

function groupRuns(runs: AgentRun[]): GroupedRuns {
  const out: GroupedRuns = { running: [], waiting: [], done: [], failed: [] };
  for (const run of runs) {
    if (run.status === 'running' || run.status === 'pending') out.running.push(run);
    else if (run.status === 'awaiting_input') out.waiting.push(run);
    else if (run.status === 'done') out.done.push(run);
    else if (isTerminal(run.status)) out.failed.push(run);
  }
  return out;
}

function kindVisual(kind: AgentRunKind): { Icon: typeof ShieldCheck; color: string } {
  switch (kind) {
    case 'audit':
      return { Icon: ShieldCheck, color: 'var(--n-info)' };
    case 'eval':
      return { Icon: FlaskConical, color: 'var(--n-accent)' };
    case 'fix':
      return { Icon: Wrench, color: 'var(--n-violet)' };
    case 'create':
      return { Icon: Plus, color: 'var(--n-healthy)' };
    case 'analyze-convo':
      return { Icon: Brain, color: 'var(--n-watch)' };
    case 'classify-convo':
      return { Icon: Sparkles, color: 'var(--n-watch)' };
    case 'bootstrap':
      // Same icon/color as the sidebar "Bootstrap" nav item and the
      // BootstrapScreen header — keeps the entity visually consistent
      // across surfaces.
      return { Icon: Rocket, color: 'var(--n-accent)' };
    default:
      return { Icon: Sparkles, color: 'var(--n-fg-muted)' };
  }
}

function statusTone(status: AgentRunStatus): { color: string; label: string } {
  switch (status) {
    case 'running':
      return { color: 'var(--n-accent)', label: 'Running' };
    case 'pending':
      return { color: 'var(--n-info)', label: 'Starting…' };
    case 'awaiting_input':
      return { color: 'var(--n-watch)', label: 'Waiting' };
    case 'done':
      return { color: 'var(--n-healthy)', label: 'Done' };
    case 'failed':
      return { color: 'var(--n-critical)', label: 'Failed' };
    case 'cancelled':
      return { color: 'var(--n-fg-faint)', label: 'Stopped' };
  }
}

/**
 * Build the "project / scope" label shown under each row. Mirrors the
 * mockup's `run.project` field, except real runs can be scoped beyond a
 * single project (global, plugin, marketplace) so we surface that.
 */
function resolveTargetLabel(run: AgentRun, projects: Project[]): string {
  const target = run.target;
  if (target.type === 'conversation') {
    return projects.find((p) => p.id === target.projectId)?.name ?? target.projectId;
  }
  if (target.type === 'claudemd') {
    return projects.find((p) => p.id === target.projectId)?.name ?? target.projectId;
  }
  if (target.type === 'rules') {
    return projects.find((p) => p.id === target.projectId)?.name ?? target.projectId;
  }
  if (target.type === 'subagents') {
    return projects.find((p) => p.id === target.projectId)?.name ?? target.projectId;
  }
  if (target.type === 'hooks') {
    return projects.find((p) => p.id === target.projectId)?.name ?? target.projectId;
  }
  if (target.type === 'permissions') {
    return projects.find((p) => p.id === target.projectId)?.name ?? target.projectId;
  }
  if (target.type === 'codex-config') {
    return projects.find((p) => p.id === target.projectId)?.name ?? target.projectId;
  }
  if (target.type === 'mcp') {
    return projects.find((p) => p.id === target.projectId)?.name ?? target.projectId;
  }
  if (target.type === 'output-styles') {
    return projects.find((p) => p.id === target.projectId)?.name ?? target.projectId;
  }
  if (target.type === 'bootstrap') {
    return projects.find((p) => p.id === target.projectId)?.name ?? target.projectId;
  }
  switch (target.scope) {
    case 'project':
      return projects.find((p) => p.id === target.projectId)?.name ?? target.projectId ?? '';
    case 'claude-global':
      return 'global';
    case 'nakiros-bundled':
      return 'nakiros';
    case 'plugin':
      return target.pluginName ?? 'plugin';
  }
}

function formatElapsed(run: AgentRun): string {
  const start = Date.parse(run.startedAt);
  if (Number.isNaN(start)) return '';
  const end = run.endedAt ? Date.parse(run.endedAt) : Date.now();
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}
