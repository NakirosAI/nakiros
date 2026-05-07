import type {
  AuditRunEvent,
  EvalRunEvent,
  FixUsage,
  StartAuditRequest,
} from '@nakiros/shared';

import {
  startEdit,
  stopEdit,
  getEditRun,
  sendEditUserMessage,
  finishEdit,
  getEditTempWorkdir,
  getEditUsage,
  listActiveEditRuns,
  listAllEditRuns,
  getEditBufferedEvents,
  listEditDiff,
  readEditDiffFile,
  getEditTimeline,
  registerEditEvalBatch,
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

const broadcastEditEvent = createEventBroadcaster<AuditRunEvent>('edit:event');
const broadcastEvalEvent = createEventBroadcaster<EvalRunEvent>('eval:event');

interface RunEvalsInEditRequest {
  runId: string;
  evalNames?: string[];
  includeBaseline?: boolean;
}

/**
 * Registers the `edit:*` IPC channels — user-driven interactive editing of an
 * existing entity (skill or `.claude/` config). Identical machinery to `fix:*`
 * but the first prompt invites the user to describe what to change rather than
 * driving from audit findings.
 *
 * Channels:
 * - Lifecycle: `edit:start`, `edit:stopRun`, `edit:getRun`, `edit:finish`
 * - Stream: `edit:sendUserMessage`, `edit:listActive`, `edit:getBufferedEvents`
 * - Evals in temp: `edit:runEvals` (runs the eval suite against the in-progress
 *   copy for skills), `edit:getBenchmarks`
 * - Diff preview: `edit:listDiff`, `edit:readDiffFile`
 * - Timeline: `edit:getTimeline`
 * - Usage: `edit:getUsage`
 *
 * Broadcasts `edit:event` (edit lifecycle) and `eval:event` (evals launched
 * from the edit temp workdir).
 */
export const editHandlers: HandlerRegistry = {
  'edit:start': createTypedHandler((request: StartAuditRequest) => {
    const skillDir = resolveSkillDir(request);
    return startEdit(request, { skillDir, onEvent: broadcastEditEvent });
  }),

  'edit:stopRun': createTypedHandler(
    withBroadcastOnError('edit:event', stopEdit, (runId: string) => runId),
  ),

  'edit:getRun': createTypedHandler(getEditRun),

  'edit:sendUserMessage': createTypedHandler(
    withBroadcastOnError(
      'edit:event',
      async (runId: string, message: string) => {
        const run = getRunOrThrow(getEditRun, runId, 'Edit');
        const skillDir = resolveSkillDirForRun(run);
        await sendEditUserMessage(runId, message, { skillDir, onEvent: broadcastEditEvent });
      },
      (runId) => runId,
    ),
  ),

  'edit:finish': createTypedHandler(
    withBroadcastOnError(
      'edit:event',
      (runId: string) => {
        const run = getRunOrThrow(getEditRun, runId, 'Edit');
        const skillDir = resolveSkillDirForRun(run);
        finishEdit(runId, { skillDir, onEvent: broadcastEditEvent });
      },
      (runId) => runId,
    ),
  ),

  /**
   * Kick off a full eval batch against the edit run's temp workdir
   * (in-progress copy). Only meaningful for skill edit runs — for .claude/
   * entity edit runs the skill's eval suite is not applicable and this
   * handler is a no-op (no skill evals defined).
   *
   * Errors broadcast on `eval:event` (not `edit:event`) — the runs that
   * would have streamed there if start had succeeded; the EvalRunsView
   * opened from the edit overlay listens to `eval:event`.
   */
  'edit:runEvals': createTypedHandler(
    withBroadcastOnError(
      'eval:event',
      async (request: RunEvalsInEditRequest) => {
        console.log(
          `[edit:runEvals] start editRunId=${request.runId} evalNames=${
            request.evalNames?.join(',') ?? 'all'
          } includeBaseline=${request.includeBaseline ?? false}`,
        );
        const run = getRunOrThrow(getEditRun, request.runId, 'Edit');
        const tempDir = getEditTempWorkdir(request.runId);
        if (!tempDir) throw new Error(`No temp workdir for edit run ${request.runId}`);
        const response = await startEvalRuns(
          {
            scope: run.scope,
            projectId: run.projectId,
            skillName: run.skillName,
            evalNames: request.evalNames,
            includeBaseline: request.includeBaseline,
            skillDirOverride: tempDir,
            // Tag the resulting iteration as `fix-temp` so the matrix
            // surfaces it in the unified history and the edit lifecycle
            // (finish/reject) can later promote/cleanup the batch.
            fixRunId: request.runId,
          },
          {
            resolveSkillDir,
            onEvent: broadcastEvalEvent,
          },
        );
        console.log(
          `[edit:runEvals] startEvalRuns ok editRunId=${request.runId} iteration=${response.iteration} runIdCount=${response.runIds.length}`,
        );
        // Watch the batch so when every SkillEvalRun finishes we read the
        // benchmark and broadcast `fix_eval_result` on `edit:event` — the
        // frontend's edit timeline turns each one into an inline card.
        registerEditEvalBatch({
          fixRunId: request.runId,
          iteration: response.iteration,
          evalRunIds: response.runIds,
        });
        return response;
      },
      (request) => request.runId,
    ),
  ),

  'edit:listActive': createTypedHandler(listActiveEditRuns),

  'edit:listAll': createTypedHandler(listAllEditRuns),

  'edit:getBufferedEvents': createTypedHandler(getEditBufferedEvents),

  'edit:listDiff': createTypedHandler(listEditDiff),
  'edit:readDiffFile': createTypedHandler(readEditDiffFile),
  'edit:getTimeline': createTypedHandler(getEditTimeline),

  /**
   * Compute the billed-equivalent token total + agent-active elapsed for
   * an edit run by parsing its Claude Code session JSONL. Bypasses the
   * runner's own (broken) tally so the edit screen header surfaces a
   * trustworthy cost signal. See `docs/decisions/token-accounting.md`.
   */
  'edit:getUsage': createTypedHandler(
    (runId: string): FixUsage => getEditUsage(runId),
  ),
};
