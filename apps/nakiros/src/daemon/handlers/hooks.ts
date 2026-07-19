import { homedir } from 'os';
import { join, normalize } from 'path';

import type {
  ConfigurationProvider,
  HooksAuditHistoryEntry,
  HooksExpertMutationResult,
  HooksReadResult,
} from '@nakiros/shared';

import { getProject } from '../../services/project-scanner.js';
import { readHooksBlock, saveHooksBlock } from '../../services/hooks-writer.js';
import { listHooksAudits, readHooksAudit } from '../../services/hooks-audit-history.js';
import { createTypedHandler } from './run-helpers.js';
import type { HandlerRegistry } from './index.js';

/**
 * `hooks:*` IPC channels for the `nakiros-hooks-expert` audit/fix/create flow.
 *
 * NOTE: These are DISTINCT from `claudeHooks:*` (Module 6 V2), which provide
 * a structured editor for the full hooks object per scope. The `hooks:*`
 * channels expose a JSON-string-level read/save that the expert skill uses to
 * read and rewrite the hooks block as a whole.
 *
 * Channels registered:
 *   - `hooks:read`       — read the hooks block as pretty-printed JSON
 *   - `hooks:save`       — merge a new hooks block into settings.json
 *   - `hooks:listAudits` — list archived audit reports (newest-first)
 *   - `hooks:readAudit`  — read an archived audit markdown report
 */
export const hooksHandlers: HandlerRegistry = {
  'hooks:read': createTypedHandler((projectId: string): HooksReadResult => {
    const project = getProject(projectId);
    if (!project) {
      return {
        content: '{}',
        mtime: '',
        exists: false,
        path: '',
      };
    }
    return readHooksBlock(project.projectPath);
  }),

  'hooks:save': createTypedHandler(
    (projectId: string, content: string, mtimeAtRead: string): HooksExpertMutationResult => {
      const project = getProject(projectId);
      if (!project) {
        return { ok: false, code: 'project-not-found', message: `Project ${projectId} not found.` };
      }
      return saveHooksBlock(project.projectPath, content, mtimeAtRead);
    },
  ),

  'hooks:listAudits': createTypedHandler(
    (projectId: string, provider?: ConfigurationProvider): HooksAuditHistoryEntry[] =>
      listHooksAudits(projectId, provider),
  ),

  'hooks:readAudit': createTypedHandler((path: string): string | null => {
    // Path-traversal guard — only allow paths under `~/.nakiros/<projectId>/hooks-audits/`.
    const root = normalize(join(homedir(), '.nakiros'));
    const norm = normalize(path);
    if (!norm.startsWith(root)) return null;
    return readHooksAudit(path);
  }),
};
