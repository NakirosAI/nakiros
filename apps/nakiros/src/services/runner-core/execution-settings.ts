import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const DEFAULT_ALLOW = ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash'];

export interface ExecutionSettingsOptions {
  /** Block the Skill tool — used by without_skill eval baselines. */
  denySkill?: boolean;
  /** No-op when `.claude/settings.local.json` already exists. Required when
   * the caller may be re-entering the same workdir (eval iterations). */
  skipIfExists?: boolean;
}

/**
 * Write `<dir>/.claude/settings.local.json` so the claude CLI running with
 * `cwd=dir` auto-accepts edits and respects the configured allow/deny list.
 * Creates `.claude/` as needed. No-op when settings already exist and
 * `skipIfExists` is set.
 */
export function writeExecutionSettings(
  dir: string,
  options: ExecutionSettingsOptions = {},
): void {
  const claudeDir = join(dir, '.claude');
  mkdirSync(claudeDir, { recursive: true });
  const settingsPath = join(claudeDir, 'settings.local.json');
  if (options.skipIfExists && existsSync(settingsPath)) return;

  const permissions: { defaultMode: string; allow: string[]; deny?: string[] } = {
    defaultMode: 'acceptEdits',
    allow: DEFAULT_ALLOW,
  };
  if (options.denySkill) {
    permissions.deny = ['Skill'];
  }
  writeFileSync(settingsPath, JSON.stringify({ permissions }, null, 2), 'utf8');
}
