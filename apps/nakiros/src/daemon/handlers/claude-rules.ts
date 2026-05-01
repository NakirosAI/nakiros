import type {
  CreateRuleRequest,
  RuleEntry,
  RuleFileContent,
  RuleMutationResult,
  SaveRuleRequest,
} from '@nakiros/shared';

import { getProject } from '../../services/project-scanner.js';
import { scanClaudeConfig } from '../../services/claude-config-reader.js';
import {
  createRule,
  deleteRule,
  readRuleForEditor,
  saveRule,
} from '../../services/claude-rules-writer.js';
import { suggestRulePaths } from '../../services/path-suggester.js';
import { createTypedHandler } from './run-helpers.js';
import type { HandlerRegistry } from './index.js';

/**
 * `claudeRules:*` IPC channels — list, read, create, save, delete rule files
 * under `.claude/rules/`. The `read` and `save` pair carries an mtime token
 * to detect external modifications.
 *
 * `list` reuses the project-wide `scanClaudeConfig` and returns just the
 * rules slice — kept as a dedicated channel so callers don't pull the full
 * snapshot when they only need rules.
 */
export const claudeRulesHandlers: HandlerRegistry = {
  'claudeRules:list': createTypedHandler((projectId: string): RuleEntry[] => {
    const project = getProject(projectId);
    if (!project) return [];
    return scanClaudeConfig(project.projectPath).rules.items;
  }),

  'claudeRules:read': createTypedHandler(
    (projectId: string, name: string): RuleFileContent | null => {
      const project = getProject(projectId);
      if (!project) return null;
      return readRuleForEditor(project.projectPath, name);
    },
  ),

  'claudeRules:create': createTypedHandler(
    (projectId: string, request: CreateRuleRequest): RuleMutationResult => {
      const project = getProject(projectId);
      if (!project) {
        return {
          ok: false,
          code: 'project-not-found',
          message: `Project ${projectId} not found.`,
        };
      }
      return createRule(project.projectPath, request);
    },
  ),

  'claudeRules:save': createTypedHandler(
    (projectId: string, request: SaveRuleRequest): RuleMutationResult => {
      const project = getProject(projectId);
      if (!project) {
        return {
          ok: false,
          code: 'project-not-found',
          message: `Project ${projectId} not found.`,
        };
      }
      return saveRule(project.projectPath, request);
    },
  ),

  'claudeRules:delete': createTypedHandler(
    (projectId: string, name: string): RuleMutationResult => {
      const project = getProject(projectId);
      if (!project) {
        return {
          ok: false,
          code: 'project-not-found',
          message: `Project ${projectId} not found.`,
        };
      }
      return deleteRule(project.projectPath, name);
    },
  ),

  'claudeRules:suggestPaths': createTypedHandler((projectId: string): string[] => {
    const project = getProject(projectId);
    if (!project) return [];
    return suggestRulePaths(project.projectPath);
  }),
};
