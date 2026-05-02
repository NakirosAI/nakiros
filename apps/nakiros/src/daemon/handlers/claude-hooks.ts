import type {
  HooksFileContent,
  HooksMutationResult,
  PermissionsScope,
  SaveHooksRequest,
} from '@nakiros/shared';

import { getProject } from '../../services/project-scanner.js';
import { readHooks, saveHooks } from '../../services/claude-hooks-writer.js';
import { createTypedHandler } from './run-helpers.js';
import type { HandlerRegistry } from './index.js';

/**
 * `claudeHooks:*` IPC channels — read / save the project's
 * `settings.json` (or `settings.local.json`) hooks slice. Edits only the
 * `hooks` block; everything else is round-tripped via the opaque
 * `preservedJson` field so the Permissions and Hooks tabs can both write
 * to the same file without stepping on each other.
 */
export const claudeHooksHandlers: HandlerRegistry = {
  'claudeHooks:read': createTypedHandler(
    (projectId: string, scope: PermissionsScope): HooksFileContent | null => {
      const project = getProject(projectId);
      if (!project) return null;
      return readHooks(project.projectPath, scope);
    },
  ),

  'claudeHooks:save': createTypedHandler(
    (projectId: string, request: SaveHooksRequest): HooksMutationResult => {
      const project = getProject(projectId);
      if (!project) {
        return {
          ok: false,
          code: 'project-not-found',
          message: `Project ${projectId} not found.`,
        };
      }
      return saveHooks(project.projectPath, request);
    },
  ),
};
