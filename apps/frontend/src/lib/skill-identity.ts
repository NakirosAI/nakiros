import type { GetEvalMatrixRequest, LoadIterationRunRequest, Skill } from '@nakiros/shared';
import type { SkillTabIdentity } from '../hooks/useTabs';

/**
 * Centralised dispatch around the per-scope IPC surface. The daemon
 * exposes one channel per scope (`listProjectSkills`,
 * `listClaudeGlobalSkills`, ...) and these helpers pick the right
 * one for a given {@link SkillTabIdentity}. Keeps the screens
 * scope-agnostic so a single `SkillDetailScreen` can render any
 * skill in any scope.
 */

/** Find a single skill by identity, walking the appropriate scope list. */
export async function loadSkillByIdentity(identity: SkillTabIdentity): Promise<Skill | null> {
  const list = await listSkillsForScope(identity);
  if (identity.scope === 'plugin') {
    return (
      list.find(
        (s) =>
          s.name === identity.skillName &&
          s.pluginName === identity.pluginName &&
          s.marketplaceName === identity.marketplaceName,
      ) ?? null
    );
  }
  if (identity.scope === 'project') {
    return list.find((s) => s.name === identity.skillName && s.projectId === identity.projectId) ?? null;
  }
  return list.find((s) => s.name === identity.skillName) ?? null;
}

/** List every skill in the scope the identity belongs to. */
function listSkillsForScope(identity: SkillTabIdentity): Promise<Skill[]> {
  switch (identity.scope) {
    case 'project':
      return window.nakiros.listProjectSkills(identity.projectId);
    case 'claude-global':
      return window.nakiros.listClaudeGlobalSkills();
    case 'plugin':
      return window.nakiros.listPluginSkills();
    case 'nakiros-bundled':
      return window.nakiros.listBundledSkills();
  }
}

/**
 * Read a file inside the skill folder. Each scope has its own read
 * channel — this dispatcher hides the difference from the UI code.
 */
export function readSkillFileByIdentity(
  identity: SkillTabIdentity,
  relativePath: string,
): Promise<string | null> {
  switch (identity.scope) {
    case 'project':
      return window.nakiros.readSkillFile(identity.projectId, identity.skillName, relativePath);
    case 'claude-global':
      return window.nakiros.readClaudeGlobalSkillFile(identity.skillName, relativePath);
    case 'plugin':
      return window.nakiros.readPluginSkillFile(
        identity.marketplaceName,
        identity.pluginName,
        identity.skillName,
        relativePath,
      );
    case 'nakiros-bundled':
      return window.nakiros.readBundledSkillFile(identity.skillName, relativePath);
  }
}

/** Build the eval-matrix request payload accepted by the daemon. */
export function evalMatrixRequestForIdentity(identity: SkillTabIdentity): GetEvalMatrixRequest {
  const base = { skillName: identity.skillName, scope: identity.scope };
  if (identity.scope === 'project') return { ...base, projectId: identity.projectId };
  if (identity.scope === 'plugin') {
    return {
      ...base,
      marketplaceName: identity.marketplaceName,
      pluginName: identity.pluginName,
    };
  }
  return base;
}

/**
 * Build the eval-iteration request for a single eval/config — used
 * by the diff overlay drilldown and the cell drawer (when those
 * land for non-project skills).
 */
export function iterationRunRequestForIdentity(
  identity: SkillTabIdentity,
  iteration: number,
  evalName: string,
  config: 'with_skill' | 'without_skill',
): LoadIterationRunRequest {
  const base = {
    scope: identity.scope,
    skillName: identity.skillName,
    iteration,
    evalName,
    config,
  } satisfies Partial<LoadIterationRunRequest>;
  if (identity.scope === 'project') return { ...base, projectId: identity.projectId };
  if (identity.scope === 'plugin') {
    return {
      ...base,
      marketplaceName: identity.marketplaceName,
      pluginName: identity.pluginName,
    };
  }
  return base;
}

/**
 * Lookup payload used by `listAuditHistory`. Same shape as the eval
 * matrix request — we expose a separate helper to keep call sites
 * readable.
 */
export function auditHistoryRequestForIdentity(identity: SkillTabIdentity) {
  return evalMatrixRequestForIdentity(identity);
}
