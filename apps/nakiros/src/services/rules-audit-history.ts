import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, normalize } from 'path';
import { homedir } from 'os';

import type { ConfigurationProvider, RulesAuditHistoryEntry } from '@nakiros/shared';

/**
 * Persisted history of `.claude/rules/<ruleName>` audits for a given project,
 * archived by `audit-runner.archiveReport` whenever a run carries a
 * `rulesTarget`.
 *
 * Storage layout — one sub-folder per rule so the history stays organised
 * when a project has many rules:
 *
 *   ~/.nakiros/<projectId>/rules-audits/<ruleName>/audit-<ISO>.md
 *
 * where `<ruleName>` mirrors the relative path from `.claude/rules/` with
 * path separators replaced by `__` so directory names stay flat:
 *
 *   "i18n.md"               → "i18n.md"
 *   "frontend/styling.md"   → "frontend__styling.md"
 */

/**
 * Encode a `ruleName` (relative path from `.claude/rules/`) so it can be
 * used as a single directory-name component under `rules-audits/`.
 * Forward-slashes are replaced with `__`. A leading or trailing slash is
 * stripped first.
 */
function encodeRuleName(ruleName: string): string {
  return ruleName.replace(/^\/+|\/+$/g, '').replace(/\//g, '__');
}

function auditDirFor(projectId: string, ruleName: string, provider: ConfigurationProvider): string {
  const providerSegments = provider === 'codex' ? ['codex'] : [];
  return join(homedir(), '.nakiros', projectId, 'rules-audits', ...providerSegments, encodeRuleName(ruleName));
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

function extractScore(body: string): string | null {
  const head = body.split('\n', 80).join('\n');
  const m = head.match(/\*\*Score\*\*:\s*`?(\d+\/\d+)`?/i);
  return m ? m[1] : null;
}

/**
 * Compute the archive directory path for `(projectId, ruleName)`. Used by
 * `audit-runner` to locate the target directory when archiving.
 */
export function rulesAuditArchiveDir(
  projectId: string,
  ruleName: string,
  provider: ConfigurationProvider = 'claude',
): string {
  return auditDirFor(projectId, ruleName, provider);
}

/**
 * Scan `~/.nakiros/<projectId>/rules-audits/<encoded-ruleName>/` and return
 * the archived audits for that rule, sorted newest-first.
 */
export function listRulesAudits(
  projectId: string,
  ruleName: string,
  provider: ConfigurationProvider = 'claude',
): RulesAuditHistoryEntry[] {
  const dir = auditDirFor(projectId, ruleName, provider);
  if (!existsSync(dir)) return [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const out: RulesAuditHistoryEntry[] = [];
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
  return out.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

/**
 * Read the markdown body of an archived rules audit. Returns `null` when the
 * path is unknown or escapes the expected `~/.nakiros/` prefix — never trust
 * a path coming from the renderer without bounding it.
 */
export function readRulesAudit(absolutePath: string): string | null {
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
