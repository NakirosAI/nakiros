import type {
  CreateMcpServerRequest,
  McpInfo,
  McpMutationResult,
  McpServerForEditor,
  SaveMcpServerRequest,
} from '@nakiros/shared';

import { getProject } from '../../services/project-scanner.js';
import { scanClaudeConfig } from '../../services/claude-config-reader.js';
import {
  createMcpServer,
  deleteMcpServer,
  readMcpServerForEditor,
  saveMcpServer,
} from '../../services/claude-mcp-writer.js';
import { createTypedHandler } from './run-helpers.js';
import type { HandlerRegistry } from './index.js';

/**
 * `claudeMcp:*` IPC channels — list / read / create / save / delete entries
 * in the project's `.mcp.json`. The list reuses the project-wide scan; the
 * other channels operate on one server at a time but rewrite the whole
 * file atomically with a top-level mtime guard.
 */
export const claudeMcpHandlers: HandlerRegistry = {
  'claudeMcp:list': createTypedHandler((projectId: string): McpInfo => {
    const project = getProject(projectId);
    if (!project) {
      return {
        present: false,
        count: 0,
        path: '',
        lastModified: null,
        items: [],
      };
    }
    return scanClaudeConfig(project.projectPath).mcp;
  }),

  'claudeMcp:read': createTypedHandler(
    (projectId: string, name: string): McpServerForEditor | null => {
      const project = getProject(projectId);
      if (!project) return null;
      return readMcpServerForEditor(project.projectPath, name);
    },
  ),

  'claudeMcp:create': createTypedHandler(
    (projectId: string, request: CreateMcpServerRequest): McpMutationResult => {
      const project = getProject(projectId);
      if (!project) {
        return {
          ok: false,
          code: 'project-not-found',
          message: `Project ${projectId} not found.`,
        };
      }
      return createMcpServer(project.projectPath, request);
    },
  ),

  'claudeMcp:save': createTypedHandler(
    (projectId: string, request: SaveMcpServerRequest): McpMutationResult => {
      const project = getProject(projectId);
      if (!project) {
        return {
          ok: false,
          code: 'project-not-found',
          message: `Project ${projectId} not found.`,
        };
      }
      return saveMcpServer(project.projectPath, request);
    },
  ),

  'claudeMcp:delete': createTypedHandler(
    (projectId: string, name: string, mtimeAtRead: string): McpMutationResult => {
      const project = getProject(projectId);
      if (!project) {
        return {
          ok: false,
          code: 'project-not-found',
          message: `Project ${projectId} not found.`,
        };
      }
      return deleteMcpServer(project.projectPath, name, mtimeAtRead);
    },
  ),
};
