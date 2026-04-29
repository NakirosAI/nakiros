/**
 * Helpers for reading a Claude Code session jsonl file
 * (`~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl`) and exposing it as
 * structured `SessionBlock`s. Single source of truth for run timelines
 * (fix / audit / eval / create) — see
 * `feedback_session_jsonl_source_of_truth.md`.
 *
 * Each line of the jsonl carries an ISO `timestamp`; we surface that as
 * the `ts` on every emitted block so runners never need to synthesize
 * timestamps with `Date.now()`.
 *
 * Caller is responsible for the run-kind-specific mapping (e.g. fix-runner
 * turns Write/Edit on `outputs/fix-findings.jsonl` into `finding` cards;
 * audit-runner turns the same Writes on `outputs/audit-progress.jsonl`
 * into a no-op since the sidebar already covers them).
 */
import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

import { encodeProjectPath } from './claude-projects.js';

export type SessionBlock =
  /**
   * Free-form user message — initial prompt, reply, or the first text
   * block of a tool_results array. Wrapper text (`<command-name>` etc.)
   * is filtered out by {@link parseSessionBlocks} before this is emitted.
   */
  | { kind: 'user_text'; ts: string; text: string }
  /** Assistant free-form text block. */
  | { kind: 'assistant_text'; ts: string; text: string }
  /**
   * Assistant `tool_use`. Caller decides how to render: generic tool box
   * (Bash/Read/…), Write/Edit diff card, finding card derived from a
   * Write to a Nakiros runtime path, etc.
   */
  | { kind: 'assistant_tool'; ts: string; name: string; input: Record<string, unknown> };

/**
 * Resolves the canonical session jsonl path: `~/.claude/projects/<encoded
 * cwd>/<sessionId>.jsonl`. The encoding is the same one Claude Code uses
 * itself to namespace projects on disk.
 */
export function getSessionJsonlPath(workdir: string, sessionId: string): string {
  return join(homedir(), '.claude', 'projects', encodeProjectPath(workdir), `${sessionId}.jsonl`);
}

/**
 * Parse a Claude Code session jsonl into structured `SessionBlock`s.
 *
 * Filters applied (canonical for every runner):
 * - `isMeta` lines (CLI bookkeeping) → skipped
 * - `isSidechain` lines (subagent stops, etc.) → skipped
 * - User `<command-name>` / `<command-message>` / `<local-command-*>`
 *   wrappers → skipped (the agent's actual prompt arrives on the next
 *   user line as plain text)
 * - User `tool_result` blocks → skipped (the assistant `tool_use` already
 *   represents the action; surfacing the result a second time as a user
 *   message would create a phantom turn)
 * - Empty assistant lines (no text + no tool_use blocks) → skipped
 * - Lines with no parseable JSON or no `timestamp` → skipped
 *
 * Returns blocks in file order. Caller is responsible for stable-sorting
 * by `ts` if interleaving with other sources. Returns an empty array when
 * the file doesn't exist (run hasn't captured a sessionId yet) or can't
 * be read.
 */
export function parseSessionBlocks(workdir: string, sessionId: string): SessionBlock[] {
  const file = getSessionJsonlPath(workdir, sessionId);
  if (!existsSync(file)) return [];

  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    return [];
  }

  const out: SessionBlock[] = [];

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const obj = parsed as {
      type?: string;
      timestamp?: string;
      isMeta?: boolean;
      isSidechain?: boolean;
      message?: { role?: string; content?: unknown };
    };

    if (obj.isMeta) continue;
    if (obj.isSidechain) continue;
    if (obj.type !== 'user' && obj.type !== 'assistant') continue;
    const ts = typeof obj.timestamp === 'string' ? obj.timestamp : null;
    if (!ts) continue;

    const content = obj.message?.content;

    if (obj.type === 'user') {
      if (typeof content === 'string') {
        if (isCommandWrapperText(content)) continue;
        out.push({ kind: 'user_text', ts, text: content });
      } else if (Array.isArray(content)) {
        const text = pickUserFreeText(content);
        if (text && !isCommandWrapperText(text)) {
          out.push({ kind: 'user_text', ts, text });
        }
      }
      continue;
    }

    // Assistant — content is an array of blocks.
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      const b = block as {
        type?: string;
        text?: string;
        name?: string;
        input?: Record<string, unknown>;
      };
      if (b.type === 'text' && typeof b.text === 'string' && b.text.trim()) {
        out.push({ kind: 'assistant_text', ts, text: b.text });
        continue;
      }
      if (b.type === 'tool_use' && b.name) {
        out.push({ kind: 'assistant_tool', ts, name: b.name, input: b.input ?? {} });
        continue;
      }
      // Other block kinds (`thinking`, `image`, …) — skip for now.
    }
  }

  return out;
}

/**
 * True for the slash-command wrappers Claude Code adds around bootstraps
 * (e.g. `<command-name>nakiros-skill-factory</command-message>`). The
 * agent's actual prompt arrives on the next user line as plain text.
 */
export function isCommandWrapperText(text: string): boolean {
  const trimmed = text.trim();
  return (
    trimmed.startsWith('<command-name>') ||
    trimmed.startsWith('<command-message>') ||
    trimmed.startsWith('<local-command-')
  );
}

/**
 * From a user content array (tool_results + occasional text), extract the
 * first free-form text block. Returns `null` if the array is purely
 * tool_results or attachments.
 */
export function pickUserFreeText(blocks: unknown[]): string | null {
  for (const b of blocks) {
    const block = b as { type?: string; text?: string };
    if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
      return block.text;
    }
  }
  return null;
}
