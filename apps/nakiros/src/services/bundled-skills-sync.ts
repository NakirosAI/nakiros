import { createHash } from 'crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { dirname, join, resolve } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'node:url';
import type {
  BundledSkillConflict,
  BundledSkillConflictFileDiff,
  BundledSkillConflictResolution,
} from '@nakiros/shared';

/**
 * Where Nakiros owns its skills on disk.
 * ROM = apps/nakiros/bundled-skills (source in the repo, or packaged with the
 *       published npm tarball in prod)
 * Nakiros home = ~/.nakiros/skills/{name} (the live, editable copy Nakiros operates on)
 * Claude home = ~/.claude/skills/{name} (symlink → Nakiros home so Claude Code discovers it)
 */
const NAKIROS_SKILLS_DIR = join(homedir(), '.nakiros', 'skills');
const CLAUDE_SKILLS_DIR = join(homedir(), '.claude', 'skills');
const SYNC_MANIFEST_PATH = join(NAKIROS_SKILLS_DIR, '.sync-manifest.json');

/**
 * Subdirectories that belong to the user — never touched by ROM syncs.
 * (audit reports, eval runs, outputs accumulated by the user.)
 */
const USER_OWNED_DIRS = new Set(['audits', 'workspace', 'outputs']);
const USER_OWNED_EVAL_DIRS = new Set(['workspace']);

const __dirname = dirname(fileURLToPath(import.meta.url));

function getBundledSkillsRomDir(): string {
  const candidates = [
    // Prod: `dist/services/` → package root: climb 2 levels to reach `bundled-skills/`
    resolve(__dirname, '../../bundled-skills'),
    // Dev (tsx): `src/services/` → app root: climb 2 levels to reach `bundled-skills/`
    resolve(__dirname, '../../bundled-skills'),
    // Monorepo root fallback (e.g. running from repo root)
    resolve(process.cwd(), 'apps/nakiros/bundled-skills'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

function getNakirosVersion(): string {
  // dist/services/*.js → ../../package.json   AND   src/services/*.ts → ../../package.json
  const candidates = [
    resolve(__dirname, '../../package.json'),
    resolve(process.cwd(), 'apps/nakiros/package.json'),
  ];
  for (const pkgPath of candidates) {
    if (!existsSync(pkgPath)) continue;
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string };
      if (pkg.version) return pkg.version;
    } catch {
      // try next
    }
  }
  return 'unknown';
}

// ─── Manifest ────────────────────────────────────────────────────────────────

interface SyncManifestEntry {
  /** Hash of ROM-owned files when we last synced with the user's agreement. */
  romHash: string;
  /** File-level hashes of the ROM at that same moment (NOT of the user's live copy). */
  fileHashes: Record<string, string>;
  /** Nakiros npm version at last sync. */
  version: string;
  syncedAt: string;
}

type SyncManifest = Record<string, SyncManifestEntry>;

function readManifest(): SyncManifest {
  if (!existsSync(SYNC_MANIFEST_PATH)) return {};
  try {
    return JSON.parse(readFileSync(SYNC_MANIFEST_PATH, 'utf8')) as SyncManifest;
  } catch {
    return {};
  }
}

function writeManifest(manifest: SyncManifest): void {
  mkdirSync(NAKIROS_SKILLS_DIR, { recursive: true });
  writeFileSync(SYNC_MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');
}

// ─── Hashing ─────────────────────────────────────────────────────────────────

function isPathUserOwned(relPath: string): boolean {
  const [first, second] = relPath.split('/');
  if (first && USER_OWNED_DIRS.has(first)) return true;
  if (first === 'evals' && second && USER_OWNED_EVAL_DIRS.has(second)) return true;
  return false;
}

function listRomFiles(skillDir: string): string[] {
  const results: string[] = [];
  function walk(dir: string, prefix: string): void {
    let entries: import('fs').Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true }) as import('fs').Dirent[];
    } catch {
      return;
    }
    for (const entry of entries) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (isPathUserOwned(rel)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, rel);
      } else if (entry.isFile()) {
        results.push(rel);
      }
    }
  }
  walk(skillDir, '');
  results.sort();
  return results;
}

function hashFile(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function hashSkillFiles(skillDir: string, files: string[]): { total: string; perFile: Record<string, string> } {
  const perFile: Record<string, string> = {};
  const agg = createHash('sha256');
  for (const rel of files) {
    const full = join(skillDir, rel);
    if (!existsSync(full)) continue;
    const h = hashFile(full);
    perFile[rel] = h;
    agg.update(rel).update('\0').update(h).update('\0');
  }
  return { total: agg.digest('hex'), perFile };
}

// ─── Copy helpers ────────────────────────────────────────────────────────────

function copyDirSync(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  const entries = readdirSync(src, { withFileTypes: true }) as import('fs').Dirent[];
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      writeFileSync(destPath, readFileSync(srcPath));
    }
  }
}

function copyRomOnly(romDir: string, liveDir: string): void {
  const files = listRomFiles(romDir);
  for (const rel of files) {
    const from = join(romDir, rel);
    const to = join(liveDir, rel);
    mkdirSync(dirname(to), { recursive: true });
    writeFileSync(to, readFileSync(from));
  }
}

function ensureClaudeSymlink(skillName: string): void {
  const nakirosSkill = join(NAKIROS_SKILLS_DIR, skillName);
  const claudeSkillLink = join(CLAUDE_SKILLS_DIR, skillName);
  mkdirSync(CLAUDE_SKILLS_DIR, { recursive: true });
  try {
    if (existsSync(claudeSkillLink)) {
      const stat = lstatSync(claudeSkillLink);
      if (stat.isSymbolicLink()) return;
      console.warn(`[Nakiros] ~/.claude/skills/${skillName} is a real directory; skipping symlink.`);
      return;
    }
    symlinkSync(nakirosSkill, claudeSkillLink, 'dir');
    console.log(`[Nakiros] Linked ${claudeSkillLink} → ${nakirosSkill}`);
  } catch (err) {
    console.error(`[Nakiros] Failed to link skill "${skillName}" into ~/.claude/skills/:`, err);
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Module-level cache of detected conflicts. Populated by syncBundledSkills(),
 * read by the IPC handler `nakiros:listBundledSkillConflicts`, cleared by
 * resolveBundledSkillConflict().
 */
let conflictCache: BundledSkillConflict[] = [];

/**
 * Sync bundled skills ROM → ~/.nakiros/skills/.
 *
 * `manifest.fileHashes` always mirrors the ROM at the time of the last agreed
 * sync. Drift on either side is then unambiguous:
 *   live  ≠ manifest.fileHashes → user has local modifications.
 *   rom   ≠ manifest.romHash    → Nakiros has shipped an update.
 *
 * User-owned directories (audits/, evals/workspace/, outputs/) are never
 * touched regardless of the path taken.
 */
export function syncBundledSkills(): string[] {
  const romRoot = getBundledSkillsRomDir();
  if (!existsSync(romRoot)) {
    conflictCache = [];
    return [];
  }

  mkdirSync(NAKIROS_SKILLS_DIR, { recursive: true });

  const manifest = readManifest();
  const conflicts: BundledSkillConflict[] = [];
  const available: string[] = [];
  const currentVersion = getNakirosVersion();

  let skillNames: string[];
  try {
    skillNames = readdirSync(romRoot, { withFileTypes: true })
      .filter((e: import('fs').Dirent) => e.isDirectory())
      .map((e: import('fs').Dirent) => e.name);
  } catch {
    conflictCache = [];
    return [];
  }

  for (const skillName of skillNames) {
    const romSkill = join(romRoot, skillName);
    const liveSkill = join(NAKIROS_SKILLS_DIR, skillName);

    const romFiles = listRomFiles(romSkill);
    const rom = hashSkillFiles(romSkill, romFiles);

    // Case 1 — first time: seed live from ROM, record ROM as baseline.
    if (!existsSync(liveSkill)) {
      try {
        copyDirSync(romSkill, liveSkill);
        manifest[skillName] = {
          romHash: rom.total,
          fileHashes: rom.perFile,
          version: currentVersion,
          syncedAt: new Date().toISOString(),
        };
        console.log(`[Nakiros] Seeded bundled skill "${skillName}"`);
      } catch (err) {
        console.error(`[Nakiros] Failed to seed skill "${skillName}":`, err);
        continue;
      }
      ensureClaudeSymlink(skillName);
      available.push(skillName);
      continue;
    }

    ensureClaudeSymlink(skillName);
    available.push(skillName);

    const entry = manifest[skillName];
    const liveFiles = listRomFiles(liveSkill);
    const live = hashSkillFiles(liveSkill, liveFiles);

    // Case 2 — legacy seed (pre-manifest). Two sub-cases based on whether live
    // already matches ROM.
    if (!entry) {
      if (live.total === rom.total) {
        // Pristine — simply record ROM as baseline.
        manifest[skillName] = {
          romHash: rom.total,
          fileHashes: rom.perFile,
          version: currentVersion,
          syncedAt: new Date().toISOString(),
        };
        continue;
      }
      // Live diverges from ROM and we have no history. Conservative: surface as
      // conflict so the user decides. Use ROM as baseline in the manifest — if
      // the user picks "keep-mine" the manifest becomes consistent again.
      conflicts.push({
        skillName,
        previousVersion: null,
        currentVersion,
        userModifiedPaths: diffFileHashes(rom.perFile, live.perFile),
        romChangedPaths: [],
        overlappingPaths: diffFileHashes(rom.perFile, live.perFile),
      });
      manifest[skillName] = {
        romHash: rom.total,
        fileHashes: rom.perFile,
        version: currentVersion,
        syncedAt: new Date().toISOString(),
      };
      continue;
    }

    const userModifiedPaths = diffFileHashes(entry.fileHashes, live.perFile);
    const romChangedPaths = diffFileHashes(entry.fileHashes, rom.perFile);

    // Case 3 — user hasn't touched it.
    if (userModifiedPaths.length === 0) {
      if (rom.total === entry.romHash) continue; // nothing to do
      // Auto-apply new ROM.
      try {
        copyRomOnly(romSkill, liveSkill);
        pruneStaleRomFiles(liveSkill, new Set(romFiles));
        manifest[skillName] = {
          romHash: rom.total,
          fileHashes: rom.perFile,
          version: currentVersion,
          syncedAt: new Date().toISOString(),
        };
        console.log(`[Nakiros] Auto-updated bundled skill "${skillName}" from ROM`);
      } catch (err) {
        console.error(`[Nakiros] Failed to auto-update "${skillName}":`, err);
      }
      continue;
    }

    // Case 4 — user has modifications.
    if (rom.total === entry.romHash) continue; // ROM unchanged, nothing to merge

    // Real conflict: user + ROM both diverged.
    const overlappingPaths = userModifiedPaths.filter((p) => romChangedPaths.includes(p));
    conflicts.push({
      skillName,
      previousVersion: entry.version ?? null,
      currentVersion,
      userModifiedPaths,
      romChangedPaths,
      overlappingPaths,
    });
    console.warn(
      `[Nakiros] Bundled skill "${skillName}" has local modifications AND a pending ROM update — user must resolve.`,
    );
  }

  writeManifest(manifest);
  conflictCache = conflicts;
  return available;
}

function diffFileHashes(
  baseline: Record<string, string>,
  current: Record<string, string>,
): string[] {
  const result = new Set<string>();
  for (const [path, hash] of Object.entries(current)) {
    if (baseline[path] !== hash) result.add(path);
  }
  for (const path of Object.keys(baseline)) {
    if (!(path in current)) result.add(path);
  }
  return [...result].sort();
}

function pruneStaleRomFiles(liveSkill: string, romFiles: Set<string>): void {
  const existing = listRomFiles(liveSkill);
  for (const rel of existing) {
    if (!romFiles.has(rel)) {
      try {
        unlinkSync(join(liveSkill, rel));
      } catch {
        // ignore
      }
    }
  }
}

// ─── Conflict resolution + diff API ──────────────────────────────────────────

/** Return the cached list of conflicts detected during the last `syncBundledSkills` pass. */
export function listBundledSkillConflicts(): BundledSkillConflict[] {
  return conflictCache;
}

function isLikelyBinary(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(4096, buffer.length));
  for (const byte of sample) {
    if (byte === 0) return true;
  }
  return false;
}

function readIfExists(path: string): { content: string | null; isBinary: boolean } {
  if (!existsSync(path)) return { content: null, isBinary: false };
  const buf = readFileSync(path);
  if (isLikelyBinary(buf)) return { content: null, isBinary: true };
  return { content: buf.toString('utf8'), isBinary: false };
}

/**
 * Produce a per-file diff payload for the conflict UI: ROM content vs live
 * content. Refuses user-owned paths (`audits/`, `workspace/`, etc.) and any
 * path containing `..` to prevent traversal.
 *
 * @throws {Error} when `relativePath` is user-owned or contains `..`
 */
export function readBundledSkillConflictDiff(
  skillName: string,
  relativePath: string,
): BundledSkillConflictFileDiff {
  if (isPathUserOwned(relativePath) || relativePath.includes('..')) {
    throw new Error(`Refused: ${relativePath} is not a ROM-owned path.`);
  }
  const romPath = join(getBundledSkillsRomDir(), skillName, relativePath);
  const livePath = join(NAKIROS_SKILLS_DIR, skillName, relativePath);
  const romRead = readIfExists(romPath);
  const liveRead = readIfExists(livePath);
  return {
    relativePath,
    romContent: romRead.content,
    liveContent: liveRead.content,
    isBinary: romRead.isBinary || liveRead.isBinary,
  };
}

/**
 * Apply the user-chosen resolution for a bundled-skill conflict:
 * - `apply-rom` — overwrite the live copy with the ROM (user modifications lost)
 * - `keep-mine` — record ROM as the new baseline without touching live (future ROM updates will re-surface a conflict)
 * - `promote-mine` — copy the live copy BACK into the ROM (dev only — fails in production installs)
 *
 * @throws {Error} when ROM or live skills are missing, or when `promote-mine` is used on a read-only ROM
 */
export function resolveBundledSkillConflict(
  skillName: string,
  resolution: BundledSkillConflictResolution,
): void {
  const romRoot = getBundledSkillsRomDir();
  const romSkill = join(romRoot, skillName);
  const liveSkill = join(NAKIROS_SKILLS_DIR, skillName);
  if (!existsSync(romSkill)) throw new Error(`ROM skill not found: ${skillName}`);
  if (!existsSync(liveSkill)) throw new Error(`Live skill not found: ${skillName}`);

  const manifest = readManifest();
  const romFiles = listRomFiles(romSkill);
  const rom = hashSkillFiles(romSkill, romFiles);
  const currentVersion = getNakirosVersion();

  if (resolution === 'apply-rom') {
    copyRomOnly(romSkill, liveSkill);
    pruneStaleRomFiles(liveSkill, new Set(romFiles));
    manifest[skillName] = {
      romHash: rom.total,
      fileHashes: rom.perFile,
      version: currentVersion,
      syncedAt: new Date().toISOString(),
    };
  } else if (resolution === 'keep-mine') {
    // Record the ROM as baseline so we stop flagging the conflict; the live copy
    // is intentionally kept as-is. The next ROM update will re-surface a conflict.
    manifest[skillName] = {
      romHash: rom.total,
      fileHashes: rom.perFile,
      version: currentVersion,
      syncedAt: new Date().toISOString(),
    };
  } else if (resolution === 'promote-mine') {
    if (!existsSync(romRoot)) {
      throw new Error('Cannot promote: ROM directory not writable (production install).');
    }
    mkdirSync(romSkill, { recursive: true });
    copyDirSelective(liveSkill, romSkill);
    const newRomFiles = listRomFiles(romSkill);
    const newRom = hashSkillFiles(romSkill, newRomFiles);
    manifest[skillName] = {
      romHash: newRom.total,
      fileHashes: newRom.perFile,
      version: currentVersion,
      syncedAt: new Date().toISOString(),
    };
  }

  writeManifest(manifest);
  conflictCache = conflictCache.filter((c) => c.skillName !== skillName);
}

// ─── Legacy helpers (kept for compatibility) ─────────────────────────────────

/** Absolute path to `~/.nakiros/skills/` — the live, editable Nakiros-owned skill location. */
export function getNakirosSkillsDir(): string {
  return NAKIROS_SKILLS_DIR;
}

/** Absolute path to the bundled-skills ROM (source in dev, packaged assets in prod). */
export function getBundledSkillsDir(): string {
  return getBundledSkillsRomDir();
}

/**
 * Copy a skill from `~/.nakiros/skills/` back into the ROM, skipping user-owned
 * subtrees (`audits/`, `evals/workspace/`, `outputs/`). Dev-only — the ROM is
 * read-only in production installs. Updates the sync manifest so subsequent
 * syncs treat the promoted content as baseline.
 *
 * @throws {Error} when source is missing or ROM directory is read-only
 */
export function promoteBundledSkill(skillName: string): string {
  const src = join(NAKIROS_SKILLS_DIR, skillName);
  const dest = join(getBundledSkillsRomDir(), skillName);

  if (!existsSync(src)) throw new Error(`Cannot promote: ${src} does not exist`);
  if (!existsSync(getBundledSkillsRomDir())) {
    throw new Error(
      'Cannot promote: bundled-skills ROM directory not found. ' +
        'This action only works in dev (the ROM is read-only in production builds).',
    );
  }

  mkdirSync(dest, { recursive: true });
  copyDirSelective(src, dest);

  // Update manifest so the live copy is now considered in sync with the new ROM.
  const manifest = readManifest();
  const romFiles = listRomFiles(dest);
  const rom = hashSkillFiles(dest, romFiles);
  manifest[skillName] = {
    romHash: rom.total,
    fileHashes: rom.perFile,
    version: getNakirosVersion(),
    syncedAt: new Date().toISOString(),
  };
  writeManifest(manifest);

  return dest;
}

function copyDirSelective(src: string, dest: string): void {
  let entries: import('fs').Dirent[];
  try {
    entries = readdirSync(src, { withFileTypes: true }) as import('fs').Dirent[];
  } catch {
    return;
  }

  mkdirSync(dest, { recursive: true });

  for (const entry of entries) {
    const rel = entry.name;
    if (USER_OWNED_DIRS.has(rel)) continue;
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'evals') {
        copyEvalsSelective(srcPath, destPath);
      } else {
        copyDirSelective(srcPath, destPath);
      }
    } else if (entry.isFile()) {
      writeFileSync(destPath, readFileSync(srcPath));
    }
  }
}

function copyEvalsSelective(src: string, dest: string): void {
  let entries: import('fs').Dirent[];
  try {
    entries = readdirSync(src, { withFileTypes: true }) as import('fs').Dirent[];
  } catch {
    return;
  }
  mkdirSync(dest, { recursive: true });
  for (const entry of entries) {
    if (USER_OWNED_EVAL_DIRS.has(entry.name)) continue;
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSelective(srcPath, destPath);
    } else if (entry.isFile()) {
      writeFileSync(destPath, readFileSync(srcPath));
    }
  }
}

/** Remove the symlink `~/.claude/skills/<skillName>` if it exists. No-op on real directories. */
export function removeClaudeSkillLink(skillName: string): void {
  const claudeSkillLink = join(CLAUDE_SKILLS_DIR, skillName);
  if (!existsSync(claudeSkillLink)) return;
  try {
    const stat = lstatSync(claudeSkillLink);
    if (stat.isSymbolicLink()) unlinkSync(claudeSkillLink);
  } catch {
    // ignore
  }
}
