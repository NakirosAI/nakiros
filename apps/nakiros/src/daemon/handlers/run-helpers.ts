import { IPC_CHANNELS, type IpcChannel, type StartEvalRunRequest } from '@nakiros/shared';

import { eventBus } from '../event-bus.js';
import { resolveSkillDir } from './skill-dir.js';

/**
 * Build a typed broadcaster that pushes events onto `eventBus` under the
 * canonical channel name from `IPC_CHANNELS`. Returned function is passed as
 * the `onEvent` callback to runners so they never reference channel strings.
 */
export function createEventBroadcaster<T>(channel: IpcChannel): (event: T) => void {
  return (event: T): void => {
    eventBus.broadcast(IPC_CHANNELS[channel], event);
  };
}

/**
 * Fetch a run by id via `getter`, throwing a contextual error if it's not found.
 * Wraps the common "look up by runId or 404" pattern used by every handler
 * that mutates an in-flight run.
 *
 * @param getter - run lookup function (eval / audit / fix / create)
 * @param runId - run id received from the IPC call
 * @param label - human-readable run kind used in the error message
 * @throws {Error} when `getter(runId)` returns null or undefined
 */
export function getRunOrThrow<T>(
  getter: (runId: string) => T | null | undefined,
  runId: string,
  label: string,
): T {
  const run = getter(runId);
  if (!run) throw new Error(`${label} run not found: ${runId}`);
  return run;
}

/** Minimal identity fields shared by every run kind — enough to resolve the skill directory. */
export interface SkillRunIdentity {
  scope: StartEvalRunRequest['scope'];
  projectId?: string;
  skillName: string;
  pluginName?: string;
  marketplaceName?: string;
}

/**
 * Resolve the on-disk skill directory for a run, delegating to
 * {@link resolveSkillDir}. Used by audit/fix/create handlers to turn a
 * `SkillRunIdentity` back into the original skill path.
 */
export function resolveSkillDirForRun(run: SkillRunIdentity): string {
  return resolveSkillDir({
    scope: run.scope,
    projectId: run.projectId,
    skillName: run.skillName,
    pluginName: run.pluginName,
    marketplaceName: run.marketplaceName,
  });
}

/**
 * Adapter that lifts a typed `(...args: TArgs) => TResult` function into the
 * raw `IpcHandler` shape (`(args: unknown[]) => unknown`) the registry
 * expects. Replaces the boilerplate `args[0] as T`, `args[1] as U`… casts that
 * used to live in every handler.
 *
 * The cast `unknown[] → TArgs` is unsafe by construction (the IPC layer
 * cannot prove the caller passed the right shape), but it's localised here
 * and the handler body sees properly typed parameters. Callers that need
 * runtime validation should keep doing it explicitly inside the handler
 * body.
 *
 * @example
 * 'audit:stopRun': createTypedHandler(stopAudit),
 * 'audit:sendUserMessage': createTypedHandler(async (runId: string, message: string) => {
 *   ...
 * }),
 */
export function createTypedHandler<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => TResult | Promise<TResult>,
): (rawArgs: unknown[]) => TResult | Promise<TResult> {
  return (rawArgs) => fn(...(rawArgs as TArgs));
}

/**
 * Wrap a handler so any synchronous or async throw broadcasts a
 * `{ runId, event: { type: 'error', error } }` payload on the given channel
 * **before** the exception propagates back to the HTTP layer (re-thrown,
 * so the IPC response is still in error and the caller's promise rejects).
 *
 * Use only on handlers that mutate a known run AND whose frontend caller
 * is subscribed to the channel — otherwise the frontend has no signal when
 * the handler throws before the runner can emit anything (e.g.
 * `fix:runEvalsInTemp` failing on a missing `evals.json`). For `*:start`
 * handlers (no runId yet) the HTTP error is sufficient — don't wrap them.
 *
 * The error event is broadcast-only: it does NOT go through `EventLog`
 * and is therefore not persisted to `events.jsonl` (the buffer is for
 * turn replay, not handler failures).
 *
 * @param channel - canonical event channel, e.g. `'audit:event'`
 * @param fn - the handler to wrap (its signature drives `TArgs` inference)
 * @param getRunId - extracts the affected run id from the handler args
 *
 * @example
 * 'fix:runEvalsInTemp': createTypedHandler(
 *   withBroadcastOnError(
 *     'eval:event',
 *     async (req: RunEvalsInTempRequest) => { ... },
 *     (req) => req.runId,
 *   ),
 * ),
 */
export function withBroadcastOnError<TArgs extends unknown[], TResult>(
  channel: IpcChannel,
  fn: (...args: TArgs) => TResult | Promise<TResult>,
  getRunId: (...args: TArgs) => string,
): (...args: TArgs) => Promise<TResult> {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      let runId = '';
      try {
        runId = getRunId(...args);
      } catch {
        // best-effort — broadcast with empty runId if extraction fails
      }
      eventBus.broadcast(IPC_CHANNELS[channel], {
        runId,
        event: { type: 'error', error: message },
      });
      throw err;
    }
  };
}
