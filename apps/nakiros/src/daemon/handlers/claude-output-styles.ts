import type {
  CreateOutputStyleRequest,
  OutputStyleFileContent,
  OutputStyleMutationResult,
  OutputStylesListResult,
  SaveOutputStyleRequest,
} from '@nakiros/shared';

import { getProject } from '../../services/project-scanner.js';
import {
  createOutputStyle,
  deleteOutputStyle,
  listOutputStyles,
  readOutputStyleForEditor,
  saveOutputStyle,
} from '../../services/claude-output-styles-writer.js';
import { createTypedHandler } from './run-helpers.js';
import type { HandlerRegistry } from './index.js';

/**
 * `claudeOutputStyles:*` IPC channels — list / read / create / save / delete
 * custom output styles under `.claude/output-styles/`. The list also reports
 * which style is currently active (built-in or custom) according to
 * `settings.json` / `settings.local.json`.
 */
export const claudeOutputStylesHandlers: HandlerRegistry = {
  'claudeOutputStyles:list': createTypedHandler((projectId: string): OutputStylesListResult => {
    const project = getProject(projectId);
    if (!project) {
      return { items: [], activeName: null, activeSource: 'none' };
    }
    return listOutputStyles(project.projectPath);
  }),

  'claudeOutputStyles:read': createTypedHandler(
    (projectId: string, name: string): OutputStyleFileContent | null => {
      const project = getProject(projectId);
      if (!project) return null;
      return readOutputStyleForEditor(project.projectPath, name);
    },
  ),

  'claudeOutputStyles:create': createTypedHandler(
    (projectId: string, request: CreateOutputStyleRequest): OutputStyleMutationResult => {
      const project = getProject(projectId);
      if (!project) {
        return {
          ok: false,
          code: 'project-not-found',
          message: `Project ${projectId} not found.`,
        };
      }
      return createOutputStyle(project.projectPath, request);
    },
  ),

  'claudeOutputStyles:save': createTypedHandler(
    (projectId: string, request: SaveOutputStyleRequest): OutputStyleMutationResult => {
      const project = getProject(projectId);
      if (!project) {
        return {
          ok: false,
          code: 'project-not-found',
          message: `Project ${projectId} not found.`,
        };
      }
      return saveOutputStyle(project.projectPath, request);
    },
  ),

  'claudeOutputStyles:delete': createTypedHandler(
    (projectId: string, name: string): OutputStyleMutationResult => {
      const project = getProject(projectId);
      if (!project) {
        return {
          ok: false,
          code: 'project-not-found',
          message: `Project ${projectId} not found.`,
        };
      }
      return deleteOutputStyle(project.projectPath, name);
    },
  ),
};
