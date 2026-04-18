import type {
  AuditRunEvent,
  StartAuditRequest,
  StartEvalRunRequest,
} from '@nakiros/shared';

import {
  startCreate,
  stopCreate,
  getCreateRun,
  sendCreateUserMessage,
  finishCreate,
  listActiveCreateRuns,
  getCreateBufferedEvents,
} from '../../services/fix-runner.js';
import { eventBus } from '../event-bus.js';
import { resolveEvalSkillDir } from './skill-dir.js';
import type { HandlerRegistry } from './index.js';

function broadcastCreateEvent(event: AuditRunEvent): void {
  eventBus.broadcast('create:event', event);
}

export const createHandlers: HandlerRegistry = {
  'create:start': (args) => {
    const request = args[0] as StartAuditRequest;
    const skillDir = resolveEvalSkillDir(request as unknown as StartEvalRunRequest);
    return startCreate(request, { skillDir, onEvent: broadcastCreateEvent });
  },

  'create:stopRun': (args) => {
    stopCreate(args[0] as string);
  },

  'create:getRun': (args) => getCreateRun(args[0] as string),

  'create:sendUserMessage': async (args) => {
    const runId = args[0] as string;
    const message = args[1] as string;
    const run = getCreateRun(runId);
    if (!run) throw new Error(`Create run not found: ${runId}`);
    const skillDir = resolveEvalSkillDir({
      scope: run.scope,
      projectId: run.projectId,
      skillName: run.skillName,
    } as StartEvalRunRequest);
    await sendCreateUserMessage(runId, message, {
      skillDir,
      onEvent: broadcastCreateEvent,
    });
  },

  'create:finish': (args) => {
    const runId = args[0] as string;
    const run = getCreateRun(runId);
    if (!run) throw new Error(`Create run not found: ${runId}`);
    const skillDir = resolveEvalSkillDir({
      scope: run.scope,
      projectId: run.projectId,
      skillName: run.skillName,
    } as StartEvalRunRequest);
    finishCreate(runId, { skillDir, onEvent: broadcastCreateEvent });
  },

  'create:listActive': () => listActiveCreateRuns(),

  'create:getBufferedEvents': (args) => getCreateBufferedEvents(args[0] as string),
};
