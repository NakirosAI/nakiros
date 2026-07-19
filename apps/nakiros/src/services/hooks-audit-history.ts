import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, normalize } from 'path';
import { homedir } from 'os';

import type { ConfigurationProvider, HooksAuditHistoryEntry } from '@nakiros/shared';

/**
 * Persisted history of hooks audits for a given project, archived by
 * `audit-runner.archiveReport` whenever a run carries a `hooksTarget`.
 *
 * Singleton layout (mirrors claudemd-audit-history — no sub-folder per name):
 *
 *   ~/.nakiros/<projectId>/hooks-audits/audit-<ISO>.md
 *
 * The filename is the source of truth — we parse `<ISO>` from it instead of
 * re-reading every file.
 */

function auditDirFor(projectId: string, provider: ConfigurationProvider): string {
  const providerSegments = provider === 'codex' ? ['codex'] : [];
  return join(homedir(), '.nakiros', projectId, 'hooks-audits', ...providerSegments);
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
 * to locate the target directory when archiving a hooks audit report.
 */
export function hooksAuditArchiveDir(
  projectId: string,
  provider: ConfigurationProvider = 'claude',
): string {
  return auditDirFor(projectId, provider);
}

/**
 * Scan `~/.nakiros/<projectId>/hooks-audits/` and return the archived
 * audits sorted newest-first.
 */
export function listHooksAudits(
  projectId: string,
  provider: ConfigurationProvider = 'claude',
): HooksAuditHistoryEntry[] {
  const dir = auditDirFor(projectId, provider);
  if (!existsSync(dir)) return [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const out: HooksAuditHistoryEntry[] = [];
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
  return out.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

/**
 * Read the markdown body of an archived hooks audit. Returns `null` when the
 * path is unknown or escapes the expected `~/.nakiros/` prefix — never trust
 * a path coming from the renderer without bounding it.
 */
export function readHooksAudit(absolutePath: string): string | null {
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
