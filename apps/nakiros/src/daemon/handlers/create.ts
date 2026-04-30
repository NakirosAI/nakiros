import type {
  AuditRunEvent,
  EvalRunEvent,
  StartAuditRequest,
  StartEvalRunResponse,
} from '@nakiros/shared';

import {
  startCreate,
  stopCreate,
  getCreateRun,
  sendCreateUserMessage,
  finishCreate,
  listActiveCreateRuns,
  listAllCreateRuns,
  getCreateBufferedEvents,
  getCreateTempWorkdir,
  listFixDiff,
  readFixDiffFile,
  getFixTimeline,
  getFixUsage,
} from '../../services/fix-runner.js';
import { startEvalRuns } from '../../services/eval-runner.js';
import { resolveSkillDir } from './skill-dir.js';
import {
  createEventBroadcaster,
  createTypedHandler,
  getRunOrThrow,
  resolveSkillDirForRun,
  withBroadcastOnError,
} from './run-helpers.js';
import type { HandlerRegistry } from './index.js';

const broadcastEvalEvent = createEventBroadcaster<EvalRunEvent>('eval:event');

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

  'create:stopRun': createTypedHandler(
    withBroadcastOnError('create:event', stopCreate, (runId: string) => runId),
  ),

  'create:getRun': createTypedHandler(getCreateRun),

  'create:sendUserMessage': createTypedHandler(
    withBroadcastOnError(
      'create:event',
      async (runId: string, message: string) => {
        const run = getRunOrThrow(getCreateRun, runId, 'Create');
        const skillDir = resolveSkillDirForRun(run);
        await sendCreateUserMessage(runId, message, {
          skillDir,
          onEvent: broadcastCreateEvent,
        });
      },
      (runId) => runId,
    ),
  ),

  'create:finish': createTypedHandler(
    withBroadcastOnError(
      'create:event',
      (runId: string) => {
        const run = getRunOrThrow(getCreateRun, runId, 'Create');
        const skillDir = resolveSkillDirForRun(run);
        finishCreate(runId, { skillDir, onEvent: broadcastCreateEvent });
      },
      (runId) => runId,
    ),
  ),

  'create:listActive': createTypedHandler(listActiveCreateRuns),

  'create:listAll': createTypedHandler(listAllCreateRuns),

  'create:getBufferedEvents': createTypedHandler(getCreateBufferedEvents),

  'create:listDiff': createTypedHandler(listFixDiff),
  'create:readDiffFile': createTypedHandler(readFixDiffFile),
  'create:getTimeline': createTypedHandler(getFixTimeline),
  'create:getUsage': createTypedHandler(getFixUsage),

  /**
   * Run the draft's eval suite (`<tmp>/evals/evals.json`) against the
   * sandbox itself. We override `resolveSkillDir` to always return the
   * tmp workdir so both the execution context AND the persisted
   * `iteration-N/` workspace land in the draft folder. The real skill
   * folder (`.claude/skills/<name>/`) does NOT exist yet — touching it
   * here would expose a half-baked skill to Claude as a command.
   * Iterations travel with the sandbox: discarded on Stop, copied to
   * `.claude/skills/<name>/evals/workspace/` on Apply & deploy.
   */
  'create:runEvals': createTypedHandler(
    withBroadcastOnError(
      'eval:event',
      async (request: { runId: string; evalNames?: string[] }): Promise<StartEvalRunResponse> => {
        const run = getRunOrThrow(getCreateRun, request.runId, 'Create');
        const tempDir = getCreateTempWorkdir(request.runId);
        if (!tempDir) {
          throw new Error(`No temp workdir for create run ${request.runId}`);
        }
        return startEvalRuns(
          {
            scope: run.scope,
            projectId: run.projectId,
            pluginName: run.pluginName,
            marketplaceName: run.marketplaceName,
            skillName: run.skillName,
            evalNames: request.evalNames,
            skillDirOverride: tempDir,
            createRunId: request.runId,
          },
          {
            resolveSkillDir: () => tempDir,
            onEvent: broadcastEvalEvent,
          },
        );
      },
      (request) => request.runId,
    ),
  ),
};
