import type { ChatTimelineEntry } from '@nakiros/shared';

import { parseSessionBlocks } from './session-jsonl.js';
import { formatTool } from './tool-format.js';

/**
 * Predicate deciding whether a `Write` / `Edit` / `MultiEdit` tool_use
 * targets one of the runner's own internal progress artefacts (`file_path`
 * relative to `agentCwd`) and should therefore be hidden from the generic
 * tool timeline — the artefact is already surfaced via a dedicated
 * structured event (audit's `manifest`/`check_result`, bootstrap's
 * `plan_updated`), so re-rendering it as a generic tool box would be
 * redundant noise.
 */
export type ExcludedToolPathPredicate = (input: Record<string, unknown>, agentCwd: string) => boolean;

/**
 * Build the universal `user` / `assistant_text` / `tool` conversation
 * timeline from a Claude Code session jsonl. Shared by every run kind whose
 * live-progress sidebar lives on a separate structured event stream instead
 * of the chat itself (audit, bootstrap) — kinds with their own extra
 * timeline entries (e.g. fix's `edit` / `finding` / `eval_result`) build on
 * top of this instead of reusing it verbatim.
 *
 * Was duplicated near-identically between `audit-runner.ts`'s
 * `getAuditTimeline` and `bootstrap-runner.ts`'s `getBootstrapTimeline`
 * (`.claude/rules/runners.md` — "identify the 80% common path... do not
 * fork") before being extracted here; both now delegate.
 *
 * @param sessionBase - directory Claude Code's session file is keyed by (`run.cwd ?? run.workdir`)
 * @param sessionId - Claude Code session id
 * @param isExcludedToolPath - hides a Write/Edit/MultiEdit tool_use whose `file_path` matches a runner-internal artefact
 * @returns entries in chronological order (stable-sorted by `ts` — file order is already chronological in practice, but streaming can interleave)
 */
export function buildChatTimeline(
  sessionBase: string,
  sessionId: string,
  isExcludedToolPath: ExcludedToolPathPredicate,
): ChatTimelineEntry[] {
  const out: ChatTimelineEntry[] = [];

  for (const block of parseSessionBlocks(sessionBase, sessionId)) {
    if (block.kind === 'user_text') {
      out.push({ kind: 'user', ts: block.ts, text: block.text });
      continue;
    }
    if (block.kind === 'assistant_text') {
      out.push({ kind: 'assistant_text', ts: block.ts, text: block.text });
      continue;
    }
    if (
      (block.name === 'Write' || block.name === 'Edit' || block.name === 'MultiEdit') &&
      isExcludedToolPath(block.input, sessionBase)
    ) {
      continue;
    }
    out.push({ kind: 'tool', ts: block.ts, name: block.name, display: formatTool(block.name, block.input) });
  }

  out.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
  return out;
}
