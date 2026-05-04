import type {
  ClaudeMdAuditHistoryEntry,
  ClaudeMdFileContent,
  ClaudeMdListResult,
  ClaudeMdMutationResult,
  SaveClaudeMdRequest,
} from '@nakiros/shared';

import { getProject } from '../../services/project-scanner.js';
import {
  deleteClaudeMd,
  listClaudeMd,
  readClaudeMd,
  saveClaudeMd,
} from '../../services/claude-md-writer.js';
import {
  listClaudemdAudits,
  readClaudemdAudit,
} from '../../services/claudemd-audit-history.js';
import { createTypedHandler } from './run-helpers.js';
import type { HandlerRegistry } from './index.js';

/**
 * `claudeMd:*` IPC channels — list / read / save / delete the project-root
 * `./CLAUDE.md`. The list also reports whether an `AGENTS.md` exists at the
 * root so the editor can suggest importing it.
 */
export const claudeMdHandlers: HandlerRegistry = {
  'claudeMd:list': createTypedHandler((projectId: string): ClaudeMdListResult => {
    const project = getProject(projectId);
    if (!project) {
      return {
        file: {
          path: '',
          exists: false,
          lastModified: null,
          lines: 0,
          chars: 0,
          tokens: 0,
          headings: [],
          imports: [],
          hasHtmlComments: false,
        },
        agentsMdAtRoot: false,
        projectPath: '',
      };
    }
    return listClaudeMd(project.projectPath);
  }),

  'claudeMd:read': createTypedHandler(
    (projectId: string): ClaudeMdFileContent | null => {
      const project = getProject(projectId);
      if (!project) return null;
      return readClaudeMd(project.projectPath);
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
    (projectId: string): ClaudeMdMutationResult => {
      const project = getProject(projectId);
      if (!project) {
        return {
          ok: false,
          code: 'project-not-found',
          message: `Project ${projectId} not found.`,
        };
      }
      return deleteClaudeMd(project.projectPath);
    },
  ),

  'claudeMd:listAudits': createTypedHandler(
    (projectId: string): ClaudeMdAuditHistoryEntry[] => {
      return listClaudemdAudits(projectId);
    },
  ),

  'claudeMd:readAudit': createTypedHandler(
    (path: string): string | null => readClaudemdAudit(path),
  ),
};
