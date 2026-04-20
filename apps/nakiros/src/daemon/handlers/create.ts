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
  listFixDiff,
  readFixDiffFile,
} from '../../services/fix-runner.js';
import { resolveEvalSkillDir } from './skill-dir.js';
import { createEventBroadcaster, getRunOrThrow, resolveSkillDirForRun } from './run-helpers.js';
import type { HandlerRegistry } from './index.js';

const broadcastCreateEvent = createEventBroadcaster<AuditRunEvent>('create:event');

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
    const run = getRunOrThrow(getCreateRun, runId, 'Create');
    const skillDir = resolveSkillDirForRun(run);
    await sendCreateUserMessage(runId, message, {
      skillDir,
      onEvent: broadcastCreateEvent,
    });
  },

  'create:finish': (args) => {
    const runId = args[0] as string;
    const run = getRunOrThrow(getCreateRun, runId, 'Create');
    const skillDir = resolveSkillDirForRun(run);
    finishCreate(runId, { skillDir, onEvent: broadcastCreateEvent });
  },

  'create:listActive': () => listActiveCreateRuns(),

  'create:getBufferedEvents': (args) => getCreateBufferedEvents(args[0] as string),

  'create:listDiff': (args) => listFixDiff(args[0] as string),
  'create:readDiffFile': (args) => readFixDiffFile(args[0] as string, args[1] as string),
};
