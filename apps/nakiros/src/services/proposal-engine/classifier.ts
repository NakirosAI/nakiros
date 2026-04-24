import { readFileSync } from 'fs';
import { join } from 'path';

import type { SkillDetection } from '@nakiros/shared';

// ---------------------------------------------------------------------------
// Skill classifier — detects which skills were active in a Claude Code
// conversation. Used by the proposal engine to decide whether a cluster of
// frictions points at an existing skill (→ propose a patch) or at an
// unaddressed pain point (→ propose a new skill).
//
// Strategy, in order of confidence:
//   1. Slash commands — user typed `/skill-name`, Claude Code wraps it as
//      `<command-name>/skill-name</command-name>` in the user turn.
//   2. Read tool calls — assistant read `**/SKILL.md` or `**/skills/<name>/...`
//      as part of lazy skill loading.
//   3. Fallback — no skill detected → empty detection → engine defaults to
//      "new skill" classification.
//
// We work on the raw JSONL here (not `getConversationMessages`) because the
// parser filters out `<command-name>` lines for the UI.
// ---------------------------------------------------------------------------

const COMMAND_NAME_RE = /<command-name>\s*\/?([a-zA-Z0-9][\w:-]*)\s*<\/command-name>/g;
// Matches Read tool inputs whose file_path points at a SKILL.md or skills/<name>/... path.
// Capture group: the skill slug (directory name that precedes SKILL.md, or
// the segment right after `/skills/`).
const SKILL_MD_PATH_RE = /\/skills\/([^\/\s"]+)(?:\/[^"]*)?\/SKILL\.md\b/;
const SKILL_DIR_PATH_RE = /\/skills\/([^\/\s"]+)(?:\/|")/;

export interface DetectSkillsOptions {
  /** Limit detection to turns within this ± window of a friction turn. */
  nearTurn?: number;
  /** Window size in turns (default 8). Ignored when `nearTurn` is undefined. */
  windowSize?: number;
}

/**
 * Scan a JSONL conversation file and return the skills that appear to have
 * been active. Safe on malformed lines (skips them silently).
 *
 * When `nearTurn` is provided, only the turns within the window are scanned —
 * useful when attributing a specific friction. Without it, the whole
 * conversation is classified.
 */
export function detectSkills(
  providerProjectDir: string,
  sessionId: string,
  options: DetectSkillsOptions = {},
): SkillDetection {
  const filePath = join(providerProjectDir, `${sessionId}.jsonl`);
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch {
    return { viaSlashCommand: [], viaReadSkillMd: [], all: [] };
  }

  const lines = raw.split('\n').filter(Boolean);

  const windowSize = options.windowSize ?? 8;
  const minTurn =
    options.nearTurn !== undefined ? Math.max(1, options.nearTurn - windowSize) : null;
  const maxTurn =
    options.nearTurn !== undefined ? options.nearTurn + windowSize : null;

  const slash = new Set<string>();
  const readSkill = new Set<string>();

  let turnIndex = 0;

  for (const line of lines) {
    let entry: Record<string, unknown>;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    const type = entry['type'] as string | undefined;
    if (type !== 'user' && type !== 'assistant') continue;
    if (entry['isMeta']) continue;

    turnIndex++;
    if (minTurn !== null && maxTurn !== null) {
      if (turnIndex < minTurn) continue;
      if (turnIndex > maxTurn) break;
    }

    const msg = entry['message'] as { content?: unknown } | undefined;
    if (!msg?.content) continue;

    if (type === 'user') {
      const rawContent = stringifyContent(msg.content);
      for (const m of rawContent.matchAll(COMMAND_NAME_RE)) {
        const name = m[1];
        if (name && !RESERVED_COMMANDS.has(name)) slash.add(name);
      }
    }

    if (type === 'assistant' && Array.isArray(msg.content)) {
      for (const block of msg.content) {
        const b = block as { type?: string; name?: string; input?: unknown };
        if (b.type !== 'tool_use' || b.name !== 'Read') continue;
        const input = b.input as { file_path?: unknown } | undefined;
        const filePathInput = typeof input?.file_path === 'string' ? input.file_path : null;
        if (!filePathInput) continue;
        const skillName = extractSkillFromPath(filePathInput);
        if (skillName) readSkill.add(skillName);
      }
    }
  }

  const viaSlashCommand = [...slash].sort();
  const viaReadSkillMd = [...readSkill].sort();
  const all = [...new Set([...viaSlashCommand, ...viaReadSkillMd])].sort();

  return { viaSlashCommand, viaReadSkillMd, all };
}

// Built-in Claude Code commands that shouldn't be treated as skill activations
// — they manage the harness itself, not a user-space skill.
const RESERVED_COMMANDS = new Set([
  'clear',
  'compact',
  'help',
  'config',
  'cost',
  'login',
  'logout',
  'model',
  'review',
  'fast',
  'loop',
  'schedule',
  'init',
  'security-review',
]);

function stringifyContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const block of content) {
      const b = block as { type?: string; text?: string };
      if (b.type === 'text' && typeof b.text === 'string') parts.push(b.text);
    }
    return parts.join('\n');
  }
  return '';
}

function extractSkillFromPath(filePath: string): string | null {
  const mdMatch = filePath.match(SKILL_MD_PATH_RE);
  if (mdMatch) return mdMatch[1];
  const dirMatch = filePath.match(SKILL_DIR_PATH_RE);
  if (dirMatch) return dirMatch[1];
  return null;
}
