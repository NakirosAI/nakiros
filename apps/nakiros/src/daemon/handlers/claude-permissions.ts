import type {
  PermissionsFileContent,
  PermissionsMutationResult,
  PermissionsScope,
  SavePermissionsRequest,
} from '@nakiros/shared';

import { getProject } from '../../services/project-scanner.js';
import {
  readPermissions,
  savePermissions,
} from '../../services/claude-permissions-writer.js';
import { createTypedHandler } from './run-helpers.js';
import type { HandlerRegistry } from './index.js';

/**
 * `claudePermissions:*` IPC channels — read / save the project's
 * `settings.json` (or `settings.local.json`) with permissions split into
 * structured fields and the rest preserved as a JSON string.
 */
export const claudePermissionsHandlers: HandlerRegistry = {
  'claudePermissions:read': createTypedHandler(
    (projectId: string, scope: PermissionsScope): PermissionsFileContent | null => {
      const project = getProject(projectId);
      if (!project) return null;
      return readPermissions(project.projectPath, scope);
    },
  ),

  'claudePermissions:save': createTypedHandler(
    (projectId: string, request: SavePermissionsRequest): PermissionsMutationResult => {
      const project = getProject(projectId);
      if (!project) {
        return {
          ok: false,
          code: 'project-not-found',
          message: `Project ${projectId} not found.`,
        };
      }
      return savePermissions(project.projectPath, request);
    },
  ),
};
