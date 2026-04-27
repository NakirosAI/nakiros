import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';

import type {
  EvalMatrix,
  EvalRunEvent,
  EvalRunOutputEntry,
  GetEvalMatrixRequest,
  IterationRunArtifact,
  ListBaselinesRequest,
  ListBaselinesResponse,
  LoadIterationRunRequest,
  SkillEvalDefinition,
  SkillEvalRun,
  StartEvalRunRequest,
} from '@nakiros/shared';

import { listBaselines } from '../../services/baseline-store.js';

import {
  startEvalRuns,
  stopRun as stopEvalRun,
  listRuns as listEvalRuns,
  loadPersistedRuns,
  sendUserMessage as sendEvalUserMessage,
  finishWaitingRun as finishEvalWaitingRun,
  getRun as getEvalRun,
  getEvalBufferedEvents,
} from '../../services/eval-runner.js';
import { readIterationFeedback, saveEvalFeedback } from '../../services/eval-feedback.js';
import { buildEvalMatrix } from '../../services/eval-matrix.js';
import { resolveSkillDir } from './skill-dir.js';
import {
  createEventBroadcaster,
  createTypedHandler,
  getRunOrThrow,
  withBroadcastOnError,
} from './run-helpers.js';
import type { HandlerRegistry } from './index.js';

const broadcastEvalEvent = createEventBroadcaster<EvalRunEvent>('eval:event');

/**
 * Derive the skill directory + definition for a given run by inspecting its workdir.
 * Workdir layout: {skillDir}/evals/workspace/iteration-N/eval-X/config
 */
function getDefinitionForRun(run: SkillEvalRun): {
  skillDir: string;
  definition: SkillEvalDefinition;
} {
  const marker = '/evals/workspace/';
  const idx = run.workdir.indexOf(marker);
  if (idx === -1) throw new Error(`Cannot derive skill dir from workdir: ${run.workdir}`);
  const skillDir = run.workdir.slice(0, idx);

  const evalsJsonPath = join(skillDir, 'evals', 'evals.json');
  const rawEvals = JSON.parse(readFileSync(evalsJsonPath, 'utf8')) as {
    evals: Array<Record<string, unknown>>;
  };
  const match = rawEvals.evals.find((e) => e['name'] === run.evalName);
  if (!match) throw new Error(`Eval definition not found: ${run.evalName}`);

  const definition: SkillEvalDefinition = {
    id: (match['id'] as number) ?? 0,
    name: (match['name'] as string) ?? '',
    prompt: (match['prompt'] as string) ?? '',
    expectedOutput: (match['expected_output'] as string) ?? '',
    mode: (match['mode'] as 'autonomous' | 'interactive') ?? 'autonomous',
    outputFiles: (match['output_files'] as string[]) ?? [],
    assertions:
      (match['assertions'] as SkillEvalDefinition['assertions']) ?? [],
  };

  return { skillDir, definition };
}

/**
 * Registers the `eval:*` IPC channels — the full eval runner surface (lifecycle,
 * streaming, artefacts, feedback, matrix, single-iteration artefact load).
 *
 * Channels:
 * - Lifecycle: `eval:startRuns`, `eval:stopRun`, `eval:listRuns`, `eval:loadPersisted`, `eval:finishRun`
 * - Stream: `eval:sendUserMessage`, `eval:getBufferedEvents`
 * - Feedback: `eval:getFeedback`, `eval:saveFeedback`
 * - Outputs: `eval:listOutputs`, `eval:readOutput`, `eval:readDiffPatch`
 * - Matrix: `eval:getMatrix`, `eval:loadIterationRun`
 *
 * Broadcasts `eval:event` via `eventBus.broadcast` while runs are active.
 */
export const evalHandlers: HandlerRegistry = {
  'eval:startRuns': createTypedHandler(async (request: StartEvalRunRequest) =>
    startEvalRuns(request, {
      resolveSkillDir,
      onEvent: broadcastEvalEvent,
    }),
  ),

  'eval:stopRun': createTypedHandler(
    withBroadcastOnError('eval:event', stopEvalRun, (runId: string) => runId),
  ),

  'eval:listRuns': createTypedHandler(listEvalRuns),

  'eval:loadPersisted': createTypedHandler((request: StartEvalRunRequest) => {
    const skillDir = resolveSkillDir(request);
    return loadPersistedRuns(skillDir);
  }),

  'eval:sendUserMessage': createTypedHandler(
    withBroadcastOnError(
      'eval:event',
      async (runId: string, message: string) => {
        const run = getRunOrThrow(getEvalRun, runId, 'Eval');
        const { skillDir, definition } = getDefinitionForRun(run);
        await sendEvalUserMessage(runId, message, skillDir, definition, broadcastEvalEvent);
      },
      (runId) => runId,
    ),
  ),

  'eval:finishRun': createTypedHandler(
    withBroadcastOnError(
      'eval:event',
      async (runId: string) => {
        const run = getRunOrThrow(getEvalRun, runId, 'Eval');
        const { definition } = getDefinitionForRun(run);
        await finishEvalWaitingRun(runId, definition);
      },
      (runId) => runId,
    ),
  ),

  'eval:getBufferedEvents': createTypedHandler(getEvalBufferedEvents),

  'eval:getFeedback': createTypedHandler(
    (request: StartEvalRunRequest & { iteration: number }) => {
      const skillDir = resolveSkillDir(request);
      return readIterationFeedback(skillDir, request.iteration);
    },
  ),

  'eval:saveFeedback': createTypedHandler(
    (
      request: StartEvalRunRequest & {
        iteration: number;
        evalName: string;
        feedback: string;
      },
    ) => {
      const skillDir = resolveSkillDir(request);
      saveEvalFeedback(skillDir, request.iteration, request.evalName, request.feedback);
    },
  ),

  'eval:listOutputs': createTypedHandler((runId: string): EvalRunOutputEntry[] => {
    const run = getRunOrThrow(getEvalRun, runId, 'Eval');
    const outputsDir = join(run.workdir, 'outputs');
    if (!existsSync(outputsDir)) return [];

    const entries: EvalRunOutputEntry[] = [];
    const walk = (dir: string): void => {
      let items: import('fs').Dirent[];
      try {
        items = readdirSync(dir, { withFileTypes: true }) as import('fs').Dirent[];
      } catch {
        return;
      }
      for (const item of items) {
        const full = join(dir, item.name);
        if (item.isDirectory()) {
          walk(full);
        } else if (item.isFile()) {
          try {
            const s = statSync(full);
            entries.push({
              relativePath: full.slice(outputsDir.length + 1),
              sizeBytes: s.size,
              modifiedAt: s.mtime.toISOString(),
            });
          } catch {
            // ignore
          }
        }
      }
    };
    walk(outputsDir);
    entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    return entries;
  }),

  'eval:readOutput': createTypedHandler((runId: string, relativePath: string): string | null => {
    const run = getRunOrThrow(getEvalRun, runId, 'Eval');
    const outputsDir = join(run.workdir, 'outputs');
    const abs = resolve(outputsDir, relativePath);
    if (!abs.startsWith(outputsDir + '/') && abs !== outputsDir) {
      throw new Error('Path escapes outputs directory');
    }
    if (!existsSync(abs)) return null;
    try {
      return readFileSync(abs, 'utf8');
    } catch {
      return null;
    }
  }),

  /**
   * Return the git diff captured from this run's sandbox. Null when the run
   * didn't use a sandbox (no git root) or when the diff file is absent.
   */
  'eval:readDiffPatch': createTypedHandler((runId: string): string | null => {
    const run = getRunOrThrow(getEvalRun, runId, 'Eval');
    const path = join(run.workdir, 'diff.patch');
    if (!existsSync(path)) return null;
    try {
      return readFileSync(path, 'utf8');
    } catch {
      return null;
    }
  }),

  'eval:getMatrix': createTypedHandler((request: GetEvalMatrixRequest): EvalMatrix => {
    const skillDir = resolveSkillDir(request);
    return buildEvalMatrix(skillDir, request.skillName);
  }),

  /**
   * List every cached baseline for a skill. Used by the matrix toolbar's
   * kebab menu (Recalculer baseline / Voir baselines obsolètes) and by the
   * obsolescence toast at eval-start time.
   *
   * Stats are remapped from the snake_case on-disk shape (`pass_rate`,
   * `duration_ms`) to the frontend's camelCase convention.
   */
  'eval:listBaselines': createTypedHandler(
    (request: ListBaselinesRequest): ListBaselinesResponse => {
      const records = listBaselines(request.skillName);
      return {
        baselines: records.map((r) => ({
          skillName: r.skillName,
          evalName: r.evalName,
          modelFullId: r.modelFullId,
          evalFingerprint: r.evalFingerprint,
          stats: {
            passed: r.stats.passed,
            failed: r.stats.failed,
            total: r.stats.total,
            passRate: r.stats.pass_rate,
            tokens: r.stats.tokens,
            durationMs: r.stats.duration_ms,
          },
          computedAt: r.computedAt,
          isObsolete: r.isObsolete,
        })),
      };
    },
  ),

  'eval:loadIterationRun': createTypedHandler((request: LoadIterationRunRequest): IterationRunArtifact => {
    const skillDir = resolveSkillDir(request);
    const runDir = join(
      skillDir,
      'evals',
      'workspace',
      `iteration-${request.iteration}`,
      `eval-${request.evalName}`,
      request.config,
    );

    const read = <T>(rel: string): T | null => {
      const p = join(runDir, rel);
      if (!existsSync(p)) return null;
      try {
        return JSON.parse(readFileSync(p, 'utf8')) as T;
      } catch {
        return null;
      }
    };

    const run = read<SkillEvalRun>('run.json');
    const grading = read<IterationRunArtifact['grading']>('grading.json');
    const timing = read<{ total_tokens: number; duration_ms: number }>('timing.json');
    const diffPath = join(runDir, 'diff.patch');
    const diffPatch = existsSync(diffPath)
      ? (() => {
          try {
            return readFileSync(diffPath, 'utf8');
          } catch {
            return null;
          }
        })()
      : null;

    const outputs: EvalRunOutputEntry[] = [];
    const outputsDir = join(runDir, 'outputs');
    if (existsSync(outputsDir)) {
      const walk = (dir: string, prefix: string): void => {
        let items: import('fs').Dirent[];
        try {
          items = readdirSync(dir, { withFileTypes: true }) as import('fs').Dirent[];
        } catch {
          return;
        }
        for (const item of items) {
          const full = join(dir, item.name);
          const rel = prefix + item.name;
          if (item.isDirectory()) {
            walk(full, `${rel}/`);
            continue;
          }
          if (!item.isFile()) continue;
          try {
            const st = statSync(full);
            outputs.push({
              relativePath: rel,
              sizeBytes: st.size,
              modifiedAt: st.mtime.toISOString(),
            });
          } catch {
            // skip
          }
        }
      };
      walk(outputsDir, '');
    }

    return {
      run,
      grading,
      outputs,
      diffPatch,
      timing: timing
        ? { totalTokens: timing.total_tokens, durationMs: timing.duration_ms }
        : null,
    };
  }),
};
