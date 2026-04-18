import type {
  AuditRunEvent,
  FixBenchmarks,
  StartAuditRequest,
  StartEvalRunRequest,
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
  getFixBufferedEvents,
} from '../../services/fix-runner.js';
import { startEvalRuns } from '../../services/eval-runner.js';
import { readLatestIterationBenchmark } from '../../services/eval-benchmark.js';
import { eventBus } from '../event-bus.js';
import { resolveEvalSkillDir } from './skill-dir.js';
import type { HandlerRegistry } from './index.js';

function broadcastFixEvent(event: AuditRunEvent): void {
  eventBus.broadcast('fix:event', event);
}

function broadcastEvalEvent(event: import('@nakiros/shared').EvalRunEvent): void {
  eventBus.broadcast('eval:event', event);
}

export const fixHandlers: HandlerRegistry = {
  'fix:start': (args) => {
    const request = args[0] as StartAuditRequest;
    const skillDir = resolveEvalSkillDir(request as unknown as StartEvalRunRequest);
    return startFix(request, { skillDir, onEvent: broadcastFixEvent });
  },

  'fix:stopRun': (args) => {
    stopFix(args[0] as string);
  },

  'fix:getRun': (args) => getFixRun(args[0] as string),

  'fix:sendUserMessage': async (args) => {
    const runId = args[0] as string;
    const message = args[1] as string;
    const run = getFixRun(runId);
    if (!run) throw new Error(`Fix run not found: ${runId}`);
    const skillDir = resolveEvalSkillDir({
      scope: run.scope,
      projectId: run.projectId,
      skillName: run.skillName,
    } as StartEvalRunRequest);
    await sendFixUserMessage(runId, message, { skillDir, onEvent: broadcastFixEvent });
  },

  'fix:finish': (args) => {
    const runId = args[0] as string;
    const run = getFixRun(runId);
    if (!run) throw new Error(`Fix run not found: ${runId}`);
    const skillDir = resolveEvalSkillDir({
      scope: run.scope,
      projectId: run.projectId,
      skillName: run.skillName,
    } as StartEvalRunRequest);
    finishFix(runId, { skillDir, onEvent: broadcastFixEvent });
  },

  /**
   * Kick off a full eval batch against the fix's temp workdir (in-progress copy).
   * Results are written INSIDE the temp workdir, so the real skill stays untouched
   * until the user syncs. The fix agent can read benchmark.json between turns.
   */
  'fix:runEvalsInTemp': async (args) => {
    const request = args[0] as {
      runId: string;
      evalNames?: string[];
      includeBaseline?: boolean;
    };
    const run = getFixRun(request.runId);
    if (!run) throw new Error(`Fix run not found: ${request.runId}`);
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
        resolveSkillDir: resolveEvalSkillDir,
        onEvent: broadcastEvalEvent,
      },
    );
  },

  'fix:listActive': () => listActiveFixRuns(),

  'fix:getBufferedEvents': (args) => getFixBufferedEvents(args[0] as string),

  'fix:getBenchmarks': (args): FixBenchmarks => {
    const runId = args[0] as string;
    const realDir = getFixRealSkillDir(runId);
    const tempDir = getFixTempWorkdir(runId);
    return {
      real: realDir ? readLatestIterationBenchmark(realDir) : null,
      temp: tempDir ? readLatestIterationBenchmark(tempDir) : null,
    };
  },
};
