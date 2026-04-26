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
