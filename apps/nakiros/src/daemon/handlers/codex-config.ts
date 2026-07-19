import type { CodexConfigMutationResult, CodexConfigReadResult } from '@nakiros/shared';
import { IPC_CHANNELS } from '@nakiros/shared';

import { readCodexConfig, saveCodexConfig } from '../../services/codex-config-writer.js';
import { getProject } from '../../services/project-scanner.js';
import type { HandlerRegistry } from './index.js';
import { createTypedHandler } from './run-helpers.js';

/** Project-scoped Codex native configuration handlers. */
export const codexConfigHandlers: HandlerRegistry = {
  [IPC_CHANNELS['codexConfig:read']]: createTypedHandler(
    (projectId: string): CodexConfigReadResult => {
      const project = getProject(projectId);
      if (!project) {
        return {
          ok: false,
          code: 'project-not-found',
          message: `Project ${projectId} not found.`,
        };
      }
      return readCodexConfig(project.projectPath);
    },
  ),

  [IPC_CHANNELS['codexConfig:save']]: createTypedHandler(
    (projectId: string, content: string, mtimeAtRead: string): CodexConfigMutationResult => {
      const project = getProject(projectId);
      if (!project) {
        return {
          ok: false,
          code: 'project-not-found',
          message: `Project ${projectId} not found.`,
        };
      }
      return saveCodexConfig(project.projectPath, content, mtimeAtRead);
    },
  ),
};
