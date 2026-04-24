import { IPC_CHANNELS, type IpcChannel, type StartEvalRunRequest } from '@nakiros/shared';

import { eventBus } from '../event-bus.js';
import { resolveEvalSkillDir } from './skill-dir.js';

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
 * {@link resolveEvalSkillDir}. Used by audit/fix/create handlers to turn a
 * `SkillRunIdentity` back into the original skill path.
 */
export function resolveSkillDirForRun(run: SkillRunIdentity): string {
  return resolveEvalSkillDir({
    scope: run.scope,
    projectId: run.projectId,
    skillName: run.skillName,
    pluginName: run.pluginName,
    marketplaceName: run.marketplaceName,
  } as StartEvalRunRequest);
}
