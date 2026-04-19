import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';

import type {
  EvalRunEvent,
  EvalRunOutputEntry,
  SkillEvalDefinition,
  SkillEvalRun,
  StartEvalRunRequest,
} from '@nakiros/shared';

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
import { eventBus } from '../event-bus.js';
import { resolveEvalSkillDir } from './skill-dir.js';
import type { HandlerRegistry } from './index.js';

function broadcastEvalEvent(event: EvalRunEvent): void {
  eventBus.broadcast('eval:event', event);
}

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

export const evalHandlers: HandlerRegistry = {
  'eval:startRuns': async (args) => {
    const request = args[0] as StartEvalRunRequest;
    return startEvalRuns(request, {
      resolveSkillDir: resolveEvalSkillDir,
      onEvent: broadcastEvalEvent,
    });
  },

  'eval:stopRun': (args) => {
    stopEvalRun(args[0] as string);
  },

  'eval:listRuns': () => listEvalRuns(),

  'eval:loadPersisted': (args) => {
    const request = args[0] as StartEvalRunRequest;
    const skillDir = resolveEvalSkillDir(request);
    return loadPersistedRuns(skillDir);
  },

  'eval:sendUserMessage': async (args) => {
    const runId = args[0] as string;
    const message = args[1] as string;
    const run = getEvalRun(runId);
    if (!run) throw new Error(`Run not found: ${runId}`);
    const { skillDir, definition } = getDefinitionForRun(run);
    await sendEvalUserMessage(runId, message, skillDir, definition, broadcastEvalEvent);
  },

  'eval:finishRun': async (args) => {
    const runId = args[0] as string;
    const run = getEvalRun(runId);
    if (!run) throw new Error(`Run not found: ${runId}`);
    const { definition } = getDefinitionForRun(run);
    await finishEvalWaitingRun(runId, definition);
  },

  'eval:getBufferedEvents': (args) => getEvalBufferedEvents(args[0] as string),

  'eval:getFeedback': (args) => {
    const request = args[0] as StartEvalRunRequest & { iteration: number };
    const skillDir = resolveEvalSkillDir(request);
    return readIterationFeedback(skillDir, request.iteration);
  },

  'eval:saveFeedback': (args) => {
    const request = args[0] as StartEvalRunRequest & {
      iteration: number;
      evalName: string;
      feedback: string;
    };
    const skillDir = resolveEvalSkillDir(request);
    saveEvalFeedback(skillDir, request.iteration, request.evalName, request.feedback);
  },

  'eval:listOutputs': (args): EvalRunOutputEntry[] => {
    const runId = args[0] as string;
    const run = getEvalRun(runId);
    if (!run) throw new Error(`Run not found: ${runId}`);
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
  },

  'eval:readOutput': (args): string | null => {
    const runId = args[0] as string;
    const relativePath = args[1] as string;
    const run = getEvalRun(runId);
    if (!run) throw new Error(`Run not found: ${runId}`);
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
  },

  /**
   * Return the git diff captured from this run's sandbox. Null when the run
   * didn't use a sandbox (no git root) or when the diff file is absent.
   */
  'eval:readDiffPatch': (args): string | null => {
    const runId = args[0] as string;
    const run = getEvalRun(runId);
    if (!run) throw new Error(`Run not found: ${runId}`);
    const path = join(run.workdir, 'diff.patch');
    if (!existsSync(path)) return null;
    try {
      return readFileSync(path, 'utf8');
    } catch {
      return null;
    }
  },
};
