import { existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync, lstatSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

/**
 * Where Nakiros owns its skills on disk.
 * ROM = apps/desktop/bundled-skills (source in the app, read-only)
 * Nakiros home = ~/.nakiros/skills/{name} (the live, editable copy Nakiros operates on)
 * Claude home = ~/.claude/skills/{name} (symlink → Nakiros home so Claude Code discovers it)
 */
const NAKIROS_SKILLS_DIR = join(homedir(), '.nakiros', 'skills');
const CLAUDE_SKILLS_DIR = join(homedir(), '.claude', 'skills');

function getBundledSkillsRomDir(): string {
  const candidates = [
    join(__dirname, '../../bundled-skills'),
    join(process.resourcesPath ?? '', 'bundled-skills'),
    join(process.cwd(), 'apps/desktop/bundled-skills'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

/**
 * Recursively copy, overwriting existing files.
 */
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

/**
 * Sync bundled skills from the app ROM to ~/.nakiros/skills/, then expose them
 * to Claude Code via symlinks in ~/.claude/skills/.
 *
 * First boot → copies ROM → Nakiros home.
 * Subsequent boots → does NOT overwrite (preserves user/Nakiros modifications).
 * The symlink in ~/.claude/skills/ is (re)created each boot to ensure freshness.
 *
 * Returns the names of skills that are now available.
 */
export function syncBundledSkills(): string[] {
  const romDir = getBundledSkillsRomDir();
  if (!existsSync(romDir)) return [];

  mkdirSync(NAKIROS_SKILLS_DIR, { recursive: true });
  mkdirSync(CLAUDE_SKILLS_DIR, { recursive: true });

  const available: string[] = [];

  let entries: string[];
  try {
    entries = readdirSync(romDir, { withFileTypes: true })
      .filter((e: import('fs').Dirent) => e.isDirectory())
      .map((e: import('fs').Dirent) => e.name);
  } catch {
    return [];
  }

  for (const skillName of entries) {
    const romSkill = join(romDir, skillName);
    const nakirosSkill = join(NAKIROS_SKILLS_DIR, skillName);
    const claudeSkillLink = join(CLAUDE_SKILLS_DIR, skillName);

    // 1. Ensure the Nakiros-owned copy exists
    if (!existsSync(nakirosSkill)) {
      try {
        copyDirSync(romSkill, nakirosSkill);
        console.log(`[Nakiros] Seeded bundled skill "${skillName}" → ${nakirosSkill}`);
      } catch (err) {
        console.error(`[Nakiros] Failed to seed skill "${skillName}":`, err);
        continue;
      }
    }

    // 2. Ensure ~/.claude/skills/{skillName} is a symlink to the Nakiros copy
    try {
      if (existsSync(claudeSkillLink)) {
        const stat = lstatSync(claudeSkillLink);
        if (stat.isSymbolicLink()) {
          // Already a symlink; assume it's correct. Replace if it's pointing elsewhere — later.
        } else {
          // It's a real dir (old install). Replace with symlink.
          // For safety, don't delete — the user may have customized it. Skip the symlink.
          console.warn(`[Nakiros] ~/.claude/skills/${skillName} is a real directory; skipping symlink.`);
          available.push(skillName);
          continue;
        }
      } else {
        symlinkSync(nakirosSkill, claudeSkillLink, 'dir');
        console.log(`[Nakiros] Linked ${claudeSkillLink} → ${nakirosSkill}`);
      }
      available.push(skillName);
    } catch (err) {
      console.error(`[Nakiros] Failed to link skill "${skillName}" into ~/.claude/skills/:`, err);
    }
  }

  return available;
}

/**
 * Return the canonical Nakiros skills directory (used by reader + eval runner).
 */
export function getNakirosSkillsDir(): string {
  return NAKIROS_SKILLS_DIR;
}

/**
 * Return the path to the bundled-skills ROM directory (read-only source bundled with the app).
 */
export function getBundledSkillsDir(): string {
  return getBundledSkillsRomDir();
}

/**
 * Promote a Nakiros skill (the editable copy at ~/.nakiros/skills/{name}/) back into
 * the bundled-skills/ ROM. Used after `fix` or manual edits to "freeze" the new version
 * so it ships with the next app build.
 *
 * Excludes runtime artifacts: `audits/`, `evals/workspace/` (they're per-user, not part of the skill).
 *
 * Returns the destination path on success; throws on error.
 */
export function promoteBundledSkill(skillName: string): string {
  const src = join(NAKIROS_SKILLS_DIR, skillName);
  const dest = join(getBundledSkillsRomDir(), skillName);

  if (!existsSync(src)) {
    throw new Error(`Cannot promote: ${src} does not exist`);
  }
  if (!existsSync(getBundledSkillsRomDir())) {
    throw new Error(
      `Cannot promote: bundled-skills ROM directory not found. ` +
        `This action only works in dev (the ROM is read-only in production builds).`,
    );
  }

  mkdirSync(dest, { recursive: true });
  copyDirSelective(src, dest);
  return dest;
}

/** Recursively copy `src` to `dest`, skipping runtime artifact folders. */
function copyDirSelective(src: string, dest: string): void {
  const skipNames = new Set(['audits', 'workspace']); // audits/ and evals/workspace/

  let entries: import('fs').Dirent[];
  try {
    entries = readdirSync(src, { withFileTypes: true }) as import('fs').Dirent[];
  } catch {
    return;
  }

  mkdirSync(dest, { recursive: true });

  for (const entry of entries) {
    if (skipNames.has(entry.name)) continue;
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSelective(srcPath, destPath);
    } else if (entry.isFile()) {
      writeFileSync(destPath, readFileSync(srcPath));
    }
    // Skip symlinks and other special files
  }
}

/**
 * Remove an obsolete Claude symlink (used when a bundled skill is renamed/removed).
 */
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
