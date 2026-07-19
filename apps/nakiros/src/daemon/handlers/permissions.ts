import { homedir } from 'os';
import { join, normalize } from 'path';

import type {
  ConfigurationProvider,
  PermissionsAuditHistoryEntry,
  PermissionsExpertMutationResult,
  PermissionsExpertScope,
  PermissionsReadResult,
} from '@nakiros/shared';

import { getProject } from '../../services/project-scanner.js';
import { readPermissionsBlock, savePermissionsBlock } from '../../services/permissions-writer.js';
import { listPermissionsAudits, readPermissionsAudit } from '../../services/permissions-audit-history.js';
import { createTypedHandler } from './run-helpers.js';
import type { HandlerRegistry } from './index.js';

/** Coerce an unknown scope value to a valid `PermissionsExpertScope`. */
function toScope(raw: unknown): PermissionsExpertScope {
  return raw === 'local' ? 'local' : 'project';
}

/**
 * `permissions:*` IPC channels for the `nakiros-permissions-expert`
 * audit/fix/create flow.
 *
 * NOTE: These are DISTINCT from `claudePermissions:*` (Module 4 V2), which
 * provide a structured form-based editor for the full permissions object.
 * The `permissions:*` channels expose a JSON-string-level read/save that the
 * expert skill uses to read and rewrite the permissions block as a whole.
 *
 * All channels now accept a `scope` argument (`'project'` | `'local'`) so the
 * frontend toggle can target either `settings.json` or `settings.local.json`.
 *
 * Channels registered:
 *   - `permissions:read`       — read the permissions block from the scoped file
 *   - `permissions:save`       — merge a new permissions block into the scoped file
 *   - `permissions:listAudits` — list archived audit reports for the given scope
 *   - `permissions:readAudit`  — read an archived audit markdown report (unchanged)
 */
export const permissionsHandlers: HandlerRegistry = {
  'permissions:read': createTypedHandler(
    (projectId: string, scope: unknown): PermissionsReadResult => {
      const project = getProject(projectId);
      if (!project) {
        return {
          content: '{}',
          mtime: '',
          exists: false,
          path: '',
        };
      }
      return readPermissionsBlock(project.projectPath, toScope(scope));
    },
  ),

  'permissions:save': createTypedHandler(
    (projectId: string, scope: unknown, content: string, mtimeAtRead: string): PermissionsExpertMutationResult => {
      const project = getProject(projectId);
      if (!project) {
        return { ok: false, code: 'project-not-found', message: `Project ${projectId} not found.` };
      }
      return savePermissionsBlock(project.projectPath, toScope(scope), content, mtimeAtRead);
    },
  ),

  'permissions:listAudits': createTypedHandler(
    (projectId: string, scope: unknown, provider?: ConfigurationProvider): PermissionsAuditHistoryEntry[] =>
      listPermissionsAudits(projectId, toScope(scope), provider),
  ),

  'permissions:readAudit': createTypedHandler((path: string): string | null => {
    // Path-traversal guard — only allow paths under `~/.nakiros/<any>/permissions-audits/`.
    const root = normalize(join(homedir(), '.nakiros'));
    const norm = normalize(path);
    if (!norm.startsWith(root)) return null;
    return readPermissionsAudit(path);
  }),
};
