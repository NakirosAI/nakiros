import { type ChildProcess } from 'child_process';
import { existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

import { EventLog } from './event-log.js';
import { buildClaudeArgs, spawnClaudeTurn, type BuildArgsOptions } from './claude-stream.js';
import { generateRunId } from './run-id.js';
import { isActiveRunStatus } from './run-status.js';
import { persistRunJson, loadRunJson } from './run-store.js';

/**
 * Shared lifecycle status for any run kind. Audit / fix / create use the
 * narrow subset (no `queued` / `grading`); eval extends with both.
 */
export type RunStatus =
  | 'queued'
  | 'starting'
  | 'running'
  | 'waiting_for_input'
  | 'grading'
  | 'completed'
  | 'failed'
  | 'stopped';

/** Turn shape shared by `AuditRunTurn` and `EvalRunTurn` — both are structurally compatible. */
export interface BaseTurn {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  tools?: { name: string; display: string }[];
  blocks?: Array<{ type: 'text'; text: string } | { type: 'tool'; name: string; display: string }>;
}

/**
 * Minimal contract every run state must satisfy. Concrete `AuditRun`,
 * `SkillEvalRun`, etc. extend this — the factory only relies on these
 * fields.
 */
export interface BaseRun {
  runId: string;
  status: RunStatus;
  sessionId: string | null;
  workdir: string;
  turns: BaseTurn[];
  tokensUsed: number;
  durationMs: number;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
}

/** Wrapped event broadcast by every runner — `{ runId, event }`. */
export interface RunEventEnvelope<TEvent> {
  runId: string;
  event: TEvent;
}

/** Live caller-supplied options threaded through every API call. */
export interface RunOpts<TEvent> {
  onEvent(envelope: RunEventEnvelope<TEvent>): void;
}

/**
 * Internal registry entry. `extras` carries kind-specific fields the spec
 * needs to keep alongside the run (skillDir, tempWorkdir, sandbox refs, …).
 */
export interface RunEntry<TRun extends BaseRun, TEvent, TExtras> {
  run: TRun;
  child: ChildProcess | null;
  killed: boolean;
  eventLog: EventLog<TEvent>;
  extras: TExtras;
}

/** Helpers passed to the spec's `onTurnComplete` so it never re-implements transitions. */
export interface PostTurnHelpers<TRun extends BaseRun, TEvent, TExtras> {
  /** Transition `waiting_for_input` + persist + emit `status` + `waiting_for_input`. */
  wait(entry: RunEntry<TRun, TEvent, TExtras>): void;
  /** Mark `completed` + persist + emit `status`. The spec is responsible for any side effect (artefact copy, sync back). */
  complete(entry: RunEntry<TRun, TEvent, TExtras>): void;
  /** Mark `failed`, persist, emit `done` + cleanupOnTerminal. */
  fail(entry: RunEntry<TRun, TEvent, TExtras>, error: string): void;
}

/** Outcome of `spec.rehydrate(persisted, workdir)` at boot. */
export type RehydrateResult<TRun extends BaseRun, TExtras> =
  | { kind: 'rehydrate'; run: TRun; extras: TExtras }
  | { kind: 'cleanup'; reason?: string };

/**
 * Kind-specific contract a runner instance is built from. The factory wires
 * the registry, the lifecycle, the persistence and the event log; the spec
 * contributes only what's truly different across kinds (workdir prep,
 * prompt, post-turn policy, finish, cleanup).
 */
export interface RunnerSpec<TRun extends BaseRun, TStartReq, TEvent, TExtras> {
  /** Discriminator written to `~/.nakiros/runs/<kind>/`. */
  kind: string;

  /** Absolute root where each run persists its workdir. */
  runsRoot(): string;

  /**
   * Prepare the on-disk workdir for a fresh run. The factory has already
   * generated the `runId` and ensured `runsRoot()` exists; the spec does
   * the kind-specific seeding (symlink for audit, tmp copy for fix, sandbox
   * for eval).
   */
  prepareWorkdir(
    req: TStartReq,
    runId: string,
    opts: RunOpts<TEvent>,
  ): { workdir: string; extras: TExtras };

  /** First prompt sent to Claude (no `--resume`). */
  buildFirstPrompt(req: TStartReq, ctx: { workdir: string; runId: string; extras: TExtras }): string;

  /** Build the initial `TRun` from the request. The factory has the runId + workdir. */
  createInitialRun(req: TStartReq, runId: string, workdir: string, extras: TExtras): TRun;

  /**
   * Optional override of the `claude` CLI argv per turn. Default: a plain
   * `buildClaudeArgs({ prompt, resumeSessionId })`.
   */
  buildCliArgs?(
    prompt: string,
    entry: RunEntry<TRun, TEvent, TExtras>,
    isFirstTurn: boolean,
  ): BuildArgsOptions;

  /**
   * After a successful turn the spec decides where the run goes:
   * - audit checks for the artefact → `helpers.complete()` or `helpers.wait()`
   * - fix / create always → `helpers.wait()`
   * - eval grades → `helpers.complete()` or `helpers.fail()`
   */
  onTurnComplete(
    entry: RunEntry<TRun, TEvent, TExtras>,
    helpers: PostTurnHelpers<TRun, TEvent, TExtras>,
  ): void;

  /**
   * Cleanup at the very end of a run's lifecycle (user `stop` or `finish`).
   * Different per kind: audit uses `cleanupRunWorkdir`, fix/create destroys
   * the temp sandbox, eval destroys the eval sandbox. Called by the factory's
   * `stop()` and `finish()`; **not** called on a failed turn (that's
   * `onTurnFailed`'s job).
   */
  cleanupOnTerminal(entry: RunEntry<TRun, TEvent, TExtras>): void;

  /**
   * Optional. Called when a turn ends with a non-zero exit code or stream
   * error. Default: nothing extra (the `done` event has already been emitted).
   * Fix / create override to immediately destroy the temp workdir; audit
   * leaves it so the user can review the conversation before clicking
   * Terminer.
   */
  onTurnFailed?(entry: RunEntry<TRun, TEvent, TExtras>): void;

  /**
   * Optional explicit "finish" action triggered by the user (not the runner).
   * Audit copies the report; fix/create syncs the temp workdir back; eval
   * has no finish (omit the hook).
   */
  finish?(entry: RunEntry<TRun, TEvent, TExtras>, opts: RunOpts<TEvent>): void;

  /** Idempotence: when present, `start()` returns the existing entry instead of spawning. */
  findActiveForTarget?(
    req: TStartReq,
    registry: ReadonlyMap<string, RunEntry<TRun, TEvent, TExtras>>,
  ): RunEntry<TRun, TEvent, TExtras> | null;

  /** Gate for `sendUserMessage`. Default: `status === 'waiting_for_input'`. */
  canSendUserMessage?(entry: RunEntry<TRun, TEvent, TExtras>): boolean;

  /**
   * Boot rehydration policy. Receives the persisted JSON blob (whatever the
   * spec wrote via the run object plus any extras stashed in `_*` fields)
   * and returns either a rehydrated `{ run, extras }` pair or a request to
   * cleanup the workdir.
   */
  rehydrate?(persisted: unknown, workdir: string): RehydrateResult<TRun, TExtras>;

  /**
   * Hook to broadcast a custom event to subscribers without going through
   * the EventLog (e.g. on rebind to surface the live status). Optional.
   */
  emitOnRebind?(entry: RunEntry<TRun, TEvent, TExtras>, opts: RunOpts<TEvent>): void;
}

/** Public surface of a runner instance. */
export interface RunnerInstance<TRun extends BaseRun, TStartReq, TEvent, TExtras> {
  start(req: TStartReq, opts: RunOpts<TEvent>): TRun;
  sendUserMessage(runId: string, message: string, opts: RunOpts<TEvent>): Promise<void>;
  stop(runId: string): void;
  finish(runId: string, opts: RunOpts<TEvent>): void;
  getRun(runId: string): TRun | null;
  listActive(): TRun[];
  listAll(): TRun[];
  getBufferedEvents(runId: string): TEvent[];
  /** Read-only view of the registry. Used by `findActiveForTarget` callers. */
  registry(): ReadonlyMap<string, RunEntry<TRun, TEvent, TExtras>>;
  /** Scan `runsRoot()` and rehydrate / cleanup persisted runs. Idempotent. */
  restoreOrCleanup(broadcast: (event: RunEventEnvelope<TEvent>) => void): void;
}

/**
 * Build a runner instance from a kind-specific spec. The factory owns the
 * registry, lifecycle transitions, EventLog wiring, persistence and boot
 * rehydration; the spec contributes only the kind-specific bits.
 */
export function createRunner<TRun extends BaseRun, TStartReq, TEvent, TExtras>(
  spec: RunnerSpec<TRun, TStartReq, TEvent, TExtras>,
): RunnerInstance<TRun, TStartReq, TEvent, TExtras> {
  const registry = new Map<string, RunEntry<TRun, TEvent, TExtras>>();

  function makeEventLog(workdir: string, runId: string, opts: RunOpts<TEvent>): EventLog<TEvent> {
    return new EventLog<TEvent>({
      workdir,
      broadcast: (event) => opts.onEvent({ runId, event }),
    });
  }

  /**
   * Re-point an entry's event log broadcast to the current caller while
   * preserving the in-memory replay buffer.
   */
  function rebindEventLog(entry: RunEntry<TRun, TEvent, TExtras>, opts: RunOpts<TEvent>): void {
    const buffered = entry.eventLog.getBuffered();
    entry.eventLog = makeEventLog(entry.run.workdir, entry.run.runId, opts);
    for (const ev of buffered) {
      (entry.eventLog as unknown as { buffer: TEvent[] }).buffer.push(ev);
    }
    spec.emitOnRebind?.(entry, opts);
  }

  function persist(entry: RunEntry<TRun, TEvent, TExtras>): void {
    persistRunJson(entry.run.workdir, { ...entry.run, _extras: entry.extras });
  }

  /**
   * Run one claude turn. Updates status `starting → running`, dispatches
   * stream events into the EventLog, pushes a fresh user/assistant turn
   * pair onto `run.turns`, and either marks the run failed (non-zero exit)
   * or returns control to the caller for `onTurnComplete`.
   */
  async function executeTurn(
    entry: RunEntry<TRun, TEvent, TExtras>,
    userMessage: string,
    isFirstTurn: boolean,
  ): Promise<void> {
    if (entry.killed) return;
    const { run } = entry;

    entry.eventLog.resetForNewTurn();
    run.status = 'starting';
    persist(entry);
    entry.eventLog.emit({ type: 'status', status: 'starting' } as unknown as TEvent);

    const cliArgs = spec.buildCliArgs
      ? buildClaudeArgs(spec.buildCliArgs(userMessage, entry, isFirstTurn))
      : buildClaudeArgs({
          prompt: userMessage,
          resumeSessionId: isFirstTurn ? undefined : (run.sessionId ?? undefined),
        });

    const started = Date.now();
    run.turns.push({ role: 'user', content: userMessage, timestamp: new Date().toISOString() });

    let assistantText = '';
    const tools: { name: string; display: string }[] = [];
    const blocks: BaseTurn['blocks'] = [];

    run.status = 'running';
    persist(entry);
    entry.eventLog.emit({ type: 'status', status: 'running' } as unknown as TEvent);

    const result = await spawnClaudeTurn({
      workdir: run.workdir,
      cliArgs,
      onChildSpawned: (c) => {
        entry.child = c;
      },
      isKilled: () => entry.killed,
      onSession: (id) => {
        run.sessionId = id;
      },
      onText: (text) => {
        assistantText += text;
        blocks!.push({ type: 'text', text });
        entry.eventLog.emit({ type: 'text', text } as unknown as TEvent);
      },
      onTool: (name, display) => {
        tools.push({ name, display });
        blocks!.push({ type: 'tool', name, display });
        entry.eventLog.emit({ type: 'tool', name, display } as unknown as TEvent);
      },
      onUsage: (totalTokens) => {
        run.tokensUsed += totalTokens;
        entry.eventLog.emit({ type: 'tokens', tokensUsed: run.tokensUsed } as unknown as TEvent);
      },
    });

    run.durationMs += Date.now() - started;
    run.turns.push({
      role: 'assistant',
      content: assistantText,
      timestamp: new Date().toISOString(),
      tools,
      blocks,
    });
    entry.child = null;

    if (result.exitCode !== 0 || result.error) {
      run.status = 'failed';
      run.error = result.error;
      run.finishedAt = new Date().toISOString();
      persist(entry);
      entry.eventLog.emit({
        type: 'done',
        exitCode: result.exitCode,
        error: result.error ?? undefined,
      } as unknown as TEvent);
      spec.onTurnFailed?.(entry);
    }
  }

  // ── PostTurnHelpers implementations ──
  const helpers: PostTurnHelpers<TRun, TEvent, TExtras> = {
    wait(entry) {
      const { run } = entry;
      if (run.status === 'failed' || run.status === 'stopped') return;
      run.status = 'waiting_for_input';
      persist(entry);
      const lastAssistantText = (run.turns[run.turns.length - 1]?.content ?? '') as string;
      entry.eventLog.emit({ type: 'status', status: 'waiting_for_input' } as unknown as TEvent);
      entry.eventLog.emit({ type: 'waiting_for_input', lastAssistantText } as unknown as TEvent);
    },
    complete(entry) {
      const { run } = entry;
      run.status = 'completed';
      run.finishedAt = new Date().toISOString();
      persist(entry);
      entry.eventLog.emit({ type: 'status', status: 'completed' } as unknown as TEvent);
    },
    fail(entry, error) {
      const { run } = entry;
      run.status = 'failed';
      run.error = error;
      run.finishedAt = new Date().toISOString();
      persist(entry);
      entry.eventLog.emit({ type: 'done', exitCode: 1, error } as unknown as TEvent);
      spec.onTurnFailed?.(entry);
    },
  };

  // ── Public methods ──
  function start(req: TStartReq, opts: RunOpts<TEvent>): TRun {
    if (spec.findActiveForTarget) {
      const existing = spec.findActiveForTarget(req, registry);
      if (existing) {
        rebindEventLog(existing, opts);
        return existing.run;
      }
    }

    const runId = generateRunId(spec.kind);
    mkdirSync(spec.runsRoot(), { recursive: true });
    const { workdir, extras } = spec.prepareWorkdir(req, runId, opts);
    const run = spec.createInitialRun(req, runId, workdir, extras);
    const entry: RunEntry<TRun, TEvent, TExtras> = {
      run,
      child: null,
      killed: false,
      eventLog: makeEventLog(workdir, runId, opts),
      extras,
    };
    registry.set(runId, entry);
    persist(entry);

    const firstPrompt = spec.buildFirstPrompt(req, { workdir, runId, extras });
    void executeTurn(entry, firstPrompt, true).then(() => {
      if (entry.run.status !== 'failed' && entry.run.status !== 'stopped') {
        spec.onTurnComplete(entry, helpers);
      }
    });

    return run;
  }

  async function sendUserMessage(runId: string, message: string, opts: RunOpts<TEvent>): Promise<void> {
    const entry = registry.get(runId);
    if (!entry) throw new Error(`${spec.kind} run not found: ${runId}`);
    const allowed = spec.canSendUserMessage
      ? spec.canSendUserMessage(entry)
      : entry.run.status === 'waiting_for_input';
    if (!allowed) {
      throw new Error(`${spec.kind} run ${runId} cannot accept input (status=${entry.run.status})`);
    }
    rebindEventLog(entry, opts);
    await executeTurn(entry, message, false);
    if (entry.run.status !== 'failed' && entry.run.status !== 'stopped') {
      spec.onTurnComplete(entry, helpers);
    }
  }

  function stop(runId: string): void {
    const entry = registry.get(runId);
    if (!entry) return;
    entry.killed = true;
    entry.child?.kill('SIGTERM');
    if (entry.run.status !== 'completed' && entry.run.status !== 'failed') {
      entry.run.status = 'stopped';
      entry.run.finishedAt = new Date().toISOString();
    }
    persist(entry);
    // Broadcast BEFORE destroying so the frontend gets immediate feedback
    // (no need to wait for the next poll cycle).
    entry.eventLog.emit({ type: 'status', status: 'stopped' } as unknown as TEvent);
    entry.eventLog.emit({ type: 'done', exitCode: 130 } as unknown as TEvent);
    entry.eventLog.destroy();
    spec.cleanupOnTerminal(entry);
  }

  /**
   * User-confirmed completion. Calls the kind-specific `spec.finish` (e.g.
   * fix/create syncback), then tears down the workdir via `cleanupOnTerminal`
   * and removes the entry from the registry.
   *
   * No-op when the run is unknown. Spec.finish is optional — kinds that
   * have nothing extra to do (audit's artefact is already archived during
   * onTurnComplete) can still call this to dispose the workdir + entry.
   */
  function finish(runId: string, opts: RunOpts<TEvent>): void {
    const entry = registry.get(runId);
    if (!entry) return;
    rebindEventLog(entry, opts);
    spec.finish?.(entry, opts);
    spec.cleanupOnTerminal(entry);
    registry.delete(runId);
  }

  function getRun(runId: string): TRun | null {
    return registry.get(runId)?.run ?? null;
  }

  function listActive(): TRun[] {
    const out: TRun[] = [];
    for (const entry of registry.values()) {
      if (isActiveRunStatus(entry.run.status)) out.push(entry.run);
    }
    return out;
  }

  function listAll(): TRun[] {
    return Array.from(registry.values()).map((entry) => entry.run);
  }

  function getBufferedEvents(runId: string): TEvent[] {
    return registry.get(runId)?.eventLog.getBuffered() ?? [];
  }

  function restoreOrCleanup(broadcast: (event: RunEventEnvelope<TEvent>) => void): void {
    const root = spec.runsRoot();
    if (!existsSync(root)) return;
    const entries = readdirSync(root, { withFileTypes: true });

    for (const dirent of entries) {
      if (!dirent.isDirectory()) continue;
      const workdir = join(root, dirent.name);
      try {
        const stats = statSync(workdir);
        if (!stats.isDirectory()) continue;
      } catch {
        continue;
      }

      const persisted = loadRunJson<unknown>(workdir);
      if (!persisted) continue;

      if (!spec.rehydrate) continue;
      const result = spec.rehydrate(persisted, workdir);
      if (result.kind === 'cleanup') {
        spec.cleanupOnTerminal({
          run: { workdir } as TRun,
          child: null,
          killed: false,
          eventLog: new EventLog<TEvent>({ workdir, broadcast: () => undefined }),
          extras: {} as TExtras,
        });
        continue;
      }

      const opts: RunOpts<TEvent> = {
        onEvent: (event) => broadcast(event),
      };
      const eventLog = makeEventLog(workdir, result.run.runId, opts);
      eventLog.restore();
      registry.set(result.run.runId, {
        run: result.run,
        child: null,
        killed: false,
        eventLog,
        extras: result.extras,
      });
      persistRunJson(workdir, { ...result.run, _extras: result.extras });
    }
  }

  return {
    start,
    sendUserMessage,
    stop,
    finish,
    getRun,
    listActive,
    listAll,
    getBufferedEvents,
    registry: () => registry,
    restoreOrCleanup,
  };
}
