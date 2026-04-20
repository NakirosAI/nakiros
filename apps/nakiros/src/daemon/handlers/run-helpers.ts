import { IPC_CHANNELS, type IpcChannel, type StartEvalRunRequest } from '@nakiros/shared';

import { eventBus } from '../event-bus.js';
import { resolveEvalSkillDir } from './skill-dir.js';

export function createEventBroadcaster<T>(channel: IpcChannel): (event: T) => void {
  return (event: T): void => {
    eventBus.broadcast(IPC_CHANNELS[channel], event);
  };
}

export function getRunOrThrow<T>(
  getter: (runId: string) => T | null | undefined,
  runId: string,
  label: string,
): T {
  const run = getter(runId);
  if (!run) throw new Error(`${label} run not found: ${runId}`);
  return run;
}

export interface SkillRunIdentity {
  scope: StartEvalRunRequest['scope'];
  projectId?: string;
  skillName: string;
  pluginName?: string;
  marketplaceName?: string;
}

export function resolveSkillDirForRun(run: SkillRunIdentity): string {
  return resolveEvalSkillDir({
    scope: run.scope,
    projectId: run.projectId,
    skillName: run.skillName,
    pluginName: run.pluginName,
    marketplaceName: run.marketplaceName,
  } as StartEvalRunRequest);
}
