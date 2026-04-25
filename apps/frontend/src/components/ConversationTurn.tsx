import { Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { MarkdownViewer } from './ui';
import type { EvalRunTurnBlock } from '@nakiros/shared';

/**
 * A single chat-style conversation turn with ordered text+tool blocks.
 * Used by eval, audit, and fix runners to render runs the same way the
 * Claude Code extension shows its sessions:
 *
 *  - text blocks render as markdown (assistant) or plain text (user)
 *  - tool blocks render as a monospace line with a name badge + full display
 *    (no truncation — paths and commands are displayed in full)
 *  - text and tool blocks are interleaved in the order the agent emitted them
 */
export function ConversationTurn({
  role,
  timestamp,
  blocks,
  streaming,
  scrollRef,
}: {
  role: 'user' | 'assistant';
  timestamp: string;
  blocks: EvalRunTurnBlock[];
  streaming?: boolean;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={scrollRef}
      className={clsx(
        'rounded-lg px-4 py-3',
        role === 'user'
          ? 'ml-8 bg-[var(--primary-soft)]'
          : 'mr-8 border bg-[var(--bg-card)]',
        role === 'assistant' && (streaming ? 'border-[var(--primary)]/40' : 'border-[var(--line)]'),
      )}
    >
      <div className="mb-1 flex items-center gap-2 text-xs text-[var(--text-muted)]">
        {streaming && <Loader2 size={10} className="animate-spin text-[var(--primary)]" />}
        <span className="font-semibold capitalize">{role}</span>
        <span>{new Date(timestamp).toLocaleTimeString()}</span>
      </div>
      <div className="flex flex-col gap-1">
        {blocks.map((block, i) => {
          if (block.type === 'text') {
            if (role === 'assistant') {
              return <MarkdownViewer key={i} content={block.text} className="px-0 py-0" />;
            }
            return (
              <div key={i} className="whitespace-pre-wrap text-sm text-[var(--text-primary)]">
                {block.text}
              </div>
            );
          }
          return (
            <div key={i} className="flex items-start gap-2 font-mono text-xs my-0.5">
              <span className="shrink-0 rounded bg-[var(--bg-muted)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--primary)]">
                {block.name}
              </span>
              <span className="break-all text-[var(--text-primary)]">{block.display}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Live stream events arriving in real time look like turn blocks + a timestamp.
 * Strip the timestamp to get the persisted block shape.
 */
export type LiveStreamEvent =
  | { type: 'text'; text: string; ts: number }
  | { type: 'tool'; name: string; display: string; ts: number };

/**
 * Strip transient timestamps off live stream events, leaving the persisted
 * block shape used by `ConversationTurn`.
 */
export function liveEventsToBlocks(events: LiveStreamEvent[]): EvalRunTurnBlock[] {
  return events.map((e) =>
    e.type === 'text'
      ? ({ type: 'text', text: e.text } as const)
      : ({ type: 'tool', name: e.name, display: e.display } as const),
  );
}

/**
 * Backward-compat: for runs written before `blocks` existed, synthesise a
 * block list from `content` + legacy `tools` (text first, then tools grouped).
 * Not ideal ordering but the best we can do without the original stream.
 */
export function legacyTurnToBlocks(
  content: string,
  tools: { name: string; display: string }[] | undefined,
): EvalRunTurnBlock[] {
  const out: EvalRunTurnBlock[] = [];
  if (content) out.push({ type: 'text', text: content });
  if (tools) {
    for (const tool of tools) out.push({ type: 'tool', name: tool.name, display: tool.display });
  }
  return out;
}

/**
 * True when the last persisted turn is the assistant's — i.e. the provisional
 * turn built from live events should not be appended on top (it would be a
 * duplicate of the turn that just landed).
 */
export function endsOnAssistant(
  turns: ReadonlyArray<{ role: 'user' | 'assistant' }>,
): boolean {
  return turns.length > 0 && turns[turns.length - 1].role === 'assistant';
}
