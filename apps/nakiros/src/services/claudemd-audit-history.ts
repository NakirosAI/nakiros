import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

import type { ClaudeMdAuditHistoryEntry, ConfigurationProvider } from '@nakiros/shared';

/**
 * Persisted history of CLAUDE.md audits for a given project, archived by
 * `audit-runner.archiveReport` whenever a run carries a `claudemdTarget`.
 *
 * Storage layout (mirror of the centralised `~/.nakiros/` convention):
 *
 *   ~/.nakiros/<projectId>/claudemd/audit/audit-<ISO>.md
 *
 * The filename is the source of truth — we parse `<ISO>` from it instead of
 * re-reading every file. The score (if any) is extracted from the markdown
 * body via a single regex over the first ~50 lines.
 */

function legacyAuditDirFor(projectId: string): string {
  return join(homedir(), '.nakiros', projectId, 'claudemd', 'audit');
}

function auditDirFor(projectId: string, provider: ConfigurationProvider): string {
  return join(homedir(), '.nakiros', projectId, 'instructions', provider, 'audit');
}

export function claudemdAuditArchiveDir(
  projectId: string,
  provider: ConfigurationProvider = 'claude',
): string {
  return auditDirFor(projectId, provider);
}

/**
 * The archive filename embeds an ISO timestamp where `:` and `.` were swapped
 * for `-` (see `isoSafeTimestamp` in audit-runner). This reverses that
 * substitution for display/sort. Example:
 *
 *   "audit-root-2026-05-03T13-49-18" → "2026-05-03T13:49:18Z"
 */
function decodeIsoFromFilename(stamp: string): string {
  // The runner strips milliseconds + replaces `:` and `.` with `-` then
  // takes the leading 19 chars. Re-inserting `:` at positions 13 and 16
  // (T13-49-18 → T13:49:18) restores a parsable ISO string.
  if (stamp.length < 19) return stamp;
  const date = stamp.slice(0, 10);
  const time = stamp.slice(11, 19).replace(/-/g, ':');
  return `${date}T${time}Z`;
}

const FILENAME_RE = /^audit-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})\.md$/;

function extractScore(body: string): string | null {
  // Search the first ~80 lines so a long report doesn't slow us down.
  const head = body.split('\n', 80).join('\n');
  // The expert template writes `**Score**: \`X/18\`` — accept variants.
  const m = head.match(/\*\*Score\*\*:\s*`?(\d+\/\d+)`?/i);
  return m ? m[1] : null;
}

/**
 * Scan `~/.nakiros/<projectId>/claudemd/audit/` and return the archived
 * audits sorted newest-first.
 */
export function listClaudemdAudits(
  projectId: string,
  provider: ConfigurationProvider = 'claude',
): ClaudeMdAuditHistoryEntry[] {
  const dirs = [auditDirFor(projectId, provider)];
  if (provider === 'claude') dirs.push(legacyAuditDirFor(projectId));
  const out = dirs.flatMap((dir) => listAuditFiles(dir));
  return out.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

function listAuditFiles(dir: string): ClaudeMdAuditHistoryEntry[] {
  if (!existsSync(dir)) return [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const out: ClaudeMdAuditHistoryEntry[] = [];
  for (const name of entries) {
    const m = name.match(FILENAME_RE);
    if (!m) continue;
    const fullPath = join(dir, name);
    let score: string | null = null;
    try {
      const head = readFileSync(fullPath, 'utf8');
      score = extractScore(head);
    } catch {
      // Best-effort — ignore unreadable files.
    }
    out.push({
      path: fullPath,
      timestamp: decodeIsoFromFilename(m[1]),
      score,
    });
  }
  return out;
}

/**
 * Read the markdown body of an archived audit. Returns `null` when the path
 * is unknown or escapes the expected `~/.nakiros/<projectId>/claudemd/audit/`
 * prefix — never trust a path coming from the renderer without bounding it.
 */
export function readClaudemdAudit(absolutePath: string): string | null {
  // Defence in depth: only allow paths under `~/.nakiros/`.
  const root = join(homedir(), '.nakiros');
  if (!absolutePath.startsWith(root)) return null;
  if (!existsSync(absolutePath)) return null;
  try {
    const stat = statSync(absolutePath);
    if (!stat.isFile()) return null;
    return readFileSync(absolutePath, 'utf8');
  } catch {
    return null;
  }
}
