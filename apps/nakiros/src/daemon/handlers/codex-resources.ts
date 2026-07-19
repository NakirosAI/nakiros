import type {
  CodexResourceKind,
  CodexResourceMutationResult,
  CodexResourceReadResult,
  CodexResourceSummary,
} from '@nakiros/shared';
import { IPC_CHANNELS } from '@nakiros/shared';

import {
  deleteCodexResource,
  listCodexResources,
  readCodexResource,
  saveCodexResource,
} from '../../services/codex-resource-writer.js';
import { getProject } from '../../services/project-scanner.js';
import type { HandlerRegistry } from './index.js';
import { createTypedHandler } from './run-helpers.js';

function projectMissing(projectId: string): CodexResourceMutationResult {
  return { ok: false, code: 'project-not-found', message: `Project ${projectId} not found.` };
}

/** Uniform project-native Codex resource CRUD used by Hestia. */
export const codexResourceHandlers: HandlerRegistry = {
  [IPC_CHANNELS['codexResources:list']]: createTypedHandler(
    (projectId: string, kind: CodexResourceKind): CodexResourceSummary[] => {
      const project = getProject(projectId);
      return project ? listCodexResources(project.projectPath, kind) : [];
    },
  ),

  [IPC_CHANNELS['codexResources:read']]: createTypedHandler(
    (projectId: string, kind: CodexResourceKind, id?: string): CodexResourceReadResult => {
      const project = getProject(projectId);
      return project ? readCodexResource(project.projectPath, kind, id) : projectMissing(projectId);
    },
  ),

  [IPC_CHANNELS['codexResources:save']]: createTypedHandler(
    (
      projectId: string,
      kind: CodexResourceKind,
      id: string | undefined,
      content: string,
      mtimeAtRead: string,
    ): CodexResourceMutationResult => {
      const project = getProject(projectId);
      return project
        ? saveCodexResource(project.projectPath, kind, id, content, mtimeAtRead)
        : projectMissing(projectId);
    },
  ),

  [IPC_CHANNELS['codexResources:delete']]: createTypedHandler(
    (
      projectId: string,
      kind: CodexResourceKind,
      id?: string,
      mtimeAtRead?: string,
    ): CodexResourceMutationResult => {
      const project = getProject(projectId);
      return project
        ? deleteCodexResource(project.projectPath, kind, id, mtimeAtRead)
        : projectMissing(projectId);
    },
  ),
};
