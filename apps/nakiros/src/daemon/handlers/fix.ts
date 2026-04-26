import type {
  AuditRunEvent,
  EvalRunEvent,
  FixBenchmarks,
  StartAuditRequest,
} from '@nakiros/shared';

import {
  startFix,
  stopFix,
  getFixRun,
  sendFixUserMessage,
  finishFix,
  getFixTempWorkdir,
  getFixRealSkillDir,
  listActiveFixRuns,
  listAllFixRuns,
  getFixBufferedEvents,
  listFixDiff,
  readFixDiffFile,
} from '../../services/fix-runner.js';
import { startEvalRuns } from '../../services/eval-runner.js';
import { readLatestIterationBenchmark } from '../../services/eval-benchmark.js';
import { resolveSkillDir } from './skill-dir.js';
import {
  createEventBroadcaster,
  createTypedHandler,
  getRunOrThrow,
  resolveSkillDirForRun,
  withBroadcastOnError,
} from './run-helpers.js';
import type { HandlerRegistry } from './index.js';

const broadcastFixEvent = createEventBroadcaster<AuditRunEvent>('fix:event');
const broadcastEvalEvent = createEventBroadcaster<EvalRunEvent>('eval:event');

interface RunEvalsInTempRequest {
  runId: string;
  evalNames?: string[];
  includeBaseline?: boolean;
}

/**
 * Registers the `fix:*` IPC channels — skill iteration flow that edits a temp
 * copy of the skill under `~/.nakiros/tmp-skills/` and lets the user sync to
 * the real skill only after review. The tmp_skill pattern is load-bearing.
 *
 * Channels:
 * - Lifecycle: `fix:start`, `fix:stopRun`, `fix:getRun`, `fix:finish`
 * - Stream: `fix:sendUserMessage`, `fix:listActive`, `fix:getBufferedEvents`
 * - Evals in temp: `fix:runEvalsInTemp` (runs the eval suite against the in-progress copy), `fix:getBenchmarks`
 * - Diff preview: `fix:listDiff`, `fix:readDiffFile`
 *
 * Broadcasts `fix:event` (fix lifecycle) and `eval:event` (evals launched from the fix temp workdir).
 */
export const fixHandlers: HandlerRegistry = {
  'fix:start': createTypedHandler((request: StartAuditRequest) => {
    const skillDir = resolveSkillDir(request);
    return startFix(request, { skillDir, onEvent: broadcastFixEvent });
  }),

  'fix:stopRun': createTypedHandler(
    withBroadcastOnError('fix:event', stopFix, (runId: string) => runId),
  ),

  'fix:getRun': createTypedHandler(getFixRun),

  'fix:sendUserMessage': createTypedHandler(
    withBroadcastOnError(
      'fix:event',
      async (runId: string, message: string) => {
        const run = getRunOrThrow(getFixRun, runId, 'Fix');
        const skillDir = resolveSkillDirForRun(run);
        await sendFixUserMessage(runId, message, { skillDir, onEvent: broadcastFixEvent });
      },
      (runId) => runId,
    ),
  ),

  'fix:finish': createTypedHandler(
    withBroadcastOnError(
      'fix:event',
      (runId: string) => {
        const run = getRunOrThrow(getFixRun, runId, 'Fix');
        const skillDir = resolveSkillDirForRun(run);
        finishFix(runId, { skillDir, onEvent: broadcastFixEvent });
      },
      (runId) => runId,
    ),
  ),

  /**
   * Kick off a full eval batch against the fix's temp workdir (in-progress copy).
   * Results are written INSIDE the temp workdir, so the real skill stays untouched
   * until the user syncs. The fix agent can read benchmark.json between turns.
   *
   * Errors broadcast on `eval:event` (not `fix:event`) — the runs that would
   * have streamed there if start had succeeded; the EvalRunsView opened from
   * the fix overlay listens to `eval:event`.
   */
  'fix:runEvalsInTemp': createTypedHandler(
    withBroadcastOnError(
      'eval:event',
      async (request: RunEvalsInTempRequest) => {
        const run = getRunOrThrow(getFixRun, request.runId, 'Fix');
        const tempDir = getFixTempWorkdir(request.runId);
        if (!tempDir) throw new Error(`No temp workdir for fix ${request.runId}`);
        return startEvalRuns(
          {
            scope: run.scope,
            projectId: run.projectId,
            skillName: run.skillName,
            evalNames: request.evalNames,
            includeBaseline: request.includeBaseline,
            skillDirOverride: tempDir,
          },
          {
            resolveSkillDir,
            onEvent: broadcastEvalEvent,
          },
        );
      },
      (request) => request.runId,
    ),
  ),

  'fix:listActive': createTypedHandler(listActiveFixRuns),

  'fix:listAll': createTypedHandler(listAllFixRuns),

  'fix:getBufferedEvents': createTypedHandler(getFixBufferedEvents),

  'fix:getBenchmarks': createTypedHandler((runId: string): FixBenchmarks => {
    const realDir = getFixRealSkillDir(runId);
    const tempDir = getFixTempWorkdir(runId);
    return {
      real: realDir ? readLatestIterationBenchmark(realDir) : null,
      temp: tempDir ? readLatestIterationBenchmark(tempDir) : null,
    };
  }),

  'fix:listDiff': createTypedHandler(listFixDiff),
  'fix:readDiffFile': createTypedHandler(readFixDiffFile),
};
