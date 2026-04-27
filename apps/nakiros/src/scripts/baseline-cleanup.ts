import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { getNakirosDir } from '../utils/nakiros-dir.js';

/**
 * Locations to scan for legacy iteration- N/eval- name/without_skill/
 * directories. Project skills aren't covered automatically — they live
 * anywhere on disk; the user can re-run the script with explicit paths
 * when this becomes a need.
 */
function defaultScanRoots(): string[] {
  const roots: string[] = [];
  const userSkills = join(getNakirosDir(), 'skills');
  if (existsSync(userSkills)) roots.push(userSkills);
  const bundled = join(process.cwd(), 'apps', 'nakiros', 'bundled-skills');
  if (existsSync(bundled)) roots.push(bundled);
  return roots;
}

interface OrphanDir {
  /** Absolute path to the without_skill dir. */
  path: string;
  /** Aggregate byte size — best-effort, computed by walking the tree. */
  bytes: number;
}

function dirSize(path: string): number {
  let total = 0;
  let entries: import('node:fs').Dirent[] = [];
  try {
    entries = readdirSync(path, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const child = join(path, entry.name);
    try {
      if (entry.isDirectory()) {
        total += dirSize(child);
      } else if (entry.isFile()) {
        total += statSync(child).size;
      }
    } catch {
      // best-effort
    }
  }
  return total;
}

/**
 * Walk a skill directory and return every legacy without_skill directory
 * found inside its evals workspace.
 */
function findOrphansInSkill(skillDir: string): OrphanDir[] {
  const out: OrphanDir[] = [];
  const workspaceDir = join(skillDir, 'evals', 'workspace');
  if (!existsSync(workspaceDir)) return out;

  let iterDirs: import('node:fs').Dirent[] = [];
  try {
    iterDirs = readdirSync(workspaceDir, { withFileTypes: true });
  } catch {
    return out;
  }

  for (const iter of iterDirs) {
    if (!iter.isDirectory() || !iter.name.startsWith('iteration-')) continue;
    const iterPath = join(workspaceDir, iter.name);
    let evalDirs: import('node:fs').Dirent[] = [];
    try {
      evalDirs = readdirSync(iterPath, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const evalEntry of evalDirs) {
      if (!evalEntry.isDirectory() || !evalEntry.name.startsWith('eval-')) continue;
      const candidate = join(iterPath, evalEntry.name, 'without_skill');
      if (!existsSync(candidate)) continue;
      out.push({ path: candidate, bytes: dirSize(candidate) });
    }
  }
  return out;
}

/**
 * Scan a root for any nested skill directory and aggregate orphans across
 * all of them. Used to walk ~/.nakiros/skills/ and bundled-skills/.
 */
function scanRoot(root: string): OrphanDir[] {
  const out: OrphanDir[] = [];
  let entries: import('node:fs').Dirent[] = [];
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillDir = join(root, entry.name);
    out.push(...findOrphansInSkill(skillDir));
  }
  return out;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

const HELP_TEXT =
  '\nnakiros baseline:cleanup - remove legacy without_skill/ run dirs.\n' +
  '\n' +
  'The per-model baseline cache (introduced in 0.7) made these directories\n' +
  'redundant: the canonical baseline now lives under ~/.nakiros/baselines/.\n' +
  'Running this command frees disk space at the cost of losing drill-down\n' +
  'on those specific baseline runs.\n' +
  '\n' +
  'Usage:\n' +
  '  nakiros baseline:cleanup            # dry-run, prints report\n' +
  '  nakiros baseline:cleanup --apply    # actually delete\n' +
  '  nakiros baseline:cleanup --help     # this help\n' +
  '\n' +
  'Scan roots:\n' +
  '  ~/.nakiros/skills/\n' +
  '  ./apps/nakiros/bundled-skills/  (when run from the monorepo root)\n';

/**
 * Entry point invoked by `nakiros baseline:cleanup`. Prints a report of
 * every legacy without_skill directory found under the default scan roots
 * and, when `--apply` is passed, removes them. Drill-down on those
 * iterations' baselines is lost in exchange — but the canonical baseline
 * data already lives in ~/.nakiros/baselines/ since the per-model cache.
 *
 * Exit codes:
 *  - 0: success (nothing to do, or apply succeeded, or dry-run completed)
 *  - 1: deletions partially failed
 */
export async function runBaselineCleanup(args: string[]): Promise<number> {
  const apply = args.includes('--apply');
  const help = args.includes('-h') || args.includes('--help');

  if (help) {
    process.stdout.write(HELP_TEXT);
    return 0;
  }

  const roots = defaultScanRoots();
  if (roots.length === 0) {
    process.stdout.write('No skill directories to scan. Nothing to do.\n');
    return 0;
  }

  const orphans: OrphanDir[] = [];
  for (const root of roots) {
    orphans.push(...scanRoot(root));
  }

  if (orphans.length === 0) {
    process.stdout.write('No legacy without_skill/ directories found. You are clean.\n');
    return 0;
  }

  const totalBytes = orphans.reduce((s, o) => s + o.bytes, 0);
  process.stdout.write(
    'Found ' + orphans.length + ' legacy without_skill/ directories (' +
    formatBytes(totalBytes) + ' total).\n\n',
  );
  for (const o of orphans) {
    process.stdout.write('  ' + formatBytes(o.bytes).padStart(8) + '  ' + o.path + '\n');
  }
  process.stdout.write('\n');

  if (!apply) {
    process.stdout.write(
      'Dry-run only. Re-run with --apply to delete these directories.\n',
    );
    return 0;
  }

  let removed = 0;
  let failed = 0;
  for (const o of orphans) {
    try {
      rmSync(o.path, { recursive: true, force: true });
      removed++;
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write('Failed to delete ' + o.path + ': ' + msg + '\n');
    }
  }

  const failureSuffix = failed > 0 ? ', ' + failed + ' failure(s)' : '';
  process.stdout.write(
    'Removed ' + removed + '/' + orphans.length + ' directories (freed ' +
    formatBytes(totalBytes) + ')' + failureSuffix + '.\n',
  );
  return failed > 0 ? 1 : 0;
}
