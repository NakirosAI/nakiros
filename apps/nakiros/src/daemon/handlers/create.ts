import type { AuditRunEvent, StartAuditRequest } from '@nakiros/shared';

import {
  startCreate,
  stopCreate,
  getCreateRun,
  sendCreateUserMessage,
  finishCreate,
  listActiveCreateRuns,
  listAllCreateRuns,
  getCreateBufferedEvents,
  listFixDiff,
  readFixDiffFile,
} from '../../services/fix-runner.js';
import { resolveSkillDir } from './skill-dir.js';
import {
  createEventBroadcaster,
  createTypedHandler,
  getRunOrThrow,
  resolveSkillDirForRun,
} from './run-helpers.js';
import type { HandlerRegistry } from './index.js';

const broadcastCreateEvent = createEventBroadcaster<AuditRunEvent>('create:event');

/**
 * Registers the `create:*` IPC channels — thin mirror of `fix:*` with different
 * temp-workdir seeding (new skill from scratch) and sync-back policy.
 *
 * Channels:
 * - Lifecycle: `create:start`, `create:stopRun`, `create:getRun`, `create:finish`
 * - Stream: `create:sendUserMessage`, `create:listActive`, `create:getBufferedEvents`
 * - Diff preview: `create:listDiff`, `create:readDiffFile`
 *
 * Broadcasts `create:event` via `eventBus.broadcast`.
 */
export const createHandlers: HandlerRegistry = {
  'create:start': createTypedHandler((request: StartAuditRequest) => {
    const skillDir = resolveSkillDir(request);
    return startCreate(request, { skillDir, onEvent: broadcastCreateEvent });
  }),

  'create:stopRun': createTypedHandler(stopCreate),

  'create:getRun': createTypedHandler(getCreateRun),

  'create:sendUserMessage': createTypedHandler(async (runId: string, message: string) => {
    const run = getRunOrThrow(getCreateRun, runId, 'Create');
    const skillDir = resolveSkillDirForRun(run);
    await sendCreateUserMessage(runId, message, {
      skillDir,
      onEvent: broadcastCreateEvent,
    });
  }),

  'create:finish': createTypedHandler((runId: string) => {
    const run = getRunOrThrow(getCreateRun, runId, 'Create');
    const skillDir = resolveSkillDirForRun(run);
    finishCreate(runId, { skillDir, onEvent: broadcastCreateEvent });
  }),

  'create:listActive': createTypedHandler(listActiveCreateRuns),

  'create:listAll': createTypedHandler(listAllCreateRuns),

  'create:getBufferedEvents': createTypedHandler(getCreateBufferedEvents),

  'create:listDiff': createTypedHandler(listFixDiff),
  'create:readDiffFile': createTypedHandler(readFixDiffFile),
};
