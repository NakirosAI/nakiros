import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, normalize } from 'path';
import { homedir } from 'os';

import type { ConfigurationProvider, McpAuditHistoryEntry } from '@nakiros/shared';

/**
 * Persisted history of MCP audits for a given project, archived by
 * `audit-runner.archiveReport` whenever a run carries a `mcpTarget`.
 *
 * Singleton layout (mirrors hooks-audit-history — no sub-folder per name):
 *
 *   ~/.nakiros/<projectId>/mcp-audits/<provider>/audit-<ISO>.md
 *
 * The filename is the source of truth — we parse `<ISO>` from it instead of
 * re-reading every file.
 */

function auditRootFor(projectId: string): string {
  return join(homedir(), '.nakiros', projectId, 'mcp-audits');
}

function auditDirFor(projectId: string, provider: ConfigurationProvider): string {
  return join(auditRootFor(projectId), provider);
}

/**
 * The archive filename embeds an ISO timestamp where `:` and `.` were swapped
 * for `-` (see `isoSafeTimestamp` in audit-runner). This reverses that
 * substitution for display/sort. Example:
 *
 *   "audit-2026-05-04T14-22-03" → "2026-05-04T14:22:03Z"
 */
function decodeIsoFromFilename(stamp: string): string {
  if (stamp.length < 19) return stamp;
  const date = stamp.slice(0, 10);
  const time = stamp.slice(11, 19).replace(/-/g, ':');
  return `${date}T${time}Z`;
}

const FILENAME_RE = /^audit-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})\.md$/;

/**
 * Compute the archive directory path for `projectId`. Used by `audit-runner`
 * to locate the target directory when archiving a MCP audit report.
 */
export function mcpAuditArchiveDir(
  projectId: string,
  provider: ConfigurationProvider = 'claude',
): string {
  return auditDirFor(projectId, provider);
}

/**
 * Scan `~/.nakiros/<projectId>/mcp-audits/` and return the archived audits
 * sorted newest-first.
 */
export function listMcpAudits(
  projectId: string,
  provider: ConfigurationProvider = 'claude',
): McpAuditHistoryEntry[] {
  const dirs = [auditDirFor(projectId, provider)];
  // Before provider-aware Hestia, Claude reports lived directly in
  // `mcp-audits/`. Keep them visible without ever mixing them into Codex.
  if (provider === 'claude') dirs.push(auditRootFor(projectId));

  const out: McpAuditHistoryEntry[] = [];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    out.push(...listAuditFiles(dir));
  }
  return out.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

function listAuditFiles(dir: string): McpAuditHistoryEntry[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const out: McpAuditHistoryEntry[] = [];
  for (const name of entries) {
    const m = name.match(FILENAME_RE);
    if (!m) continue;
    const fullPath = join(dir, name);
    let sizeBytes = 0;
    try {
      sizeBytes = statSync(fullPath).size;
    } catch {
      // Best-effort.
    }
    out.push({
      path: fullPath,
      timestamp: decodeIsoFromFilename(m[1]),
      sizeBytes,
    });
  }
  return out;
}

/**
 * Read the markdown body of an archived MCP audit. Returns `null` when the
 * path is unknown or escapes the expected `~/.nakiros/` prefix — never trust
 * a path coming from the renderer without bounding it.
 */
export function readMcpAudit(absolutePath: string): string | null {
  const root = normalize(join(homedir(), '.nakiros'));
  if (!normalize(absolutePath).startsWith(root)) return null;
  if (!existsSync(absolutePath)) return null;
  try {
    const stat = statSync(absolutePath);
    if (!stat.isFile()) return null;
    return readFileSync(absolutePath, 'utf8');
  } catch {
    return null;
  }
}
