import { getProject } from '../../services/project-scanner.js';
import {
  readClaudeConfigFile,
  scanClaudeConfig,
} from '../../services/claude-config-reader.js';
import { createTypedHandler } from './run-helpers.js';
import type { HandlerRegistry } from './index.js';

/**
 * Registers the `claudeConfig:*` IPC channels — read-only V1 of the
 * Configuration tab.
 *
 * Channels:
 * - `claudeConfig:scan` — produce a `ClaudeConfigSnapshot` of a project's
 *   `.claude/` (CLAUDE.md, settings, rules, skills count, commands, output
 *   styles, subagents, MCP, hooks).
 * - `claudeConfig:readFile` — read any file inside `.claude/` (or `.mcp.json`
 *   at the project root) by relative path. Returns `null` on missing file or
 *   path-traversal attempt.
 */
export const claudeConfigHandlers: HandlerRegistry = {
  'claudeConfig:scan': createTypedHandler((projectId: string) => {
    const project = getProject(projectId);
    if (!project) return null;
    return scanClaudeConfig(project.projectPath);
  }),

  'claudeConfig:readFile': createTypedHandler(
    (projectId: string, relativePath: string) => {
      const project = getProject(projectId);
      if (!project) return null;
      return readClaudeConfigFile(project.projectPath, relativePath);
    },
  ),
};
