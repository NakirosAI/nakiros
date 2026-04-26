import { useTranslation } from 'react-i18next';
import type { AuditRunTurn } from '@nakiros/shared';
import {
  ConversationTurn,
  liveEventsToBlocks,
  legacyTurnToBlocks,
  endsOnAssistant,
  type LiveStreamEvent,
} from '../ConversationTurn';
import { ThinkingIndicator } from '../ThinkingIndicator';

interface Props {
  /** Persisted turns from the run snapshot. */
  turns: AuditRunTurn[];
  /** Live in-flight events streamed since the last persisted turn. */
  liveEvents: LiveStreamEvent[];
  /** Ref pinned to the bottom of the streaming bubble for autoscroll. */
  liveScrollRef: React.RefObject<HTMLDivElement | null>;
  /** Whether the run is currently emitting (drives the streaming bubble + indicator). */
  isStreaming: boolean;
  /** Optional override for the thinking-indicator verbs (defaults to runs:thinking.verbs). */
  thinkingVerbs?: string[];
  /**
   * `page` (default) wraps the feed in a scrollable, centered, max-width
   * container — use for full-page runs (Audit, Fix). `inline` drops the
   * wrapper so the feed can be embedded inside another scroll container that
   * also holds extra panels (e.g. EvalRunsView's run detail).
   */
  variant?: 'page' | 'inline';
}

/**
 * Chat-style activity feed shared by every run kind (audit / fix / create /
 * eval). Renders persisted turns, an in-flight assistant bubble while the
 * agent is streaming, and a {@link ThinkingIndicator} when no chunk has
 * landed yet for the current turn.
 */
export function AgentActivityFeed({
  turns,
  liveEvents,
  liveScrollRef,
  isStreaming,
  thinkingVerbs,
  variant = 'page',
}: Props) {
  const { t } = useTranslation('runs');
  const verbs = thinkingVerbs ?? (t('thinking.verbs', { returnObjects: true }) as string[]);

  const inner = (
    <div
      className={
        variant === 'page'
          ? 'mx-auto flex max-w-[900px] flex-col gap-3'
          : 'flex flex-col gap-2'
      }
    >
      {turns.map((turn, i) => (
        <ConversationTurn
          key={i}
          role={turn.role}
          timestamp={turn.timestamp}
          blocks={
            turn.blocks ??
            (turn.role === 'assistant'
              ? legacyTurnToBlocks(turn.content, turn.tools)
              : [{ type: 'text', text: turn.content }])
          }
        />
      ))}

      {isStreaming && liveEvents.length > 0 && !endsOnAssistant(turns) && (
        <ConversationTurn
          role="assistant"
          timestamp={new Date().toISOString()}
          blocks={liveEventsToBlocks(liveEvents)}
          streaming
          scrollRef={liveScrollRef}
        />
      )}

      {isStreaming && liveEvents.length === 0 && !endsOnAssistant(turns) && (
        <ThinkingIndicator verbs={verbs} />
      )}
    </div>
  );

  if (variant === 'inline') return inner;
  return <div className="flex-1 overflow-y-auto p-4">{inner}</div>;
}
