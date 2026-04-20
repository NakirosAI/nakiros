import { homedir } from 'os';
import { join } from 'path';

import type { StartEvalRunRequest } from '@nakiros/shared';

import { getProject } from '../../services/project-scanner.js';
import { getClaudeGlobalSkillsDir } from '../../services/claude-global-skills-reader.js';
import { resolvePluginSkillDir } from '../../services/plugin-skills-reader.js';

/**
 * Resolve the directory of the skill targeted by a request.
 *
 * Also accepts partial request shapes (same scope + projectId + skillName fields)
 * used by audit/fix/create/feedback/output handlers.
 *
 * `skillDirOverride` takes precedence — used by fix runs so that evals can run
 * against the temp copy of the in-progress skill.
 */
export function resolveEvalSkillDir(request: StartEvalRunRequest): string {
  if (request.skillDirOverride) {
    return request.skillDirOverride;
  }
  if (request.scope === 'nakiros-bundled') {
    return join(homedir(), '.nakiros', 'skills', request.skillName);
  }
  if (request.scope === 'claude-global') {
    return join(getClaudeGlobalSkillsDir(), request.skillName);
  }
  if (request.scope === 'plugin') {
    const pluginName = request.pluginName;
    if (!pluginName) throw new Error('pluginName required for plugin scope');
    const projectPath = request.projectId
      ? getProject(request.projectId)?.projectPath
      : undefined;
    return resolvePluginSkillDir(pluginName, request.skillName, projectPath);
  }
  const projectId = request.projectId;
  if (!projectId) throw new Error('projectId required for project scope');
  const project = getProject(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  return join(project.projectPath, '.claude', 'skills', request.skillName);
}
