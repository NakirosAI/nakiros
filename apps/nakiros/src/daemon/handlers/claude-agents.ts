import type {
  AgentEntry,
  AgentFileContent,
  AgentMutationResult,
  CreateAgentRequest,
  SaveAgentRequest,
} from '@nakiros/shared';

import { getProject } from '../../services/project-scanner.js';
import { scanClaudeConfig } from '../../services/claude-config-reader.js';
import {
  createAgent,
  deleteAgent,
  readAgentForEditor,
  saveAgent,
} from '../../services/claude-agents-writer.js';
import { createTypedHandler } from './run-helpers.js';
import type { HandlerRegistry } from './index.js';

/**
 * `claudeAgents:*` IPC channels — list / read / create / save / delete
 * subagent markdown files under `.claude/agents/`.
 *
 * `list` returns the metadata-only entries built by the project-wide scan;
 * `read` returns the full content (raw frontmatter + body + parsed essentials)
 * needed by the editor; `save` validates that the new frontmatter parses as
 * YAML before atomic write.
 */
export const claudeAgentsHandlers: HandlerRegistry = {
  'claudeAgents:list': createTypedHandler((projectId: string): AgentEntry[] => {
    const project = getProject(projectId);
    if (!project) return [];
    return scanClaudeConfig(project.projectPath).agents.items;
  }),

  'claudeAgents:read': createTypedHandler(
    (projectId: string, name: string): AgentFileContent | null => {
      const project = getProject(projectId);
      if (!project) return null;
      return readAgentForEditor(project.projectPath, name);
    },
  ),

  'claudeAgents:create': createTypedHandler(
    (projectId: string, request: CreateAgentRequest): AgentMutationResult => {
      const project = getProject(projectId);
      if (!project) {
        return {
          ok: false,
          code: 'project-not-found',
          message: `Project ${projectId} not found.`,
        };
      }
      return createAgent(project.projectPath, request);
    },
  ),

  'claudeAgents:save': createTypedHandler(
    (projectId: string, request: SaveAgentRequest): AgentMutationResult => {
      const project = getProject(projectId);
      if (!project) {
        return {
          ok: false,
          code: 'project-not-found',
          message: `Project ${projectId} not found.`,
        };
      }
      return saveAgent(project.projectPath, request);
    },
  ),

  'claudeAgents:delete': createTypedHandler(
    (projectId: string, name: string): AgentMutationResult => {
      const project = getProject(projectId);
      if (!project) {
        return {
          ok: false,
          code: 'project-not-found',
          message: `Project ${projectId} not found.`,
        };
      }
      return deleteAgent(project.projectPath, name);
    },
  ),
};
