import type {
  EvalRunEvent,
  GetComparisonFingerprintStatusRequest,
  GetComparisonMatrixRequest,
  ListComparisonsRequest,
  RunComparisonRequest,
  StartEvalRunRequest,
} from '@nakiros/shared';

import {
  getComparisonFingerprintStatus,
  listComparisons,
  loadComparisonMatrix,
  startComparisonRun,
} from '../../services/comparison-runner.js';
import { resolveEvalSkillDir } from './skill-dir.js';
import { createEventBroadcaster } from './run-helpers.js';
import type { HandlerRegistry } from './index.js';

// Comparisons piggyback on the `eval:event` broadcast channel — the runner
// reuses startEvalRuns under the hood, so run events already flow through it.
const broadcastEvalEvent = createEventBroadcaster<EvalRunEvent>('eval:event');

/**
 * Adapter: RunComparisonRequest has the same skill-identity shape as
 * StartEvalRunRequest, so we can reuse the resolver without a new function.
 */
function toEvalRequestShape(req: {
  scope: RunComparisonRequest['scope'];
  pluginName?: string;
  marketplaceName?: string;
  projectId?: string;
  skillName: string;
  skillDirOverride?: string;
}): StartEvalRunRequest {
  return {
    scope: req.scope,
    pluginName: req.pluginName,
    marketplaceName: req.marketplaceName,
    projectId: req.projectId,
    skillName: req.skillName,
    skillDirOverride: req.skillDirOverride,
  };
}

export const comparisonHandlers: HandlerRegistry = {
  'comparison:run': async (args) => {
    const request = args[0] as RunComparisonRequest;
    return startComparisonRun(request, {
      resolveSkillDir: (r) => resolveEvalSkillDir(toEvalRequestShape(r)),
      onEvent: broadcastEvalEvent,
    });
  },

  'comparison:list': (args) => {
    const request = args[0] as ListComparisonsRequest;
    const skillDir = resolveEvalSkillDir(toEvalRequestShape(request));
    return listComparisons(skillDir);
  },

  'comparison:getMatrix': (args) => {
    const request = args[0] as GetComparisonMatrixRequest;
    const skillDir = resolveEvalSkillDir(toEvalRequestShape(request));
    return loadComparisonMatrix(skillDir, request.comparisonId);
  },

  'comparison:getFingerprintStatus': (args) => {
    const request = args[0] as GetComparisonFingerprintStatusRequest;
    const skillDir = resolveEvalSkillDir(toEvalRequestShape(request));
    return getComparisonFingerprintStatus(skillDir);
  },
};
