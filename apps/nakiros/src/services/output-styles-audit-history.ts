import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, normalize } from 'path';
import { homedir } from 'os';

import type { OutputStylesAuditHistoryEntry } from '@nakiros/shared';

/**
 * Persisted history of `.claude/output-styles/<styleName>` audits for a given
 * project, archived by `audit-runner.archiveReport` whenever a run carries an
 * `outputStylesTarget`.
 *
 * Storage layout — one sub-folder per style so the history stays organised
 * when a project has many styles:
 *
 *   ~/.nakiros/<projectId>/output-styles-audits/<styleName>/audit-<ISO>.md
 *
 * where `<styleName>` mirrors the relative path from `.claude/output-styles/`
 * with path separators replaced by `__` so directory names stay flat:
 *
 *   "minimal.md"                  → "minimal.md"
 *   "subdir/explanatory.md"       → "subdir__explanatory.md"
 */

/**
 * Encode a `styleName` (relative path from `.claude/output-styles/`) so it
 * can be used as a single directory-name component under
 * `output-styles-audits/`. Forward-slashes are replaced with `__`. A leading
 * or trailing slash is stripped first.
 */
function encodeStyleName(styleName: string): string {
  return styleName.replace(/^\/+|\/+$/g, '').replace(/\//g, '__');
}

function auditDirFor(projectId: string, styleName: string): string {
  return join(homedir(), '.nakiros', projectId, 'output-styles-audits', encodeStyleName(styleName));
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
 * Compute the archive directory path for `(projectId, styleName)`. Used by
 * `audit-runner` to locate the target directory when archiving.
 */
export function outputStylesAuditArchiveDir(projectId: string, styleName: string): string {
  return auditDirFor(projectId, styleName);
}

/**
 * Scan `~/.nakiros/<projectId>/output-styles-audits/<encoded-styleName>/` and
 * return the archived audits for that style, sorted newest-first.
 */
export function listOutputStylesAudits(
  projectId: string,
  styleName: string,
): OutputStylesAuditHistoryEntry[] {
  const dir = auditDirFor(projectId, styleName);
  if (!existsSync(dir)) return [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const out: OutputStylesAuditHistoryEntry[] = [];
  for (const name of entries) {
    const m = name.match(FILENAME_RE);
    if (!m) continue;
    const fullPath = join(dir, name);
    let sizeBytes = 0;
    try {
      const stat = statSync(fullPath);
      sizeBytes = stat.size;
    } catch {
      // Best-effort — ignore unreadable files.
    }
    out.push({
      path: fullPath,
      timestamp: decodeIsoFromFilename(m[1]!),
      sizeBytes,
    });
  }
  return out.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

/**
 * Read the markdown body of an archived output-styles audit. Returns `null`
 * when the path is unknown or escapes the expected `~/.nakiros/` prefix —
 * never trust a path coming from the renderer without bounding it.
 */
export function readOutputStylesAudit(absolutePath: string): string | null {
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
