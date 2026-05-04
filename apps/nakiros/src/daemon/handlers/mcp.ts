import { homedir } from 'os';
import { join, normalize } from 'path';

import type { McpAuditHistoryEntry, McpExpertMutationResult, McpReadResult } from '@nakiros/shared';

import { getProject } from '../../services/project-scanner.js';
import { readMcpConfig, saveMcpConfig } from '../../services/mcp-writer.js';
import { listMcpAudits, readMcpAudit } from '../../services/mcp-audit-history.js';
import { createTypedHandler } from './run-helpers.js';
import type { HandlerRegistry } from './index.js';

/**
 * `mcp:*` IPC channels for the `nakiros-mcp-expert` audit/fix/create flow.
 *
 * NOTE: These are DISTINCT from `claudeMcp:*` (Module 5 V2), which provide
 * a structured form-based editor for individual MCP servers. The `mcp:*`
 * channels expose a JSON-string-level read/save of the entire `.mcp.json`
 * file that the expert skill uses to read and rewrite the config as a whole.
 *
 * Channels registered:
 *   - `mcp:read`       — read the entire `.mcp.json` as pretty-printed JSON
 *   - `mcp:save`       — write the entire `.mcp.json` (no merge)
 *   - `mcp:listAudits` — list archived audit reports (newest-first)
 *   - `mcp:readAudit`  — read an archived audit markdown report
 */
export const mcpHandlers: HandlerRegistry = {
  'mcp:read': createTypedHandler((projectId: string): McpReadResult => {
    const project = getProject(projectId);
    if (!project) {
      return {
        content: '{}',
        mtime: '',
        exists: false,
        path: '',
      };
    }
    return readMcpConfig(project.projectPath);
  }),

  'mcp:save': createTypedHandler(
    (projectId: string, content: string, mtimeAtRead: string): McpExpertMutationResult => {
      const project = getProject(projectId);
      if (!project) {
        return { ok: false, code: 'project-not-found', message: `Project ${projectId} not found.` };
      }
      return saveMcpConfig(project.projectPath, content, mtimeAtRead);
    },
  ),

  'mcp:listAudits': createTypedHandler(
    (projectId: string): McpAuditHistoryEntry[] => listMcpAudits(projectId),
  ),

  'mcp:readAudit': createTypedHandler((path: string): string | null => {
    // Path-traversal guard — only allow paths under `~/.nakiros/<projectId>/mcp-audits/`.
    const root = normalize(join(homedir(), '.nakiros'));
    const norm = normalize(path);
    if (!norm.startsWith(root)) return null;
    return readMcpAudit(path);
  }),
};
