import type {
  EvalRunEvent,
  GetComparisonFingerprintStatusRequest,
  GetComparisonMatrixRequest,
  ListComparisonsRequest,
  RunComparisonRequest,
} from '@nakiros/shared';

import {
  getComparisonFingerprintStatus,
  listComparisons,
  loadComparisonMatrix,
  startComparisonRun,
} from '../../services/comparison-runner.js';
import { resolveSkillDir } from './skill-dir.js';
import { createEventBroadcaster, createTypedHandler } from './run-helpers.js';
import type { HandlerRegistry } from './index.js';

// Comparisons piggyback on the `eval:event` broadcast channel — the runner
// reuses startEvalRuns under the hood, so run events already flow through it.
const broadcastEvalEvent = createEventBroadcaster<EvalRunEvent>('eval:event');

/**
 * Registers the `comparison:*` IPC channels — A/B/C eval comparison across
 * Haiku / Sonnet / Opus for a single skill snapshot. Comparison runs reuse
 * the eval runner under the hood, so their events flow through the same
 * `eval:event` broadcast.
 *
 * Channels:
 * - `comparison:run` — launch a new comparison (returns runIds + reuse summary)
 * - `comparison:list` — existing comparisons stored under `{skillDir}/evals/comparisons/`
 * - `comparison:getMatrix` — full per-model matrix for one comparison
 * - `comparison:getFingerprintStatus` — pre-flight info so the UI can warn if the skill changed since the last iteration
 */
export const comparisonHandlers: HandlerRegistry = {
  'comparison:run': createTypedHandler(async (request: RunComparisonRequest) =>
    startComparisonRun(request, {
      resolveSkillDir,
      onEvent: broadcastEvalEvent,
    }),
  ),

  'comparison:list': createTypedHandler((request: ListComparisonsRequest) => {
    const skillDir = resolveSkillDir(request);
    return listComparisons(skillDir);
  }),

  'comparison:getMatrix': createTypedHandler((request: GetComparisonMatrixRequest) => {
    const skillDir = resolveSkillDir(request);
    return loadComparisonMatrix(skillDir, request.comparisonId);
  }),

  'comparison:getFingerprintStatus': createTypedHandler(
    (request: GetComparisonFingerprintStatusRequest) => {
      const skillDir = resolveSkillDir(request);
      return getComparisonFingerprintStatus(skillDir);
    },
  ),
};
