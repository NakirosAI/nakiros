import type {
  ClaudeMdFileContent,
  ClaudeMdListResult,
  ClaudeMdMutationResult,
  ClaudeMdScope,
  SaveClaudeMdRequest,
} from '@nakiros/shared';

import { getProject } from '../../services/project-scanner.js';
import {
  deleteClaudeMd,
  listClaudeMd,
  readClaudeMd,
  saveClaudeMd,
} from '../../services/claude-md-writer.js';
import { createTypedHandler } from './run-helpers.js';
import type { HandlerRegistry } from './index.js';

/**
 * `claudeMd:*` IPC channels — list / read / save / delete CLAUDE.md across
 * its three project-scoped locations. The list also reports whether an
 * `AGENTS.md` exists at the root so the editor can suggest importing it.
 */
export const claudeMdHandlers: HandlerRegistry = {
  'claudeMd:list': createTypedHandler((projectId: string): ClaudeMdListResult => {
    const project = getProject(projectId);
    if (!project) {
      return { files: [], agentsMdAtRoot: false, projectPath: '' };
    }
    return listClaudeMd(project.projectPath);
  }),

  'claudeMd:read': createTypedHandler(
    (projectId: string, scope: ClaudeMdScope): ClaudeMdFileContent | null => {
      const project = getProject(projectId);
      if (!project) return null;
      return readClaudeMd(project.projectPath, scope);
    },
  ),

  'claudeMd:save': createTypedHandler(
    (projectId: string, request: SaveClaudeMdRequest): ClaudeMdMutationResult => {
      const project = getProject(projectId);
      if (!project) {
        return {
          ok: false,
          code: 'project-not-found',
          message: `Project ${projectId} not found.`,
        };
      }
      return saveClaudeMd(project.projectPath, request);
    },
  ),

  'claudeMd:delete': createTypedHandler(
    (projectId: string, scope: ClaudeMdScope): ClaudeMdMutationResult => {
      const project = getProject(projectId);
      if (!project) {
        return {
          ok: false,
          code: 'project-not-found',
          message: `Project ${projectId} not found.`,
        };
      }
      return deleteClaudeMd(project.projectPath, scope);
    },
  ),
};
