import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join, resolve } from 'path';

import type { SkillScope } from '@nakiros/shared';

import { getProject } from '../../services/project-scanner.js';
import { getClaudeGlobalSkillsDir } from '../../services/claude-global-skills-reader.js';
import { resolvePluginSkillDir } from '../../services/plugin-skills-reader.js';
import type { HandlerRegistry } from './index.js';

const DATA_URL_MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  bmp: 'image/bmp',
  avif: 'image/avif',
};

interface ReadFileRequest {
  scope: SkillScope;
  projectId?: string;
  pluginName?: string;
  marketplaceName?: string;
  skillName: string;
  relativePath: string;
}

function resolveSkillDir(request: ReadFileRequest): string {
  if (request.scope === 'nakiros-bundled') {
    return join(homedir(), '.nakiros', 'skills', request.skillName);
  }
  if (request.scope === 'claude-global') {
    return join(getClaudeGlobalSkillsDir(), request.skillName);
  }
  if (request.scope === 'plugin') {
    const { marketplaceName, pluginName } = request;
    if (!marketplaceName) throw new Error('marketplaceName required for plugin scope');
    if (!pluginName) throw new Error('pluginName required for plugin scope');
    return resolvePluginSkillDir(marketplaceName, pluginName, request.skillName);
  }
  const projectId = request.projectId;
  if (!projectId) throw new Error('projectId required for project scope');
  const project = getProject(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  return join(project.projectPath, '.claude', 'skills', request.skillName);
}

export const skillsCommonHandlers: HandlerRegistry = {
  'skill:readFileAsDataUrl': (args) => {
    const request = args[0] as ReadFileRequest;
    const skillDir = resolveSkillDir(request);
    const abs = resolve(skillDir, request.relativePath);
    if (!abs.startsWith(skillDir + '/') && abs !== skillDir) return null;
    if (!existsSync(abs)) return null;
    const ext = request.relativePath.split('.').pop()?.toLowerCase() ?? '';
    const mime = DATA_URL_MIME_BY_EXT[ext];
    if (!mime) return null;
    try {
      const buf = readFileSync(abs);
      return `data:${mime};base64,${buf.toString('base64')}`;
    } catch {
      return null;
    }
  },
};
