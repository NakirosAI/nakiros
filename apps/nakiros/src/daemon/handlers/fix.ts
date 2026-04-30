import type {
  AuditRunEvent,
  EvalMatrix,
  EvalRunEvent,
  FixBenchmarks,
  FixUsage,
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
  getFixUsage,
  listActiveFixRuns,
  listAllFixRuns,
  getFixBufferedEvents,
  listFixDiff,
  readFixDiffFile,
  listFixEditsHistory,
  getFixTimeline,
  registerFixEvalBatch,
} from '../../services/fix-runner.js';
import { startEvalRuns } from '../../services/eval-runner.js';
import { readLatestIterationBenchmark } from '../../services/eval-benchmark.js';
import { buildEvalMatrix } from '../../services/eval-matrix.js';
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
   * The agent runs out of the sandbox so the real skill code is never touched,
   * but iteration artefacts are persisted under
   * `<realSkillDir>/evals/.fix-temp/<fixRunId>/iteration-N/` — segregated from
   * the main eval history. The fix lifecycle (`fix:finish` / `fix:stopRun`)
   * later promotes the chosen iteration into `evals/workspace/` or wipes the
   * whole `.fix-temp/<fixRunId>/` directory.
   *
   * Errors broadcast on `eval:event` (not `fix:event`) — the runs that would
   * have streamed there if start had succeeded; the EvalRunsView opened from
   * the fix overlay listens to `eval:event`.
   */
  'fix:runEvalsInTemp': createTypedHandler(
    withBroadcastOnError(
      'eval:event',
      async (request: RunEvalsInTempRequest) => {
        console.log(
          `[fix:runEvalsInTemp] start fixRunId=${request.runId} evalNames=${
            request.evalNames?.join(',') ?? 'all'
          } includeBaseline=${request.includeBaseline ?? false}`,
        );
        const run = getRunOrThrow(getFixRun, request.runId, 'Fix');
        const tempDir = getFixTempWorkdir(request.runId);
        if (!tempDir) throw new Error(`No temp workdir for fix ${request.runId}`);
        const response = await startEvalRuns(
          {
            scope: run.scope,
            projectId: run.projectId,
            skillName: run.skillName,
            evalNames: request.evalNames,
            includeBaseline: request.includeBaseline,
            skillDirOverride: tempDir,
            // Tag the resulting iteration as `fix-temp` so the matrix
            // surfaces it in the unified history and the fix lifecycle
            // (finish/reject) can later promote/cleanup the batch.
            fixRunId: request.runId,
          },
          {
            resolveSkillDir,
            onEvent: broadcastEvalEvent,
          },
        );
        console.log(
          `[fix:runEvalsInTemp] startEvalRuns ok fixRunId=${request.runId} iteration=${response.iteration} runIdCount=${response.runIds.length}`,
        );
        // Watch the batch so when every SkillEvalRun finishes we read the
        // benchmark and broadcast `fix_eval_result` on `fix:event` — the
        // frontend's fix timeline turns each one into an inline card.
        registerFixEvalBatch({
          fixRunId: request.runId,
          iteration: response.iteration,
          evalRunIds: response.runIds,
        });
        return response;
      },
      (request) => request.runId,
    ),
  ),

  'fix:listActive': createTypedHandler(listActiveFixRuns),

  'fix:listAll': createTypedHandler(listAllFixRuns),

  'fix:getBufferedEvents': createTypedHandler(getFixBufferedEvents),

  'fix:getBenchmarks': createTypedHandler((runId: string): FixBenchmarks => {
    const realDir = getFixRealSkillDir(runId);
    return {
      real: realDir ? readLatestIterationBenchmark(realDir) : null,
      // Latest iteration of THIS fix session. Lives under
      // `<realDir>/evals/.fix-temp/<runId>/`, isolated from the main
      // history so the encart never falls back to a stale skill iter.
      temp: realDir ? readLatestIterationBenchmark(realDir, runId) : null,
    };
  }),

  'fix:listDiff': createTypedHandler(listFixDiff),
  'fix:readDiffFile': createTypedHandler(readFixDiffFile),
  'fix:getEditsHistory': createTypedHandler(listFixEditsHistory),
  'fix:getTimeline': createTypedHandler(getFixTimeline),

  /**
   * Compute the billed-equivalent token total + agent-active elapsed for
   * a fix run by parsing its Claude Code session JSONL. Bypasses the
   * runner's own (broken) tally so the fix screen header surfaces a
   * trustworthy cost signal. See `docs/decisions/token-accounting.md`.
   */
  'fix:getUsage': createTypedHandler(
    (runId: string): FixUsage => getFixUsage(runId),
  ),

  /**
   * Build an `EvalMatrix` from `<realSkillDir>/evals/.fix-temp/<runId>/` so
   * the diff overlay opened from a fix chat can offer fix-temp iterations
   * alongside the prod history. Returns an empty matrix shape when the
   * fix run has no temp iterations yet (no eval ever run for this fix).
   */
  'fix:getFixTempMatrix': createTypedHandler((runId: string): EvalMatrix => {
    const run = getRunOrThrow(getFixRun, runId, 'Fix');
    const realDir = getFixRealSkillDir(runId);
    // `buildEvalMatrix` already returns an empty matrix shape when the
    // workspace dir doesn't exist — no need to duplicate the empty
    // construction here.
    return buildEvalMatrix(realDir ?? '', run.skillName, runId);
  }),
};
