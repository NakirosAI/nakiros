import { homedir } from 'os';
import { join } from 'path';

import type { SkillScope } from '@nakiros/shared';

import { getProject } from '../../services/project-scanner.js';
import { getClaudeGlobalSkillsDir } from '../../services/claude-global-skills-reader.js';
import { resolvePluginSkillDir } from '../../services/plugin-skills-reader.js';

/**
 * Minimal scope reference accepted by `resolveSkillDir`. Every request shape
 * involving a skill (StartEvalRunRequest, ReadFileRequest, audit/fix/create
 * starts) structurally satisfies this — pass the request directly.
 *
 * `skillDirOverride` short-circuits resolution and is used by fix runs so
 * evals can target the temp copy of the in-progress skill.
 */
export interface SkillScopeRef {
  scope: SkillScope;
  skillName: string;
  projectId?: string;
  pluginName?: string;
  marketplaceName?: string;
  skillDirOverride?: string;
}

/**
 * Resolve the absolute directory of the skill targeted by `ref`. Accepts the
 * four scopes (`project`, `nakiros-bundled`, `claude-global`, `plugin`) and
 * the `skillDirOverride` short-circuit.
 *
 * @throws when required fields for the scope are missing (e.g. `projectId`
 * for project scope, `marketplaceName`/`pluginName` for plugin scope) or when
 * the project id does not exist in the registry.
 */
export function resolveSkillDir(ref: SkillScopeRef): string {
  if (ref.skillDirOverride) {
    return ref.skillDirOverride;
  }
  if (ref.scope === 'nakiros-bundled') {
    return join(homedir(), '.nakiros', 'skills', ref.skillName);
  }
  if (ref.scope === 'claude-global') {
    return join(getClaudeGlobalSkillsDir(), ref.skillName);
  }
  if (ref.scope === 'plugin') {
    const { marketplaceName, pluginName } = ref;
    if (!marketplaceName) throw new Error('marketplaceName required for plugin scope');
    if (!pluginName) throw new Error('pluginName required for plugin scope');
    return resolvePluginSkillDir(marketplaceName, pluginName, ref.skillName);
  }
  const projectId = ref.projectId;
  if (!projectId) throw new Error('projectId required for project scope');
  const project = getProject(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  return join(project.projectPath, '.claude', 'skills', ref.skillName);
}
