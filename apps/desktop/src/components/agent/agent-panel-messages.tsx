import type React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { TFunction } from 'i18next';
import {
  Bot,
  ChevronDown,
  FileText,
  Code2,
  Terminal,
  Search,
  Globe,
  ListTodo,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type {
  Message,
  MessageStatus,
  OrchestrationBlock,
  ToolActivity,
  WorkflowChoice,
} from './agent-panel-utils.js';
import {
  extractOrchestrationBlocks,
  extractWorkflowChoices,
  formatOrchestrationModeLabel,
  formatRoundStateLabel,
  humanizeAgentId,
  parseAgentSegments,
  resolveMessageSpeakerTag,
  sanitizeVisibleMessageContent,
} from './agent-panel-utils.js';

export interface StreamingActivityLabel {
  primary: string;
  detail: string;
}

interface AgentMessagesPaneProps {
  messages: Message[];
  emptyStateRepoExample: string;
  activeStreamingLabel: StreamingActivityLabel;
  isToolPanelExpanded: (msg: Message) => boolean;
  toggleToolPanel: (messageId: string, currentExpanded: boolean) => void;
  t: TFunction<'agent'>;
  /** Dynamic color map derived from resolved agent definitions — tag → {accent, bg} */
  colorMap: Record<string, { accent: string; bg: string }>;
  /** Known agent tags derived from resolved definitions — used for segment pattern matching */
  knownTags: string[];
  /** Called when the user clicks a regular workflow choice button (sends message to AI) */
  onWorkflowChoiceClick?: (choice: string) => void;
  /** Called when the user clicks a choice with a [nakiros:action] prefix (bypasses AI) */
  onNakirosAction?: (action: string) => void;
}

function ToolIcon({ name }: { name: string }) {
  const size = 11;
  const color = 'var(--primary)';
  const iconByName: Record<string, LucideIcon> = {
    Read: FileText,
    Write: Code2,
    Edit: Code2,
    MultiEdit: Code2,
    Bash: Terminal,
    Glob: Search,
    Grep: Search,
    WebFetch: Globe,
    WebSearch: Globe,
    TodoWrite: ListTodo,
  };
  const Icon = iconByName[name] ?? Wrench;
  return <Icon size={size} color={color} />;
}

function OrchestrationSummary({
  blocks,
  t,
}: {
  blocks: OrchestrationBlock[];
  t: TFunction<'agent'>;
}) {
  return (
    <div className="mt-3 flex flex-col gap-2">
      {blocks.map((block, index) => (
        <div
          key={`${block.mode}-${block.roundState}-${index}`}
          className="rounded-xl border border-[var(--border-color)]/70 bg-[var(--card-bg)]/70 px-3 py-2"
        >
          <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-[var(--text-secondary)]">
            <span className="inline-flex items-center gap-1.5 font-medium text-[var(--text-primary)]">
              <Bot size={12} />
              {t('orchestration.title')}
            </span>
            {block.mode && <span>{formatOrchestrationModeLabel(block.mode, t)}</span>}
            {block.roundState && <span>· {formatRoundStateLabel(block.roundState, t)}</span>}
          </div>

          {block.participants.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {block.participants.map((participant) => (
                <span
                  key={`${participant.agent}-${participant.provider}-${participant.reason}`}
                  className="inline-flex items-center rounded-full border border-[var(--primary)]/25 bg-[var(--primary)]/8 px-2.5 py-1 text-[12px] font-medium text-[var(--text-primary)]"
                >
                  {humanizeAgentId(participant.agent)}
                </span>
              ))}
            </div>
          )}

          <div className="mt-2 space-y-1 text-[13px] text-[var(--text-secondary)]">
            {block.userGoal && (
              <div>
                <span className="font-medium text-[var(--text-primary)]">{t('orchestration.userGoal')}:</span>{' '}
                {block.userGoal}
              </div>
            )}
            {block.synthesisGoal && (
              <div>
                <span className="font-medium text-[var(--text-primary)]">{t('orchestration.synthesisGoal')}:</span>{' '}
                {block.synthesisGoal}
              </div>
            )}
            {block.repos.length > 0 && (
              <div>
                <span className="font-medium text-[var(--text-primary)]">{t('orchestration.repos')}:</span>{' '}
                {block.repos.join(', ')}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function StreamingActivityText({
  label,
  compact = false,
}: {
  label: StreamingActivityLabel;
  compact?: boolean;
}) {
  return (
    <span className={compact ? STREAMING_ACTIVITY_COMPACT_CLASS : STREAMING_ACTIVITY_CLASS}>
      <span className={STREAMING_PULSE_DOT_CLASS} />
      <span className="font-medium">{label.primary}</span>
      <span className="opacity-70">·</span>
      <span className="opacity-90">{label.detail}</span>
    </span>
  );
}

function MessageBody({
  msg,
  t,
  useStructuredSpeakerStyling = false,
  speakerTag = '',
  colorMap,
}: {
  msg: Pick<Message, 'content' | 'status'>;
  t: TFunction<'agent'>;
  useStructuredSpeakerStyling?: boolean;
  speakerTag?: string;
  colorMap: Record<string, { accent: string; bg: string }>;
}) {
  const { blocks } = extractOrchestrationBlocks(msg.content);
  const visibleContent = sanitizeVisibleMessageContent(msg.content);
  const bodyStyles = useStructuredSpeakerStyling ? agentSegmentBodyStyles(speakerTag, colorMap) : null;

  return (
    <div
      className={bodyStyles ? bodyStyles.className : agentMessageContainerClass(msg.status)}
      style={bodyStyles?.style}
    >
      {visibleContent && (
        <div className={`agent-md${msg.status === 'error' ? ' agent-md--error' : ''}`}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{visibleContent || ' '}</ReactMarkdown>
          {msg.status === 'streaming' && visibleContent && <span className={CURSOR_CLASS}>▌</span>}
        </div>
      )}
      {blocks.length > 0 && <OrchestrationSummary blocks={blocks} t={t} />}
    </div>
  );
}

function ToolTrace({
  msg,
  toolsExpanded,
  toggleToolPanel,
  t,
}: {
  msg: Message;
  toolsExpanded: boolean;
  toggleToolPanel: (messageId: string, currentExpanded: boolean) => void;
  t: TFunction<'agent'>;
}) {
  if (msg.tools.length === 0) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => toggleToolPanel(msg.id, toolsExpanded)}
        className={TOOL_TRACE_TOGGLE_CLASS}
      >
        <div className="flex min-w-0 items-center gap-0.5">
          <ChevronDown size={10} className={toolTraceChevronClass(toolsExpanded)} />
          <span className="truncate">{t('toolsPanelTitle')}</span>
        </div>
        <span className="font-mono text-[9px] text-[var(--text-muted)]">{msg.tools.length}</span>
      </button>
      {toolsExpanded && (
        <>
          {msg.tools.map((tool, index) => (
            <ToolTraceRow key={`${tool.name}-${index}`} tool={tool} />
          ))}
          {msg.status === 'streaming' && !msg.content.trim() && (
            <div className={TOOL_ROW_STREAMING_CLASS}>
              <Wrench size={11} color="var(--primary)" />
              <span className={TOOL_DISPLAY_TEXT_CLASS}><span className={CURSOR_CLASS}>▌</span></span>
            </div>
          )}
        </>
      )}
    </>
  );
}

function ToolTraceRow({ tool }: { tool: ToolActivity }) {
  return (
    <div className={TOOL_ROW_CLASS}>
      <ToolIcon name={tool.name} />
      <span className={TOOL_DISPLAY_TEXT_CLASS}>{tool.display}</span>
    </div>
  );
}

function ActionResults({ msg }: { msg: Message }) {
  if (!msg.actionResults || msg.actionResults.length === 0) return null;
  return (
    <div className="mt-1 flex flex-col gap-0.5">
      {msg.actionResults.map((actionResult, index) => (
        <div key={`${actionResult.tool}-${index}`} className={ACTION_RESULT_ROW_CLASS}>
          {actionResult.summary}
        </div>
      ))}
    </div>
  );
}

function WorkflowChoicesBlock({
  question,
  choices,
  onChoiceClick,
  onNakirosAction,
}: {
  question: string;
  choices: WorkflowChoice[];
  onChoiceClick: (label: string) => void;
  onNakirosAction?: (action: string) => void;
}) {
  return (
    <div className="mt-3 border-t border-[var(--line)] pt-3">
      <p className="mb-2 text-[12px] font-semibold text-[var(--text-secondary)]">{question}</p>
      <div className="flex flex-wrap gap-2">
        {choices.map((choice, index) => (
          <button
            key={index}
            type="button"
            onClick={() => choice.nakirosAction ? onNakirosAction?.(choice.nakirosAction) : onChoiceClick(choice.label)}
            className={WORKFLOW_CHOICE_BTN_CLASS}
          >
            <span className={WORKFLOW_CHOICE_INDEX_CLASS}>{index + 1}</span>
            {choice.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function AgentMessageItem({
  msg,
  activeStreamingLabel,
  isToolPanelExpanded,
  toggleToolPanel,
  t,
  colorMap,
  knownTags,
  isLastAgentMessage,
  onWorkflowChoiceClick,
  onNakirosAction,
}: {
  msg: Message;
  activeStreamingLabel: StreamingActivityLabel;
  isToolPanelExpanded: (msg: Message) => boolean;
  toggleToolPanel: (messageId: string, currentExpanded: boolean) => void;
  t: TFunction<'agent'>;
  colorMap: Record<string, { accent: string; bg: string }>;
  knownTags: string[];
  isLastAgentMessage: boolean;
  onWorkflowChoiceClick?: (choice: string) => void;
  onNakirosAction?: (action: string) => void;
}) {
  const toolsExpanded = isToolPanelExpanded(msg);

  // Extract workflow choices from the last completed agent message only
  const workflowChoices = (isLastAgentMessage && msg.status === 'complete' && onWorkflowChoiceClick)
    ? extractWorkflowChoices(msg.content)
    : null;

  // Strip the choices block from visible content so it doesn't render as markdown
  const effectiveContent = workflowChoices ? workflowChoices.contentWithout : msg.content;
  const effectiveMsg = workflowChoices ? { ...msg, content: effectiveContent } : msg;

  const structuredSpeakerTag = resolveMessageSpeakerTag(effectiveMsg)
    ?? (msg.agentId ? humanizeAgentId(msg.agentId) : null);
  const speakerTagSt = structuredSpeakerTag ? agentSegmentTagStyles(structuredSpeakerTag, colorMap) : null;
  const parsedSegments = effectiveMsg.status !== 'error' ? parseAgentSegments(effectiveMsg.content, knownTags) : null;
  const shouldRenderSegments = Boolean(
    parsedSegments
    && parsedSegments.length > 0
    && (
      !structuredSpeakerTag
      || parsedSegments.length > 1
      || parsedSegments.some((seg) => seg.tag && seg.tag !== structuredSpeakerTag)
    ),
  );
  const toolTrace = (
    <ToolTrace
      msg={msg}
      toolsExpanded={toolsExpanded}
      toggleToolPanel={toggleToolPanel}
      t={t}
    />
  );
  const streamingEl = msg.status === 'streaming' ? (
    <div className="mt-1">
      <StreamingActivityText label={activeStreamingLabel} compact={Boolean(effectiveMsg.content.trim())} />
    </div>
  ) : null;

  const hasChoiceHandlers = onWorkflowChoiceClick ?? onNakirosAction;
  const choicesEl = workflowChoices && hasChoiceHandlers ? (
    <WorkflowChoicesBlock
      question={workflowChoices.question}
      choices={workflowChoices.choices}
      onChoiceClick={onWorkflowChoiceClick ?? (() => undefined)}
      onNakirosAction={onNakirosAction}
    />
  ) : null;

  if (shouldRenderSegments && parsedSegments) {
    return (
      <div className="flex flex-col gap-2">
        {parsedSegments.map((seg, index) => {
          const isFirst = index === 0;
          const isLast = index === parsedSegments.length - 1;
          const { blocks } = extractOrchestrationBlocks(seg.content);
          const visibleContent = sanitizeVisibleMessageContent(seg.content);
          const tagSt = agentSegmentTagStyles(seg.tag, colorMap);
          const bodySt = agentSegmentBodyStyles(seg.tag, colorMap);
          return (
            <div key={index}>
              {seg.tag && (
                <div className="mb-1 flex items-center gap-1.5">
                  <span className={tagSt.className} style={tagSt.style}>{seg.tag}</span>
                  {isFirst && effectiveMsg.status === 'error' && (
                    <span className="text-[10px] text-[#ef4444]">{t('error')}</span>
                  )}
                </div>
              )}
              <div className={bodySt.className} style={bodySt.style}>
                {isFirst && msg.tools.length > 0 && <div className={TOOL_TRACE_CLASS}>{toolTrace}</div>}
                {visibleContent && (
                  <div className="agent-md">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{visibleContent}</ReactMarkdown>
                    {isLast && effectiveMsg.status === 'streaming' && visibleContent && (
                      <span className={CURSOR_CLASS}>▌</span>
                    )}
                  </div>
                )}
                {blocks.length > 0 && <OrchestrationSummary blocks={blocks} t={t} />}
                {isLast && choicesEl}
              </div>
            </div>
          );
        })}
        <ActionResults msg={msg} />
        {streamingEl}
      </div>
    );
  }

  return (
    <div>
      <div className={AGENT_HEADER_CLASS}>
        {speakerTagSt ? (
          <span className={speakerTagSt.className} style={speakerTagSt.style}>{structuredSpeakerTag}</span>
        ) : (
          <>
            <Bot size={13} color="var(--primary)" />
            <span className="text-[11px] font-bold text-[var(--primary)]">{t('agent')}</span>
          </>
        )}
        {effectiveMsg.status === 'error' && <span className="text-[10px] text-[#ef4444]">{t('error')}</span>}
      </div>
      {msg.tools.length > 0 && <div className={TOOL_TRACE_CLASS}>{toolTrace}</div>}
      {(effectiveMsg.content.trim() || effectiveMsg.status === 'error') && (
        <MessageBody
          msg={effectiveMsg}
          t={t}
          useStructuredSpeakerStyling={Boolean(structuredSpeakerTag)}
          speakerTag={structuredSpeakerTag ?? ''}
          colorMap={colorMap}
        />
      )}
      {choicesEl}
      <ActionResults msg={msg} />
      {streamingEl}
    </div>
  );
}

function EmptyState({
  emptyStateRepoExample,
  t,
}: {
  emptyStateRepoExample: string;
  t: TFunction<'agent'>;
}) {
  return (
    <div className={EMPTY_STATE_CLASS}>
      <Bot size={32} color="var(--line-strong)" className="mb-2.5" />
      <p className="m-0 text-sm font-semibold text-[var(--text)]">{t('emptyTitle')}</p>
      <p className="mb-0 mt-1 max-w-[640px] text-[11px] leading-5 text-[var(--text-muted)]">
        {t('emptySubtitle')}
      </p>
      <div className="mt-4 flex w-full max-w-[720px] flex-col gap-2 text-left">
        <EmptyHint title={t('emptyHintAgent')} value={t('emptyHintAgentExample')} />
        <EmptyHint title={t('emptyHintInvite')} value={t('emptyHintInviteExample')} />
        <EmptyHint title={t('emptyHintRepo')} value={emptyStateRepoExample} />
        <EmptyHint title={t('emptyHintWorkflow')} value={t('emptyHintWorkflowExample')} />
      </div>
    </div>
  );
}

function EmptyHint({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-[14px] border border-[var(--line)] bg-[var(--bg-soft)] px-3 py-2">
      <div className="text-[11px] font-semibold text-[var(--text)]">{title}</div>
      <code className="mt-1 inline-block rounded-[10px] bg-[var(--bg-muted)] px-2 py-1 text-[11px] text-[var(--text)]">
        {value}
      </code>
    </div>
  );
}

export function WorkflowProgressBar({
  current,
  total,
  label,
}: {
  current: number;
  total: number;
  label: string;
}) {
  const pct = Math.min(100, Math.round((current / total) * 100));
  return (
    <div className={WORKFLOW_PROGRESS_BAR_WRAPPER_CLASS}>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className={WORKFLOW_PROGRESS_STEP_BADGE_CLASS}>
          {current}/{total}
        </span>
        <span className="truncate text-[11px] text-[var(--text-secondary)]">{label}</span>
      </div>
      <div className={WORKFLOW_PROGRESS_TRACK_CLASS}>
        <div
          className={WORKFLOW_PROGRESS_FILL_CLASS}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function AgentMessagesPane({
  messages,
  emptyStateRepoExample,
  activeStreamingLabel,
  isToolPanelExpanded,
  toggleToolPanel,
  t,
  colorMap,
  knownTags,
  onWorkflowChoiceClick,
  onNakirosAction,
}: AgentMessagesPaneProps) {
  if (messages.length === 0) {
    return <EmptyState emptyStateRepoExample={emptyStateRepoExample} t={t} />;
  }

  // Find the id of the last agent message — choices only render on it
  let lastAgentMessageId: string | null = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'agent') {
      lastAgentMessageId = messages[i]!.id;
      break;
    }
  }

  return (
    <>
      {messages.map((msg) => (
        msg.role === 'separator' ? (
          <div key={msg.id} className="my-2 flex select-none items-center gap-2 text-xs text-muted-foreground/60">
            <div className="h-px flex-1 bg-border/50" />
            <span>{msg.separatorLabel}</span>
            <div className="h-px flex-1 bg-border/50" />
          </div>
        ) : (
          <div key={msg.id} className={msg.role === 'user' ? USER_MSG_WRAPPER_CLASS : AGENT_MSG_WRAPPER_CLASS}>
            {msg.role === 'user' ? (
              <div className={USER_MSG_BUBBLE_CLASS}>{msg.content}</div>
            ) : (
              <AgentMessageItem
                msg={msg}
                activeStreamingLabel={activeStreamingLabel}
                isToolPanelExpanded={isToolPanelExpanded}
                toggleToolPanel={toggleToolPanel}
                t={t}
                colorMap={colorMap}
                knownTags={knownTags}
                isLastAgentMessage={msg.id === lastAgentMessageId}
                onWorkflowChoiceClick={onWorkflowChoiceClick}
                onNakirosAction={onNakirosAction}
              />
            )}
          </div>
        )
      ))}
    </>
  );
}

const EMPTY_STATE_CLASS = 'm-auto flex flex-col items-center text-center text-[13px] text-[var(--text-muted)]';
const STREAMING_ACTIVITY_CLASS =
  'inline-flex max-w-full items-center gap-1.5 rounded-[10px] border border-[var(--line)] bg-[var(--bg-card)] px-2 py-1 text-[10px] text-[var(--text-muted)]';
const STREAMING_ACTIVITY_COMPACT_CLASS =
  'inline-flex max-w-full items-center gap-1 text-[10px] text-[var(--text-muted)]';
const STREAMING_PULSE_DOT_CLASS =
  'inline-block h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[var(--primary)]';
const USER_MSG_WRAPPER_CLASS = 'flex justify-end';
const AGENT_MSG_WRAPPER_CLASS = 'flex flex-col';
const USER_MSG_BUBBLE_CLASS =
  'max-w-[72%] whitespace-pre-wrap break-words rounded-[10px_10px_8px_10px] bg-[var(--primary)] px-[13px] py-[9px] text-[13px] leading-[1.5] text-white';
const AGENT_HEADER_CLASS = 'mb-1.5 flex items-center gap-1.5';
const TOOL_TRACE_CLASS =
  'mb-2 flex flex-col gap-[3px] rounded-[8px_10px_10px_8px] border-l-2 border-[var(--primary)] bg-[var(--bg-muted)] px-2.5 py-1.5';
const TOOL_TRACE_TOGGLE_CLASS =
  'mb-0 flex w-full items-center justify-between border-none bg-transparent p-0 text-[9px] leading-[1.2] text-[var(--text-muted)] opacity-85';
const TOOL_ROW_CLASS = 'flex items-center gap-1.5';
const ACTION_RESULT_ROW_CLASS = 'mt-1 text-[11px] italic text-[var(--text-muted)]';
const TOOL_ROW_STREAMING_CLASS = 'flex items-center gap-1.5 opacity-50';
const TOOL_DISPLAY_TEXT_CLASS =
  'truncate whitespace-nowrap font-mono text-[11px] text-[var(--text-muted)]';
const CURSOR_CLASS = 'animate-pulse text-[var(--primary)]';
const WORKFLOW_PROGRESS_BAR_WRAPPER_CLASS =
  'flex shrink-0 items-center gap-3 border-b border-[var(--line)] bg-[var(--bg-card)] px-4 py-2';
const WORKFLOW_PROGRESS_STEP_BADGE_CLASS =
  'shrink-0 rounded-md bg-[var(--primary)]/10 px-1.5 py-0.5 font-["Space_Mono"] text-[10px] font-bold text-[var(--primary)]';
const WORKFLOW_PROGRESS_TRACK_CLASS =
  'h-1 w-24 shrink-0 overflow-hidden rounded-full bg-[var(--line)]';
const WORKFLOW_PROGRESS_FILL_CLASS =
  'h-full rounded-full bg-[var(--primary)] transition-[width] duration-500';
const WORKFLOW_CHOICE_BTN_CLASS =
  'inline-flex cursor-pointer items-center gap-2 rounded-[10px] border border-[var(--primary)]/30 bg-[var(--primary)]/6 px-3 py-1.5 text-[12px] font-medium text-[var(--text)] transition-colors hover:border-[var(--primary)]/60 hover:bg-[var(--primary)]/12 active:scale-[0.98]';
const WORKFLOW_CHOICE_INDEX_CLASS =
  'flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--primary)]/15 text-[10px] font-bold text-[var(--primary)]';
const AGENT_SEGMENT_TAG_BASE_CLASS =
  'rounded-lg border px-2 py-0.5 font-["Space_Mono"] text-[10px] font-bold tracking-[0.04em]';
const AGENT_SEGMENT_BODY_BASE_CLASS =
  'rounded-[0_10px_10px_10px] border border-l-[3px] px-[14px] py-[10px]';

type AgentColorStyles = { className: string; style?: React.CSSProperties };

/**
 * Inline styles pour les badges tag — couleurs dérivées du colorMap dynamique.
 * Inline styles are unavoidable here: colors come from manifest at runtime, not build time.
 */
function agentSegmentTagStyles(tag: string, colorMap: Record<string, { accent: string; bg: string }>): AgentColorStyles {
  const colors = colorMap[tag];
  if (!colors) {
    return { className: `${AGENT_SEGMENT_TAG_BASE_CLASS} border-[var(--primary)] bg-[var(--bg-soft)] text-[var(--primary)]` };
  }
  return {
    className: AGENT_SEGMENT_TAG_BASE_CLASS,
    style: { borderColor: `${colors.accent}40`, backgroundColor: colors.bg, color: colors.accent },
  };
}

/**
 * Inline styles pour les corps de segment — couleurs dérivées du colorMap dynamique.
 * Inline styles are unavoidable here: colors come from manifest at runtime, not build time.
 */
function agentSegmentBodyStyles(tag: string, colorMap: Record<string, { accent: string; bg: string }>): AgentColorStyles {
  const colors = colorMap[tag];
  if (!colors) {
    return { className: `${AGENT_SEGMENT_BODY_BASE_CLASS} border-[var(--line)] border-l-[var(--primary)] bg-[var(--bg-soft)]` };
  }
  return {
    className: AGENT_SEGMENT_BODY_BASE_CLASS,
    style: { borderColor: `${colors.accent}25`, borderLeftColor: colors.accent, backgroundColor: colors.bg },
  };
}

function toolTraceChevronClass(expanded: boolean): string {
  return expanded ? 'transition-transform rotate-0' : 'transition-transform -rotate-90';
}

function agentMessageContainerClass(status: MessageStatus): string {
  return status === 'error'
    ? 'rounded-[8px_10px_10px_10px] border border-[rgba(239,68,68,0.25)] bg-[rgba(239,68,68,0.06)] px-4 py-3'
    : 'rounded-[8px_10px_10px_10px] border border-[var(--line)] bg-[var(--bg-soft)] px-4 py-3';
}
