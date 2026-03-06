import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import {
  Bot,
  ChevronDown,
  Send,
  Terminal,
  FileText,
  Code2,
  Search,
  Globe,
  ListTodo,
  Wrench,
  Clock,
  Trash2,
  Plus,
  X,
} from 'lucide-react';
import type {
  AgentProvider,
  AgentRunRequest,
  ChatScopeMode,
  StoredAgentTab,
  StoredConversation,
  StoredRepo,
} from '@nakiros/shared';
import SessionFeedback, { type SessionFeedbackHandle } from './SessionFeedback.js';
import {
  AGENT_DEFINITIONS,
  AGENT_COLORS,
  getAgentDefinitionLabel,
  resolveAgentDefinitions,
  type AgentDefinition,
} from '../constants/agents';
import i18n from '../i18n/index';
import { useIpcListener } from '../hooks/useIpcListener';
import { usePreferences } from '../hooks/usePreferences';

interface SlashCommandOption {
  id: string;
  command: string;
  label: string;
  kind: 'agent' | 'workflow';
}

interface AgentMentionOption {
  tag: string;
  token: string;
  label: string;
}

interface StreamingActivityLabel {
  primary: string;
  detail: string;
}

interface ProjectScopeOption {
  id: string;
  token: string;
  repoPath: string;
  label: string;
  isWorkspace: boolean;
}

interface ActiveMentionContext {
  query: string;
  start: number;
}

interface ActiveProjectScopeContext {
  query: string;
  start: number;
}

interface ProjectScopeResolution {
  mentionedRepoPaths: string[];
  mentionedTokens: string[];
  scopeOnlyMessage: boolean;
}

// ─── Multi-agent message rendering ───────────────────────────────────────────

const AGENT_TAG_PATTERN = new RegExp(
  `(?<!@)\\[(${Object.keys(AGENT_COLORS).join('|')})\\]`,
  'g',
);
const AGENT_ID_TO_TAG: Record<string, string> = {
  nakiros: 'Nakiros',
  pm: 'PM',
  architect: 'Architect',
  dev: 'Dev',
  sm: 'SM',
  qa: 'QA',
  hotfix: 'Hotfix',
  brainstorming: 'Brainstorming',
};
const AGENT_TAG_TO_ID: Record<string, string> = Object.fromEntries(
  Object.entries(AGENT_ID_TO_TAG).map(([id, tag]) => [tag, id]),
);

interface AgentSegment { tag: string; content: string }

function parseAgentSegments(content: string): AgentSegment[] | null {
  const pattern = new RegExp(AGENT_TAG_PATTERN.source, 'g');
  if (!pattern.test(content)) return null;
  pattern.lastIndex = 0;
  const segments: AgentSegment[] = [];
  let lastTag = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    const chunk = content.slice(lastIndex, match.index).trim();
    if (chunk) segments.push({ tag: lastTag, content: chunk });
    lastTag = match[1] ?? '';
    lastIndex = match.index + match[0].length;
  }
  const tail = content.slice(lastIndex).trim();
  if (tail) segments.push({ tag: lastTag, content: tail });
  return segments.length > 0 ? segments : null;
}

function generateTitle(text: string, commandLabelMap: Record<string, string>, defaultTitle: string): string {
  const trimmed = text.trim();
  for (const [cmd, name] of Object.entries(commandLabelMap)) {
    if (trimmed === cmd || trimmed.startsWith(`${cmd} `) || trimmed.startsWith(`${cmd}\n`)) {
      const args = trimmed.slice(cmd.length).trim();
      return args ? `${name} · ${args.slice(0, 40)}` : name;
    }
  }
  const words = trimmed.split(/\s+/);
  const short = words.slice(0, 8).join(' ').trim();
  if (!short) return defaultTitle;
  return words.length > 8 ? `${short}…` : short;
}

function matchCommandDefinition(text: string, definitions: AgentDefinition[]): AgentDefinition | null {
  const trimmed = text.trim();
  return definitions.find((definition) => (
    trimmed === definition.command
    || trimmed.startsWith(`${definition.command} `)
    || trimmed.startsWith(`${definition.command}\n`)
  )) ?? null;
}

function extractSlashFilter(input: string): string | null {
  const trimmedStart = input.trimStart();
  const match = trimmedStart.match(/^\/\S*$/);
  return match ? match[0].toLowerCase() : null;
}

function extractActiveMentionContext(input: string): ActiveMentionContext | null {
  const mentionPattern = /(^|\s)@([^\s@]*)$/;
  const match = mentionPattern.exec(input);
  if (!match) return null;
  const fullMatch = match[0];
  const mentionIndex = fullMatch.lastIndexOf('@');
  if (mentionIndex < 0) return null;
  return {
    query: (match[2] ?? '').toLowerCase(),
    start: match.index + mentionIndex,
  };
}

function extractActiveProjectScopeContext(input: string): ActiveProjectScopeContext | null {
  const projectPattern = /(^|\s)#([^\s#]*)$/;
  const match = projectPattern.exec(input);
  if (!match) return null;
  const fullMatch = match[0];
  const hashIndex = fullMatch.lastIndexOf('#');
  if (hashIndex < 0) return null;
  return {
    query: (match[2] ?? '').toLowerCase(),
    start: match.index + hashIndex,
  };
}

function normalizeProjectScopeToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function toWorkspaceSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'workspace';
}

function resolveProjectScopeInMessage(
  input: string,
  tokenToRepoPath: Map<string, string>,
): ProjectScopeResolution {
  const pattern = /(^|\s)#([^\s#]+)/g;
  let match: RegExpExecArray | null;
  const mentionedRepoPaths: string[] = [];
  const mentionedTokens: string[] = [];
  const seenRepoPaths = new Set<string>();
  const recognizedRanges: Array<{ start: number; end: number }> = [];

  while ((match = pattern.exec(input)) !== null) {
    const leading = match[1] ?? '';
    const rawToken = match[2] ?? '';
    const token = normalizeProjectScopeToken(rawToken);
    if (!token || !tokenToRepoPath.has(token)) continue;
    const repoPath = tokenToRepoPath.get(token);
    if (!repoPath) continue;
    if (!seenRepoPaths.has(repoPath)) {
      seenRepoPaths.add(repoPath);
      mentionedRepoPaths.push(repoPath);
    }
    mentionedTokens.push(token);
    const start = match.index + leading.length;
    recognizedRanges.push({ start, end: start + 1 + rawToken.length });
  }

  let remainingText = input;
  for (const range of recognizedRanges.slice().reverse()) {
    remainingText = `${remainingText.slice(0, range.start)} ${remainingText.slice(range.end)}`;
  }

  return {
    mentionedRepoPaths,
    mentionedTokens,
    scopeOnlyMessage: recognizedRanges.length > 0 && remainingText.trim().length === 0,
  };
}

// ─── Raw NDJSON → UI messages ─────────────────────────────────────────────────

function formatToolDisplay(name: string, input: Record<string, unknown>): string {
  const t = i18n.getFixedT(i18n.language, 'agent');
  const s = (v: unknown) => String(v ?? '');
  const truncate = (str: string, max = 72) => str.length > max ? `${str.slice(0, max)}…` : str;
  switch (name) {
    case 'Read': return t('tools.reading', { path: s(input['file_path']) });
    case 'Write': return t('tools.writing', { path: s(input['file_path']) });
    case 'Edit':
    case 'MultiEdit':
      return t('tools.editing', { path: s(input['file_path']) });
    case 'Bash': return t('tools.bash', { command: truncate(s(input['command'])) });
    case 'Glob': return t('tools.glob', { pattern: s(input['pattern']) });
    case 'Grep': return t('tools.grep', { pattern: s(input['pattern']), path: s(input['path'] ?? '.') });
    case 'TodoWrite': return t('tools.todoWrite');
    case 'WebFetch': return t('tools.webFetch', { url: truncate(s(input['url']), 60) });
    case 'WebSearch': return t('tools.webSearch', { query: s(input['query']) });
    case 'Task': return t('tools.task', { description: truncate(s(input['description']), 60) });
    default: return name;
  }
}

function rawToUiMessages(rawMessages: unknown[]): Message[] {
  const result: Message[] = [];
  let agentContent = '';
  let agentTools: ToolActivity[] = [];
  let inAgentTurn = false;
  let hasEmittedText = false;
  const seenToolKeys = new Set<string>();

  function appendTool(name: string, input: Record<string, unknown> = {}) {
    const display = formatToolDisplay(name, input);
    const key = `${name}::${display}`;
    if (seenToolKeys.has(key)) return;
    seenToolKeys.add(key);
    agentTools.push({ name, display });
  }

  function flushAgent() {
    if (!inAgentTurn) return;
    result.push({
      id: `restored-agent-${result.length}-${Date.now()}`,
      role: 'agent',
      content: agentContent,
      status: 'complete',
      tools: agentTools,
    });
    agentContent = '';
    agentTools = [];
    inAgentTurn = false;
    hasEmittedText = false;
    seenToolKeys.clear();
  }

  for (const raw of rawMessages) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;

    if (item['type'] === 'user') {
      // Skip Claude's internal tool_result user events (verbose stream).
      // Real human messages always have content as a top-level string.
      if (typeof item['content'] !== 'string') continue;
      flushAgent();
      result.push({
        id: `restored-user-${result.length}-${Date.now()}`,
        role: 'user',
        content: item['content'],
        status: 'complete',
        tools: [],
      });
      continue;
    }

    // Claude-like assistant event
    if (item['type'] === 'assistant') {
      inAgentTurn = true;
      const msg = item['message'] as Record<string, unknown> | undefined;
      const blocks = msg?.['content'];
      if (Array.isArray(blocks)) {
        for (const block of blocks) {
          if (!block || typeof block !== 'object') continue;
          const b = block as Record<string, unknown>;
          if (b['type'] === 'text' && typeof b['text'] === 'string') {
            agentContent += b['text'];
            hasEmittedText = true;
          } else if (b['type'] === 'tool_use' && typeof b['name'] === 'string') {
            const inp = (b['input'] as Record<string, unknown>) ?? {};
            appendTool(b['name'], inp);
          }
        }
      }
      continue;
    }

    // Result event (text fallback)
    if (item['type'] === 'result') {
      inAgentTurn = true;
      if (!hasEmittedText && typeof item['result'] === 'string') {
        agentContent += item['result'];
      }
      continue;
    }

    // Codex: item.completed with agent_message
    if (item['type'] === 'item.completed') {
      inAgentTurn = true;
      const itm = item['item'] as Record<string, unknown> | undefined;
      if (itm?.['type'] === 'agent_message' && typeof itm['text'] === 'string') {
        agentContent += itm['text'];
        hasEmittedText = true;
      } else if (itm?.['type'] === 'command_execution' && typeof itm['command'] === 'string') {
        appendTool('Bash', { command: itm['command'] });
      }
      continue;
    }

    // Codex: command starts (tool execution)
    if (item['type'] === 'item.started') {
      inAgentTurn = true;
      const itm = item['item'] as Record<string, unknown> | undefined;
      if (itm?.['type'] === 'command_execution' && typeof itm['command'] === 'string') {
        appendTool('Bash', { command: itm['command'] });
      }
      continue;
    }
  }

  flushAgent();
  return result;
}

const MAX_TABS = 12;
const TAB_SAVE_DEBOUNCE_MS = 320;
const DEFAULT_DESKTOP_NOTIFICATION_MIN_DURATION_SECONDS = 60;

type MessageStatus = 'complete' | 'streaming' | 'error';

interface ToolActivity {
  name: string;
  display: string;
}

interface Message {
  id: string;
  role: 'user' | 'agent';
  content: string;
  status: MessageStatus;
  tools: ToolActivity[];
}

interface AgentTabState {
  id: string;
  title: string;
  mode: ChatScopeMode;
  anchorRepoPath: string;
  activeRepoPaths: string[];
  lastResolvedRepoMentions: string[];
  repoPath: string;
  provider: AgentProvider;
  input: string;
  messages: Message[];
  activeRunId: string | null;
  runningCommand: string | null;
  sessionId: string | null;
  conversationId: string | null;
  pendingTitle: string | null;
  hasUnread: boolean;
  hasRunCompletionNotice: boolean;
}

interface Props {
  workspaceId: string;
  workspaceName?: string;
  repos: StoredRepo[];
  workspacePath?: string;
  initialRepoPath?: string;
  initialMessage?: string;
  initialAgentId?: string;
  persistentHistory?: boolean;
  onDone?: () => void;
  isVisible?: boolean;
  onRunCompletionNoticeChange?: (workspaceId: string, pendingCount: number) => void;
  openChatTarget?: OpenAgentRunChatPayload | null;
}

function ToolIcon({ name }: { name: string }) {
  const size = 11;
  const color = 'var(--primary)';
  switch (name) {
    case 'Read':
      return <FileText size={size} color={color} />;
    case 'Write':
    case 'Edit':
    case 'MultiEdit':
      return <Code2 size={size} color={color} />;
    case 'Bash':
      return <Terminal size={size} color={color} />;
    case 'Glob':
    case 'Grep':
      return <Search size={size} color={color} />;
    case 'WebFetch':
    case 'WebSearch':
      return <Globe size={size} color={color} />;
    case 'TodoWrite':
      return <ListTodo size={size} color={color} />;
    default:
      return <Wrench size={size} color={color} />;
  }
}

function providerLabel(provider: AgentProvider): string {
  if (provider === 'codex') return 'Codex';
  if (provider === 'cursor') return 'Cursor';
  return 'Claude';
}

function pickNextRandomIndex(length: number, currentIndex: number): number {
  if (length <= 1) return 0;
  let nextIndex = currentIndex;
  while (nextIndex === currentIndex) {
    nextIndex = Math.floor(Math.random() * length);
  }
  return nextIndex;
}

function startsWithNakirosSlashCommand(input: string): boolean {
  const normalized = input.trimStart();
  return normalized.startsWith('/nak-') || normalized.startsWith('/nak:');
}

function isAgentProvider(value: unknown): value is AgentProvider {
  return value === 'claude' || value === 'codex' || value === 'cursor';
}

function extractMeetingAgentTags(messages: Message[], seededTag?: string): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();
  const addTag = (tag: string) => {
    if (!tag || !(tag in AGENT_COLORS) || seen.has(tag)) return;
    seen.add(tag);
    ordered.push(tag);
  };

  if (seededTag) addTag(seededTag);

  const pattern = new RegExp(AGENT_TAG_PATTERN.source, 'g');
  for (const message of messages) {
    if (message.role !== 'agent') continue;
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(message.content)) !== null) {
      addTag(match[1] ?? '');
    }
  }

  return ordered;
}

function MessageContent({ msg }: { msg: Pick<Message, 'content' | 'status'> }) {
  const segments = msg.status !== 'error' ? parseAgentSegments(msg.content) : null;

  if (segments && segments.length > 0) {
    return (
      <div className="flex flex-col gap-2">
        {segments.map((seg, i) => {
          const isLast = i === segments.length - 1;
          return (
            <div key={i}>
              {seg.tag && (
                <div className="mb-1">
                  <span className={agentSegmentTagClass(seg.tag)}>
                    {seg.tag}
                  </span>
                </div>
              )}
              <div className={agentSegmentBodyClass(seg.tag)}>
                <div className="agent-md">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {seg.content || ' '}
                  </ReactMarkdown>
                  {isLast && msg.status === 'streaming' && seg.content && (
                    <span className={CURSOR_CLASS}>▌</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className={agentMessageContainerClass(msg.status)}>
      <div className={`agent-md${msg.status === 'error' ? ' agent-md--error' : ''}`}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {msg.content || ' '}
        </ReactMarkdown>
        {msg.status === 'streaming' && msg.content && (
          <span className={CURSOR_CLASS}>▌</span>
        )}
      </div>
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

export default function AgentPanel({
  workspaceId,
  workspaceName,
  repos,
  workspacePath,
  initialRepoPath,
  initialMessage,
  initialAgentId,
  persistentHistory,
  onDone,
  isVisible = true,
  onRunCompletionNoticeChange,
  openChatTarget,
}: Props) {
  const { t } = useTranslation('agent');
  const { preferences } = usePreferences();
  const defaultTabTitle = t('newConversation');
  const desktopNotificationsEnabled = preferences.desktopNotificationsEnabled !== false;
  const desktopNotificationMinDurationSeconds = Math.min(
    3600,
    Math.max(
      0,
      Math.round(preferences.desktopNotificationMinDurationSeconds ?? DEFAULT_DESKTOP_NOTIFICATION_MIN_DURATION_SECONDS),
    ),
  );
  const [agentDefinitions, setAgentDefinitions] = useState<AgentDefinition[]>(AGENT_DEFINITIONS);
  const commandLabelMap = useMemo(
    () => Object.fromEntries(
      agentDefinitions.map((definition) => [
        definition.command,
        getAgentDefinitionLabel(definition, t),
      ]),
    ),
    [agentDefinitions, t],
  );
  const slashCommands = useMemo<SlashCommandOption[]>(
    () => agentDefinitions.map((definition) => ({
      id: definition.id,
      command: definition.command,
      label: getAgentDefinitionLabel(definition, t),
      kind: definition.kind,
    })),
    [agentDefinitions, t],
  );
  const [tabs, setTabs] = useState<AgentTabState[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<StoredConversation[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [defaultProvider, setDefaultProvider] = useState<AgentProvider>('claude');
  const [tabsLoaded, setTabsLoaded] = useState(false);
  const [tabLimitMessage, setTabLimitMessage] = useState<string | null>(null);
  const [highlightedSlashIndex, setHighlightedSlashIndex] = useState(0);
  const [highlightedMentionIndex, setHighlightedMentionIndex] = useState(0);
  const [highlightedProjectScopeIndex, setHighlightedProjectScopeIndex] = useState(0);
  const [expandedToolPanels, setExpandedToolPanels] = useState<Record<string, boolean>>({});
  const [thinkingStateIndex, setThinkingStateIndex] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const activeSlashItemRef = useRef<HTMLButtonElement>(null);
  const activeMentionItemRef = useRef<HTMLButtonElement>(null);
  const activeProjectScopeItemRef = useRef<HTMLButtonElement>(null);
  const tabCounterRef = useRef(0);
  const runToTabIdRef = useRef(new Map<string, string>());
  const cancelledRunIdsRef = useRef(new Set<string>());
  const tabsRef = useRef<AgentTabState[]>([]);
  const conversationsRef = useRef<StoredConversation[]>([]);
  const activeTabIdRef = useRef<string | null>(null);
  const persistTimerRef = useRef<number | null>(null);
  const lastHandledOpenChatEventIdRef = useRef<string | null>(null);
  const initialMessageSentRef = useRef(false);
  const runStartedAtRef = useRef(new Map<string, number>());
  const sessionStartTimesRef = useRef(new Map<string, number>());
  const tabRawLinesRef = useRef(new Map<string, unknown[]>());
  const feedbackRefsMap = useRef(new Map<string, React.RefObject<SessionFeedbackHandle | null>>());
  const workspaceSlug = useMemo(() => toWorkspaceSlug(workspaceName || workspaceId), [workspaceId, workspaceName]);

  const repoPathSet = useMemo(() => new Set(repos.map((repo) => repo.localPath)), [repos]);
  const projectScopeOptions = useMemo<ProjectScopeOption[]>(() => {
    const options: ProjectScopeOption[] = [];
    const usedTokens = new Set<string>();
    const reserveToken = (base: string): string => {
      const normalized = normalizeProjectScopeToken(base) || 'repo';
      if (!usedTokens.has(normalized)) {
        usedTokens.add(normalized);
        return normalized;
      }
      let suffix = 2;
      while (usedTokens.has(`${normalized}-${suffix}`)) suffix += 1;
      const token = `${normalized}-${suffix}`;
      usedTokens.add(token);
      return token;
    };

    for (const repo of repos) {
      const folderName = repo.localPath.split('/').pop() ?? '';
      const token = reserveToken(repo.name || folderName || 'repo');
      options.push({
        id: `${repo.localPath}::${token}`,
        token,
        repoPath: repo.localPath,
        label: repo.name || folderName || repo.localPath,
        isWorkspace: false,
      });
    }

    return options;
  }, [repos, t]);
  const projectScopeTokenToRepoPath = useMemo(
    () => new Map(projectScopeOptions.map((option) => [option.token, option.repoPath])),
    [projectScopeOptions],
  );
  const projectScopeTokenByRepoPath = useMemo(() => {
    const next = new Map<string, string>();
    for (const option of projectScopeOptions) {
      if (!next.has(option.repoPath)) next.set(option.repoPath, option.token);
    }
    return next;
  }, [projectScopeOptions]);

  const workspaceConversations = useMemo(
    () => conversations.filter((conv) => {
      if (!conv.workspaceId) return false;
      return conv.workspaceId === workspaceId;
    }),
    [conversations, workspaceId],
  );

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? null,
    [tabs, activeTabId],
  );
  const activeSlashFilter = useMemo(
    () => extractSlashFilter(activeTab?.input ?? ''),
    [activeTab?.input],
  );
  const filteredSlashCommands = useMemo(
    () => activeSlashFilter
      ? slashCommands.filter((item) => item.command.toLowerCase().startsWith(activeSlashFilter))
      : [],
    [activeSlashFilter, slashCommands],
  );
  const showSlashCommands = Boolean(activeTab && !activeTab.activeRunId && activeSlashFilter);
  const thinkingStateLabels = useMemo(
    () => [
      t('thinkingStates.analyzingContext'),
      t('thinkingStates.readingWorkspace'),
      t('thinkingStates.exploringFiles'),
      t('thinkingStates.verifyingScope'),
      t('thinkingStates.searchingKeyAreas'),
      t('thinkingStates.structuringResponse'),
      t('thinkingStates.preparingNextSteps'),
      t('thinkingStates.crossCheckingContext'),
      t('thinkingStates.consolidatingFindings'),
    ],
    [t],
  );
  const activeStreamingLabel = useMemo<StreamingActivityLabel>(() => ({
    primary: t('thinkingPrimary'),
    detail: thinkingStateLabels[thinkingStateIndex] ?? thinkingStateLabels[0] ?? t('thinking'),
  }), [t, thinkingStateIndex, thinkingStateLabels]);

  const hasReachedTabLimit = tabs.length >= MAX_TABS;
  const completionNoticeCount = useMemo(
    () => tabs.reduce((count, tab) => (tab.hasRunCompletionNotice ? count + 1 : count), 0),
    [tabs],
  );

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  useEffect(() => {
    if (!activeTab?.activeRunId) return undefined;
    setThinkingStateIndex((current) => pickNextRandomIndex(thinkingStateLabels.length, current));
    const timer = window.setInterval(() => {
      setThinkingStateIndex((current) => pickNextRandomIndex(thinkingStateLabels.length, current));
    }, 2600);
    return () => window.clearInterval(timer);
  }, [activeTab?.activeRunId, thinkingStateLabels.length]);

  useEffect(() => {
    onRunCompletionNoticeChange?.(workspaceId, completionNoticeCount);
  }, [workspaceId, completionNoticeCount, onRunCompletionNoticeChange]);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

  useEffect(() => {
    if (!tabsLoaded || !openChatTarget) return;
    if (openChatTarget.workspaceId !== workspaceId) return;

    const eventId = openChatTarget.eventId
      ?? `fallback-${openChatTarget.workspaceId}-${openChatTarget.tabId ?? ''}-${openChatTarget.conversationId ?? ''}`;
    if (lastHandledOpenChatEventIdRef.current === eventId) return;
    lastHandledOpenChatEventIdRef.current = eventId;

    const targetTab = openChatTarget.tabId
      ? tabsRef.current.find((tab) => tab.id === openChatTarget.tabId)
      : null;
    if (targetTab) {
      selectTab(targetTab.id);
      return;
    }

    const targetConversationId = openChatTarget.conversationId ?? null;
    if (targetConversationId) {
      const tabWithConversation = tabsRef.current.find((tab) => tab.conversationId === targetConversationId);
      if (tabWithConversation) {
        selectTab(tabWithConversation.id);
        return;
      }
      const conversation = conversationsRef.current.find((item) => item.id === targetConversationId);
      if (conversation) {
        void openConversationFromHistory(conversation);
        return;
      }
    }

    const fallbackTab = tabsRef.current.find((tab) => tab.hasRunCompletionNotice) ?? tabsRef.current[0];
    if (fallbackTab) selectTab(fallbackTab.id);
  }, [openChatTarget, tabsLoaded, workspaceId]);

  useEffect(() => {
    let cancelled = false;
    void window.nakiros.getInstalledCommands()
      .then((commands) => {
        if (cancelled) return;
        setAgentDefinitions(resolveAgentDefinitions(commands));
      })
      .catch(() => {
        if (cancelled) return;
        setAgentDefinitions(AGENT_DEFINITIONS);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => () => {
    const runIds = Array.from(new Set(
      tabsRef.current
        .map((tab) => tab.activeRunId)
        .filter((runId): runId is string => Boolean(runId)),
    ));
    for (const runId of runIds) {
      runToTabIdRef.current.delete(runId);
      runStartedAtRef.current.delete(runId);
      void window.nakiros.agentCancel(runId);
    }
    runStartedAtRef.current.clear();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeTab?.messages]);

  useEffect(() => {
    if (!isVisible) return;
    if (!activeTab?.hasRunCompletionNotice) return;
    const frame = window.requestAnimationFrame(() => {
      const container = messagesContainerRef.current;
      if (!container) return;
      const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight <= 24;
      if (!atBottom) return;
      setTabsAndRef((prev) => prev.map((tab) => (
        tab.id === activeTab.id && tab.hasRunCompletionNotice
          ? { ...tab, hasRunCompletionNotice: false }
          : tab
      )));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isVisible, activeTab?.id, activeTab?.hasRunCompletionNotice, activeTab?.messages.length]);

  useEffect(() => {
    setHighlightedSlashIndex(0);
  }, [activeSlashFilter, activeTabId]);

  useEffect(() => {
    if (filteredSlashCommands.length === 0) return;
    setHighlightedSlashIndex((prev) => Math.min(prev, filteredSlashCommands.length - 1));
  }, [filteredSlashCommands.length]);

  useEffect(() => {
    if (!showSlashCommands || filteredSlashCommands.length === 0) return;
    window.requestAnimationFrame(() => {
      activeSlashItemRef.current?.scrollIntoView({ block: 'nearest' });
    });
  }, [showSlashCommands, filteredSlashCommands.length, highlightedSlashIndex]);

  function setTabsAndRef(updater: (prev: AgentTabState[]) => AgentTabState[]) {
    setTabs((prev) => {
      const next = updater(prev);
      tabsRef.current = next;
      return next;
    });
  }

  function selectTab(nextTabId: string | null) {
    activeTabIdRef.current = nextTabId;
    setTabsAndRef((prev) => prev.map((tab) => (
      tab.id === nextTabId
        ? {
          ...tab,
          hasUnread: false,
          hasRunCompletionNotice: isVisible ? false : tab.hasRunCompletionNotice,
        }
        : tab
    )));
    setActiveTabId(nextTabId);
  }

  function getRepoName(repoPath: string): string {
    return repos.find((repo) => repo.localPath === repoPath)?.name ?? repoPath.split('/').pop() ?? '';
  }

  function getDefaultRepoPath(): string {
    const preferredPath = workspacePath?.trim();
    if (preferredPath && repoPathSet.has(preferredPath)) return preferredPath;
    if (initialRepoPath && repoPathSet.has(initialRepoPath)) return initialRepoPath;
    return repos[0]?.localPath ?? '';
  }

  function resolveRepoPath(candidate: string | null | undefined): string {
    if (candidate && repoPathSet.has(candidate)) return candidate;
    return getDefaultRepoPath();
  }

  function makeTabId(): string {
    tabCounterRef.current += 1;
    return `tab-${Date.now()}-${tabCounterRef.current}`;
  }

  function buildTab(args: {
    id?: string;
    title?: string;
    mode?: ChatScopeMode;
    anchorRepoPath?: string;
    activeRepoPaths?: string[];
    lastResolvedRepoMentions?: string[];
    repoPath?: string;
    provider: AgentProvider;
    sessionId?: string | null;
    conversationId?: string | null;
    messages?: Message[];
  }): AgentTabState {
    const anchorRepoPath = resolveRepoPath(args.anchorRepoPath ?? args.repoPath ?? getDefaultRepoPath());
    const activeRepoPaths = Array.from(new Set(
      (args.activeRepoPaths ?? [])
        .map((path) => resolveRepoPath(path))
        .filter((path) => path.length > 0),
    ));
    return {
      id: args.id ?? makeTabId(),
      title: args.title ?? defaultTabTitle,
      mode: args.mode ?? 'global',
      anchorRepoPath,
      activeRepoPaths,
      lastResolvedRepoMentions: args.lastResolvedRepoMentions ?? [],
      repoPath: anchorRepoPath,
      provider: args.provider,
      input: '',
      messages: args.messages ?? [],
      activeRunId: null,
      runningCommand: null,
      sessionId: args.sessionId ?? null,
      conversationId: args.conversationId ?? null,
      pendingTitle: null,
      hasUnread: false,
      hasRunCompletionNotice: false,
    };
  }

  function markTabUnread(tabId: string) {
    if (activeTabIdRef.current === tabId) return;
    setTabsAndRef((prev) => prev.map((tab) => (
      tab.id === tabId ? { ...tab, hasUnread: true } : tab
    )));
  }

  function upsertConversation(nextConversation: StoredConversation) {
    setConversations((prev) => {
      const filtered = prev.filter((conv) => conv.id !== nextConversation.id);
      const next = [nextConversation, ...filtered].sort(
        (a, b) => new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime(),
      );
      conversationsRef.current = next;
      return next;
    });
    void window.nakiros.saveConversation(nextConversation);
  }

  function createConversationFromTab(tab: AgentTabState, sessionId: string, explicitTitle?: string): StoredConversation {
    const title = explicitTitle ?? tab.pendingTitle ?? tab.title ?? defaultTabTitle;
    const now = new Date().toISOString();
    return {
      id: `conv-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
      sessionId,
      workspaceId,
      workspaceSlug,
      workspaceName: workspaceName ?? workspaceId,
      mode: tab.mode,
      anchorRepoPath: tab.anchorRepoPath,
      activeRepoPaths: tab.activeRepoPaths,
      lastResolvedRepoMentions: tab.lastResolvedRepoMentions,
      repoPath: tab.anchorRepoPath,
      repoName: getRepoName(tab.anchorRepoPath),
      provider: tab.provider,
      title,
      agents: [],
      createdAt: now,
      lastUsedAt: now,
      messages: [],
    };
  }

  async function hydrateTabs() {
    const [storedConversations, prefs, storedTabs] = await Promise.all([
      window.nakiros.getConversations(workspaceId),
      window.nakiros.getPreferences(),
      window.nakiros.getAgentTabs(workspaceId),
    ]);

    const preferredProvider = prefs.agentProvider ?? 'claude';
    setDefaultProvider(preferredProvider);
    let mergedConversations = [...storedConversations];

    const conversationById = new Map(mergedConversations.map((conv) => [conv.id, conv]));

    const recoveredConversations: StoredConversation[] = [];
    for (const storedTab of storedTabs?.tabs ?? []) {
      const missingConversationId = storedTab.conversationId;
      if (!missingConversationId || conversationById.has(missingConversationId)) continue;

      const repoPath = resolveRepoPath(storedTab.repoPath);
      const now = new Date().toISOString();
      const recoveredConversation: StoredConversation = {
        id: missingConversationId,
        sessionId: storedTab.sessionId ?? `pending-${storedTab.tabId}`,
        workspaceId,
        workspaceSlug,
        workspaceName: workspaceName ?? workspaceId,
        mode: storedTab.mode ?? 'global',
        anchorRepoPath: resolveRepoPath(storedTab.anchorRepoPath ?? repoPath),
        activeRepoPaths: (storedTab.activeRepoPaths ?? []).map((path) => resolveRepoPath(path)),
        lastResolvedRepoMentions: storedTab.lastResolvedRepoMentions ?? [],
        repoPath,
        repoName: getRepoName(repoPath),
        provider: isAgentProvider(storedTab.provider) ? storedTab.provider : preferredProvider,
        title: storedTab.title || defaultTabTitle,
        agents: [],
        createdAt: now,
        lastUsedAt: now,
        messages: [],
      };
      recoveredConversations.push(recoveredConversation);
      conversationById.set(missingConversationId, recoveredConversation);
    }

    if (recoveredConversations.length > 0) {
      mergedConversations = [...mergedConversations, ...recoveredConversations].sort(
        (a, b) => new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime(),
      );
      for (const recovered of recoveredConversations) {
        void window.nakiros.saveConversation(recovered);
      }
    }

    conversationsRef.current = mergedConversations;
    setConversations(mergedConversations);

    const restoredTabs: AgentTabState[] = (storedTabs?.tabs ?? [])
      .map((storedTab: StoredAgentTab) => {
        const conv = storedTab.conversationId ? conversationById.get(storedTab.conversationId) : undefined;
        const provider = isAgentProvider(storedTab.provider)
          ? storedTab.provider
          : (conv?.provider ?? preferredProvider);
        const repoPath = resolveRepoPath(storedTab.repoPath ?? conv?.repoPath);
        if (!repoPath) return null;
        return buildTab({
          id: storedTab.tabId,
          title: storedTab.title || conv?.title || defaultTabTitle,
          mode: storedTab.mode ?? conv?.mode ?? 'global',
          anchorRepoPath: storedTab.anchorRepoPath ?? conv?.anchorRepoPath ?? repoPath,
          activeRepoPaths: storedTab.activeRepoPaths ?? conv?.activeRepoPaths ?? [],
          lastResolvedRepoMentions: storedTab.lastResolvedRepoMentions ?? conv?.lastResolvedRepoMentions ?? [],
          repoPath,
          provider,
          sessionId: storedTab.sessionId ?? conv?.sessionId ?? null,
          conversationId: conv?.id ?? storedTab.conversationId ?? null,
          messages: conv ? rawToUiMessages(conv.messages) : [],
        });
      })
      .filter(Boolean) as AgentTabState[];

    const initialTabs = restoredTabs.length > 0
      ? restoredTabs
      : [buildTab({ repoPath: getDefaultRepoPath(), provider: preferredProvider })];

    const initialActiveTabId = (storedTabs?.activeTabId && initialTabs.some((tab) => tab.id === storedTabs.activeTabId))
      ? storedTabs.activeTabId
      : initialTabs[0]?.id ?? null;

    tabsRef.current = initialTabs;
    activeTabIdRef.current = initialActiveTabId;
    setTabs(initialTabs);
    setActiveTabId(initialActiveTabId);
    setTabsLoaded(true);
  }

  useEffect(() => {
    let cancelled = false;
    runToTabIdRef.current.clear();
    cancelledRunIdsRef.current.clear();
    initialMessageSentRef.current = false;
    setShowHistory(false);
    setTabLimitMessage(null);
    setExpandedToolPanels({});
    setTabsLoaded(false);
    void (async () => {
      try {
        await hydrateTabs();
        if (cancelled) return;
      } catch {
        if (cancelled) return;
        const fallback = buildTab({ repoPath: getDefaultRepoPath(), provider: defaultProvider });
        tabsRef.current = [fallback];
        activeTabIdRef.current = fallback.id;
        setTabs([fallback]);
        setActiveTabId(fallback.id);
        setTabsLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
      if (persistTimerRef.current) {
        window.clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  useEffect(() => {
    if (!tabsLoaded) return;
    if (persistTimerRef.current) {
      window.clearTimeout(persistTimerRef.current);
    }
    persistTimerRef.current = window.setTimeout(() => {
      const state: StoredAgentTabsState = {
        workspaceId,
        activeTabId,
        tabs: tabs.map((tab) => ({
          tabId: tab.id,
          conversationId: tab.conversationId ?? undefined,
          workspaceId,
          workspaceSlug,
          workspaceName: workspaceName ?? workspaceId,
          mode: tab.mode,
          anchorRepoPath: tab.anchorRepoPath,
          activeRepoPaths: tab.activeRepoPaths,
          lastResolvedRepoMentions: tab.lastResolvedRepoMentions,
          repoPath: tab.anchorRepoPath,
          provider: tab.provider,
          title: tab.title,
          sessionId: tab.sessionId ?? undefined,
        })),
      };
      void window.nakiros.saveAgentTabs(workspaceId, state);
    }, TAB_SAVE_DEBOUNCE_MS);

    return () => {
      if (persistTimerRef.current) {
        window.clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
    };
  }, [workspaceId, workspaceSlug, workspaceName, tabs, activeTabId, tabsLoaded]);

  useIpcListener(window.nakiros.onAgentStart, ({ runId, command, cwd }) => {
    const tabId = runToTabIdRef.current.get(runId);
    if (!tabId) return;
    setTabsAndRef((prev) => prev.map((tab) => {
      if (tab.id !== tabId) return tab;
      return {
        ...tab,
        runningCommand: command,
        messages: tab.messages.map((msg) => (
          msg.id === `agent-${runId}` ? { ...msg, content: `_cwd: \`${cwd}\`_\n\n` } : msg
        )),
      };
    }));
  });

  useIpcListener(window.nakiros.onAgentEvent, ({ runId, event }) => {
    const tabId = runToTabIdRef.current.get(runId);
    if (!tabId) return;

    const evt = event as AgentStreamEvent;
    if (evt.type === 'session') {
      // Read current tab state from ref synchronously before any React state update.
      const currentTab = tabsRef.current.find((t) => t.id === tabId);

      if (currentTab?.conversationId) {
        // Common case: conversation already exists, update its sessionId.
        const conv = conversationsRef.current.find((c) => c.id === currentTab.conversationId);
        if (conv) {
          upsertConversation({ ...conv, sessionId: evt.id, lastUsedAt: new Date().toISOString() });
        }
        setTabsAndRef((prev) => prev.map((tab) => (
          tab.id === tabId ? { ...tab, sessionId: evt.id } : tab
        )));
      } else if (currentTab) {
        // Edge case: no conversationId yet — create the conversation and update tab atomically.
        const conv = createConversationFromTab(currentTab, evt.id);
        upsertConversation(conv);
        setTabsAndRef((prev) => prev.map((tab) => (
          tab.id !== tabId ? tab : {
            ...tab,
            sessionId: evt.id,
            conversationId: conv.id,
            pendingTitle: null,
            title: conv.title,
          }
        )));
      }

      markTabUnread(tabId);
      return;
    }

    if (evt.type === 'text') {
      setTabsAndRef((prev) => prev.map((tab) => {
        if (tab.id !== tabId) return tab;
        return {
          ...tab,
          messages: tab.messages.map((msg) => (
            msg.id === `agent-${runId}` ? { ...msg, content: msg.content + evt.text } : msg
          )),
        };
      }));
      markTabUnread(tabId);
      return;
    }

    if (evt.type === 'tool') {
      setTabsAndRef((prev) => prev.map((tab) => {
        if (tab.id !== tabId) return tab;
        return {
          ...tab,
          messages: tab.messages.map((msg) => (
            msg.id === `agent-${runId}`
              ? { ...msg, tools: [...msg.tools, { name: evt.name, display: evt.display }] }
              : msg
          )),
        };
      }));
      markTabUnread(tabId);
    }
  });

  useIpcListener(window.nakiros.onAgentDone, ({ runId, exitCode, error, rawLines }) => {
    const startedAt = runStartedAtRef.current.get(runId) ?? null;
    runStartedAtRef.current.delete(runId);
    const runDurationSeconds = startedAt
      ? Math.max(1, Math.round((Date.now() - startedAt) / 1000))
      : 0;
    const tabId = runToTabIdRef.current.get(runId);
    runToTabIdRef.current.delete(runId);
    const wasCancelled = cancelledRunIdsRef.current.delete(runId);
    if (!tabId) return;

    if (rawLines && rawLines.length > 0) {
      const existing = tabRawLinesRef.current.get(tabId) ?? [];
      tabRawLinesRef.current.set(tabId, [...existing, ...rawLines]);
    }

    // Read current tab state from ref synchronously before any React state update.
    // setTabsAndRef's updater runs asynchronously (React batching), so variables set
    // inside it would be stale when checked immediately after. Use refs instead.
    const currentTab = tabsRef.current.find((tab) => tab.id === tabId);
    if (currentTab?.conversationId) {
      const conv = conversationsRef.current.find((item) => item.id === currentTab.conversationId);
      if (conv) {
        upsertConversation({
          ...conv,
          workspaceSlug,
          workspaceName: workspaceName ?? workspaceId,
          mode: currentTab.mode,
          anchorRepoPath: currentTab.anchorRepoPath,
          activeRepoPaths: currentTab.activeRepoPaths,
          lastResolvedRepoMentions: currentTab.lastResolvedRepoMentions,
          repoPath: currentTab.anchorRepoPath,
          repoName: getRepoName(currentTab.anchorRepoPath),
          provider: currentTab.provider,
          workspaceId,
          sessionId: currentTab.sessionId ?? conv.sessionId,
          lastUsedAt: new Date().toISOString(),
          messages: [...conv.messages, ...(rawLines ?? [])],
        });
      }
    }

    const shouldNotifyCompletion = !wasCancelled && (
      !isVisible || activeTabIdRef.current !== tabId
    );
    const shouldSendDesktopNotification = desktopNotificationsEnabled
      && shouldNotifyCompletion
      && runDurationSeconds >= desktopNotificationMinDurationSeconds;

    if (shouldSendDesktopNotification) {
      void window.nakiros.showAgentRunNotification({
        workspaceId,
        workspaceName,
        conversationId: currentTab?.conversationId ?? null,
        tabId,
        conversationTitle: currentTab?.title ?? defaultTabTitle,
        provider: currentTab?.provider,
        durationSeconds: runDurationSeconds,
      });
    }

    setTabsAndRef((prev) => prev.map((tab) => {
      if (tab.id !== tabId) return tab;

      const nextMessages = tab.messages.map((msg) => {
        if (msg.id !== `agent-${runId}`) return msg;
        if (wasCancelled) return { ...msg, status: 'complete' as const };
        if (error) return { ...msg, content: error, status: 'error' as const };
        if (exitCode !== 0) {
          if (msg.content.trim()) return { ...msg, status: 'error' as const };
          return {
            ...msg,
            content: t('processExitedWithCode', { code: String(exitCode) }),
            status: 'error' as const,
          };
        }
        return { ...msg, status: 'complete' as const };
      });

      return {
        ...tab,
        activeRunId: null,
        runningCommand: null,
        messages: nextMessages,
        hasRunCompletionNotice: tab.hasRunCompletionNotice || shouldNotifyCompletion,
      };
    }));

    markTabUnread(tabId);

    if (!wasCancelled) onDone?.();
  });

  function updateTabInput(tabId: string, value: string) {
    setTabsAndRef((prev) => prev.map((tab) => (tab.id === tabId ? { ...tab, input: value } : tab)));
  }

  function updateTabProvider(tabId: string, provider: AgentProvider) {
    setTabsAndRef((prev) => prev.map((tab) => (tab.id === tabId ? { ...tab, provider } : tab)));
  }

  function isToolPanelExpanded(msg: Message): boolean {
    const explicit = expandedToolPanels[msg.id];
    if (typeof explicit === 'boolean') return explicit;
    return msg.status === 'streaming';
  }

  function toggleToolPanel(messageId: string, currentExpanded: boolean) {
    setExpandedToolPanels((prev) => ({
      ...prev,
      [messageId]: !currentExpanded,
    }));
  }

  function applySlashCommand(tabId: string, command: string) {
    const nextInput = `${command} `;
    updateTabInput(tabId, nextInput);
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(nextInput.length, nextInput.length);
    });
  }

  function applyAgentMention(tabId: string, tag: string) {
    const tab = tabsRef.current.find((item) => item.id === tabId);
    if (!tab) return;

    const mentionToken = `@${tag}`;
    const mention = extractActiveMentionContext(tab.input);
    const nextInput = mention
      ? `${tab.input.slice(0, mention.start)}${mentionToken} `
      : `${tab.input}${tab.input.length > 0 && !/\s$/.test(tab.input) ? ' ' : ''}${mentionToken} `;

    updateTabInput(tabId, nextInput);
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(nextInput.length, nextInput.length);
    });
  }

  function applyProjectScope(tabId: string, token: string) {
    const tab = tabsRef.current.find((item) => item.id === tabId);
    if (!tab) return;

    const scopeToken = `#${token}`;
    const projectScope = extractActiveProjectScopeContext(tab.input);
    const nextInput = projectScope
      ? `${tab.input.slice(0, projectScope.start)}${scopeToken} `
      : `${tab.input}${tab.input.length > 0 && !/\s$/.test(tab.input) ? ' ' : ''}${scopeToken} `;

    updateTabInput(tabId, nextInput);
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(nextInput.length, nextInput.length);
    });
  }


  function createNewTab(opts?: { focus?: boolean; repoPath?: string; provider?: AgentProvider; title?: string }): string | null {
    if (tabsRef.current.length >= MAX_TABS) {
      setTabLimitMessage(t('tabLimitReached', { count: MAX_TABS }));
      return null;
    }

    const active = tabsRef.current.find((tab) => tab.id === activeTabIdRef.current) ?? null;
    const tab = buildTab({
      anchorRepoPath: opts?.repoPath ?? active?.anchorRepoPath ?? getDefaultRepoPath(),
      activeRepoPaths: active?.activeRepoPaths ?? [],
      provider: opts?.provider ?? active?.provider ?? defaultProvider,
      title: opts?.title,
    });

    setTabsAndRef((prev) => [...prev, tab]);
    if (opts?.focus !== false) selectTab(tab.id);
    setTabLimitMessage(null);
    return tab.id;
  }

  function closeTab(tabId: string) {
    const tab = tabsRef.current.find((item) => item.id === tabId);
    if (!tab) return;

    feedbackRefsMap.current.get(tabId)?.current?.autoSubmitIfPending();
    feedbackRefsMap.current.delete(tabId);
    sessionStartTimesRef.current.delete(tabId);
    tabRawLinesRef.current.delete(tabId);

    if (tab.activeRunId) {
      const runId = tab.activeRunId;
      cancelledRunIdsRef.current.add(runId);
      runToTabIdRef.current.delete(runId);
      runStartedAtRef.current.delete(runId);
      void window.nakiros.agentCancel(runId).finally(() => {
        cancelledRunIdsRef.current.delete(runId);
      });
    }

    setTabsAndRef((prev) => prev.filter((item) => item.id !== tabId));

    const remaining = tabsRef.current.filter((item) => item.id !== tabId);
    if (remaining.length === 0) {
      const next = buildTab({ repoPath: getDefaultRepoPath(), provider: defaultProvider });
      tabsRef.current = [next];
      setTabs([next]);
      selectTab(next.id);
      return;
    }

    if (activeTabIdRef.current === tabId) {
      const closedIndex = tabsRef.current.findIndex((item) => item.id === tabId);
      const fallback = remaining[Math.max(0, closedIndex - 1)] ?? remaining[0] ?? null;
      selectTab(fallback?.id ?? null);
    }
  }

  async function sendMessageToTab(tabId: string, rawText: string) {
    const text = rawText.trim();

    const currentTab = tabsRef.current.find((tab) => tab.id === tabId);
    if (!currentTab || currentTab.activeRunId) return;

    const userMessageCount = currentTab.messages.filter((msg) => msg.role === 'user').length;
    if (!text) return;

    const scopeResolution = resolveProjectScopeInMessage(text, projectScopeTokenToRepoPath);
    const nextActiveRepoPaths = scopeResolution.mentionedRepoPaths.length > 0
      ? scopeResolution.mentionedRepoPaths.map((path) => resolveRepoPath(path))
      : currentTab.activeRepoPaths;
    const nextAnchorRepoPath = resolveRepoPath(
      scopeResolution.mentionedRepoPaths[0]
      ?? currentTab.anchorRepoPath
      ?? currentTab.repoPath,
    );
    if (scopeResolution.scopeOnlyMessage) {
      setTabsAndRef((prev) => prev.map((tab) => (
        tab.id === tabId
          ? {
            ...tab,
            input: '',
            anchorRepoPath: nextAnchorRepoPath,
            activeRepoPaths: nextActiveRepoPaths,
            lastResolvedRepoMentions: scopeResolution.mentionedTokens,
            repoPath: nextAnchorRepoPath,
          }
          : tab
      )));
      return;
    }

    const effectiveText = text;
    if (userMessageCount === 0 && !sessionStartTimesRef.current.has(tabId)) {
      sessionStartTimesRef.current.set(tabId, Date.now());
    }
    const selectedDefinition = matchCommandDefinition(effectiveText, agentDefinitions);
    const title = generateTitle(effectiveText, commandLabelMap, defaultTabTitle);
    const shouldSetPendingTitle = !currentTab.conversationId && currentTab.messages.filter((msg) => msg.role === 'user').length === 0;
    let createdConversation: StoredConversation | null = null;

    const userMessage: Message = {
      id: `user-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
      role: 'user',
      content: text,
      status: 'complete',
      tools: [],
    };

    const userRaw = { type: 'user', content: text, timestamp: new Date().toISOString() };

    if (shouldSetPendingTitle) {
      const now = new Date().toISOString();
      createdConversation = {
        id: `conv-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
        sessionId: currentTab.sessionId ?? `pending-${Date.now()}`,
        workspaceId,
        workspaceSlug,
        workspaceName: workspaceName ?? workspaceId,
        mode: currentTab.mode,
        anchorRepoPath: nextAnchorRepoPath,
        activeRepoPaths: nextActiveRepoPaths,
        lastResolvedRepoMentions: scopeResolution.mentionedTokens,
        repoPath: nextAnchorRepoPath,
        repoName: getRepoName(nextAnchorRepoPath),
        provider: currentTab.provider,
        title,
        agents: selectedDefinition ? [selectedDefinition.id] : [],
        createdAt: now,
        lastUsedAt: now,
        messages: [userRaw],
      };
      upsertConversation(createdConversation);
    } else if (currentTab.conversationId) {
      // Append user message to existing conversation
      const existing = conversationsRef.current.find((c) => c.id === currentTab.conversationId);
      if (existing) {
        upsertConversation({
          ...existing,
          workspaceSlug,
          workspaceName: workspaceName ?? workspaceId,
          mode: currentTab.mode,
          anchorRepoPath: nextAnchorRepoPath,
          activeRepoPaths: nextActiveRepoPaths,
          lastResolvedRepoMentions: scopeResolution.mentionedTokens,
          repoPath: nextAnchorRepoPath,
          repoName: getRepoName(nextAnchorRepoPath),
          agents: existing.agents.length > 0
            ? existing.agents
            : (selectedDefinition ? [selectedDefinition.id] : []),
          messages: [...existing.messages, userRaw],
          lastUsedAt: new Date().toISOString(),
        });
      }
    }

    setTabsAndRef((prev) => prev.map((tab) => {
      if (tab.id !== tabId) return tab;
      return {
        ...tab,
        input: '',
        title: shouldSetPendingTitle ? title : tab.title,
        pendingTitle: shouldSetPendingTitle ? null : tab.pendingTitle,
        conversationId: tab.conversationId ?? createdConversation?.id ?? null,
        anchorRepoPath: nextAnchorRepoPath,
        activeRepoPaths: nextActiveRepoPaths,
        lastResolvedRepoMentions: scopeResolution.mentionedTokens,
        repoPath: nextAnchorRepoPath,
        hasUnread: false,
        hasRunCompletionNotice: false,
        messages: [...tab.messages, userMessage],
      };
    }));

    const nextTab = tabsRef.current.find((tab) => tab.id === tabId);
    if (!nextTab) return;

    const additionalDirs = Array.from(new Set(
      repos.map((repo) => repo.localPath).filter((path) => path.trim().length > 0),
    ));
    const sessionForRun = startsWithNakirosSlashCommand(effectiveText) ? null : nextTab.sessionId;

    try {
      const request: AgentRunRequest = {
        workspaceId,
        workspaceSlug,
        workspaceName: workspaceName ?? workspaceId,
        mode: nextTab.mode,
        anchorRepoPath: nextAnchorRepoPath,
        activeRepoPaths: nextActiveRepoPaths,
        lastResolvedRepoMentions: scopeResolution.mentionedTokens,
        message: effectiveText,
        sessionId: sessionForRun,
        additionalDirs,
        provider: nextTab.provider,
      };
      const runId = await window.nakiros.agentRun(request);

      runToTabIdRef.current.set(runId, tabId);
      runStartedAtRef.current.set(runId, Date.now());

      const agentMessage: Message = {
        id: `agent-${runId}`,
        role: 'agent',
        content: '',
        status: 'streaming',
        tools: [],
      };

      setTabsAndRef((prev) => prev.map((tab) => {
        if (tab.id !== tabId) return tab;
        return {
          ...tab,
          activeRunId: runId,
          messages: [...tab.messages, agentMessage],
        };
      }));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const agentMessage: Message = {
        id: `agent-error-${Date.now()}`,
        role: 'agent',
        content: errorMessage || t('unableToStartRun'),
        status: 'error',
        tools: [],
      };

      setTabsAndRef((prev) => prev.map((tab) => {
        if (tab.id !== tabId) return tab;
        return {
          ...tab,
          messages: [...tab.messages, agentMessage],
        };
      }));
    }
  }

  function stopActiveRun() {
    if (!activeTab?.activeRunId) return;
    const runId = activeTab.activeRunId;
    cancelledRunIdsRef.current.add(runId);
    runStartedAtRef.current.delete(runId);
    void window.nakiros.agentCancel(runId);

    setTabsAndRef((prev) => prev.map((tab) => {
      if (tab.id !== activeTab.id) return tab;
      return {
        ...tab,
        activeRunId: null,
        runningCommand: null,
        messages: tab.messages.map((msg) => (
          msg.status === 'streaming'
            ? { ...msg, status: 'complete', content: `${msg.content}\n\n${t('stoppedMarker')}` }
            : msg
        )),
      };
    }));
  }

  function createNewConversationTab() {
    createNewTab({ focus: true });
  }

  async function openConversationFromHistory(conv: StoredConversation) {
    const existing = tabsRef.current.find((tab) => tab.conversationId === conv.id);
    if (existing) {
      selectTab(existing.id);
      setShowHistory(false);
      return;
    }

    const tabId = createNewTab({
      focus: true,
      repoPath: conv.anchorRepoPath ?? conv.repoPath,
      provider: conv.provider,
      title: conv.title,
    });

    if (!tabId) return;

    setTabsAndRef((prev) => prev.map((tab) => {
      if (tab.id !== tabId) return tab;
      return {
        ...tab,
        title: conv.title,
        mode: conv.mode ?? 'global',
        anchorRepoPath: resolveRepoPath(conv.anchorRepoPath ?? conv.repoPath),
        activeRepoPaths: (conv.activeRepoPaths ?? []).map((path) => resolveRepoPath(path)),
        lastResolvedRepoMentions: conv.lastResolvedRepoMentions ?? [],
        repoPath: resolveRepoPath(conv.anchorRepoPath ?? conv.repoPath),
        provider: conv.provider,
        sessionId: conv.sessionId,
        conversationId: conv.id,
        messages: rawToUiMessages(conv.messages),
      };
    }));

    setShowHistory(false);
  }

  function deleteConversation(id: string) {
    const tabIdsToClose = tabsRef.current
      .filter((tab) => tab.conversationId === id)
      .map((tab) => tab.id);

    void window.nakiros.deleteConversation(id, workspaceId);
    setConversations((prev) => {
      const next = prev.filter((conv) => conv.id !== id);
      conversationsRef.current = next;
      return next;
    });

    for (const tabId of tabIdsToClose) {
      closeTab(tabId);
    }
  }

  function formatRelativeDate(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return t('timeNow');
    if (minutes < 60) return t('timeMinutesAgo', { count: minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t('timeHoursAgo', { count: hours });
    return t('timeDaysAgo', { count: Math.floor(hours / 24) });
  }

  function groupConversations(convs: StoredConversation[]): Array<{ label: string; items: StoredConversation[] }> {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const yesterdayStart = new Date(todayStart.getTime() - 86400000);
    const weekStart = new Date(todayStart.getTime() - 6 * 86400000);
    const groups: Record<string, StoredConversation[]> = {
      [t('historyToday')]: [],
      [t('historyYesterday')]: [],
      [t('historyThisWeek')]: [],
      [t('historyOlder')]: [],
    };
    for (const conv of convs) {
      const d = new Date(conv.lastUsedAt);
      if (d >= todayStart) groups[t('historyToday')]?.push(conv);
      else if (d >= yesterdayStart) groups[t('historyYesterday')]?.push(conv);
      else if (d >= weekStart) groups[t('historyThisWeek')]?.push(conv);
      else groups[t('historyOlder')]?.push(conv);
    }
    return Object.entries(groups)
      .filter(([, items]) => items.length > 0)
      .map(([label, items]) => ({ label, items }));
  }

  useEffect(() => {
    if (!tabsLoaded || !initialAgentId) return;
    const initialDefinition = agentDefinitions.find((definition) => definition.id === initialAgentId);
    if (!initialDefinition) return;

    const active = tabsRef.current.find((tab) => tab.id === activeTabIdRef.current) ?? null;
    if (!active || active.messages.length > 0 || active.input.trim()) return;
    updateTabInput(active.id, `${initialDefinition.command} `);
  }, [tabsLoaded, initialAgentId, agentDefinitions]);

  useEffect(() => {
    if (!tabsLoaded || !initialMessage || initialMessageSentRef.current) return;

    initialMessageSentRef.current = true;
    const active = tabsRef.current.find((tab) => tab.id === activeTabIdRef.current) ?? null;

    let targetTabId = active?.id ?? null;
    if (!active || active.messages.length > 0 || active.activeRunId) {
      targetTabId = createNewTab({
        focus: true,
        repoPath: active?.anchorRepoPath ?? getDefaultRepoPath(),
        provider: active?.provider ?? defaultProvider,
      });
    }

    if (targetTabId) {
      void sendMessageToTab(targetTabId, initialMessage);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabsLoaded, initialMessage]);

  const activeMessages = activeTab?.messages ?? [];
  const activeCommandDefinition = useMemo(() => {
    for (let index = activeMessages.length - 1; index >= 0; index -= 1) {
      const message = activeMessages[index];
      if (message?.role !== 'user') continue;
      return matchCommandDefinition(message.content, agentDefinitions);
    }
    return null;
  }, [activeMessages, agentDefinitions]);
  const meetingAgentTags = useMemo(
    () => extractMeetingAgentTags(
      activeMessages,
      activeCommandDefinition ? AGENT_ID_TO_TAG[activeCommandDefinition.id] : undefined,
    ),
    [activeMessages, activeCommandDefinition],
  );
  const mentionOptions = useMemo<AgentMentionOption[]>(
    () => meetingAgentTags.map((tag) => {
      const agentId = AGENT_TAG_TO_ID[tag];
      const definition = agentDefinitions.find((item) => item.id === agentId);
      return {
        tag,
        token: `@${tag}`,
        label: definition
          ? getAgentDefinitionLabel(definition, t)
          : tag,
      };
    }),
    [meetingAgentTags, agentDefinitions, t],
  );
  const activeMention = useMemo(
    () => extractActiveMentionContext(activeTab?.input ?? ''),
    [activeTab?.input],
  );
  const activeProjectScope = useMemo(
    () => extractActiveProjectScopeContext(activeTab?.input ?? ''),
    [activeTab?.input],
  );
  const filteredMentionOptions = useMemo(
    () => {
      if (!activeMention) return [];
      return mentionOptions.filter((option) => option.tag.toLowerCase().startsWith(activeMention.query));
    },
    [mentionOptions, activeMention],
  );
  const filteredProjectScopeOptions = useMemo(
    () => {
      if (!activeProjectScope) return [];
      return projectScopeOptions.filter((option) => option.token.startsWith(activeProjectScope.query));
    },
    [projectScopeOptions, activeProjectScope],
  );
  const showMentionMenu = Boolean(activeTab && !activeTab.activeRunId && activeMention);
  const showProjectScopeMenu = Boolean(activeTab && !activeTab.activeRunId && activeProjectScope);
  const feedbackAgent = activeCommandDefinition?.kind === 'agent' ? activeCommandDefinition.id : null;
  const feedbackWorkflow = activeCommandDefinition?.kind === 'workflow' ? activeCommandDefinition.id : null;
  const historyCount = workspaceConversations.length;
  const isInputDisabled = !activeTab || !!activeTab.activeRunId;
  const canSend = Boolean(activeTab && !activeTab.activeRunId && activeTab.input.trim());
  const activeScopeTokens = useMemo(
    () => (activeTab?.activeRepoPaths ?? [])
      .map((repoPath) => {
        const token = projectScopeTokenByRepoPath.get(repoPath);
        if (!token) return null;
        return {
          token,
          repoPath,
        };
      })
      .filter((item): item is { token: string; repoPath: string } => item !== null),
    [activeTab?.activeRepoPaths, projectScopeTokenByRepoPath],
  );

  useEffect(() => {
    setHighlightedMentionIndex(0);
  }, [activeMention?.start, activeMention?.query, activeTabId]);

  useEffect(() => {
    setHighlightedProjectScopeIndex(0);
  }, [activeProjectScope?.start, activeProjectScope?.query, activeTabId]);

  useEffect(() => {
    if (filteredMentionOptions.length === 0) return;
    setHighlightedMentionIndex((prev) => Math.min(prev, filteredMentionOptions.length - 1));
  }, [filteredMentionOptions.length]);

  useEffect(() => {
    if (filteredProjectScopeOptions.length === 0) return;
    setHighlightedProjectScopeIndex((prev) => Math.min(prev, filteredProjectScopeOptions.length - 1));
  }, [filteredProjectScopeOptions.length]);

  useEffect(() => {
    if (!showMentionMenu || filteredMentionOptions.length === 0) return;
    window.requestAnimationFrame(() => {
      activeMentionItemRef.current?.scrollIntoView({ block: 'nearest' });
    });
  }, [showMentionMenu, filteredMentionOptions.length, highlightedMentionIndex]);

  useEffect(() => {
    if (!showProjectScopeMenu || filteredProjectScopeOptions.length === 0) return;
    window.requestAnimationFrame(() => {
      activeProjectScopeItemRef.current?.scrollIntoView({ block: 'nearest' });
    });
  }, [showProjectScopeMenu, filteredProjectScopeOptions.length, highlightedProjectScopeIndex]);

  return (
    <div className={clsx('relative flex h-full w-full min-w-0 overflow-hidden bg-[var(--bg)]', persistentHistory ? 'flex-row' : 'flex-col')}>
      {persistentHistory && (
        <div className={LEFT_HISTORY_PANEL_CLASS}>
          <div className={HISTORY_PANEL_HEADER_CLASS}>
            <Clock size={12} color="var(--primary)" />
            <span className="flex-1 text-xs font-bold text-[var(--text)]">{t('history')}</span>
            <button
              onClick={createNewConversationTab}
              title={t('newConversation')}
              className={NEW_CONV_BUTTON_SMALL_CLASS}
              disabled={hasReachedTabLimit}
            >
              <Plus size={11} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {workspaceConversations.length === 0 ? (
              <div className="px-3 py-6 text-center text-[11px] text-[var(--text-muted)]">
                {t('noConversation')}
              </div>
            ) : (
              groupConversations(workspaceConversations).map(({ label, items }) => (
                <div key={label}>
                  <div className={HISTORY_GROUP_LABEL_CLASS}>{label}</div>
                  {items.map((conv) => {
                    const isOpen = tabs.some((t) => t.conversationId === conv.id);
                    return (
                      <div
                        key={conv.id}
                        className={historyItemClass(isOpen)}
                        onClick={() => void openConversationFromHistory(conv)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            void openConversationFromHistory(conv);
                          }
                        }}
                      >
                        <div className="min-w-0 flex-1">
                          <div className={clsx('truncate text-xs text-[var(--text)]', isOpen ? 'font-bold' : 'font-semibold')}>
                            {conv.title}
                          </div>
                          <div className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                            {formatRelativeDate(conv.lastUsedAt)}
                          </div>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}
                          className={HISTORY_DELETE_BUTTON_CLASS}
                          title={t('delete')}
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className={HEADER_CLASS}>
        <Bot size={15} color="var(--primary)" />
        <span className="text-xs font-bold text-[var(--text)]">{t('agents')}</span>
        <span className={SESSION_BADGE_CLASS}>
          {workspaceName ?? workspaceId}
        </span>

        {activeTab?.runningCommand && (
          <span className={RUNNING_INDICATOR_CLASS}>
            ● {activeTab.runningCommand.length > 55 ? `${activeTab.runningCommand.slice(0, 55)}…` : activeTab.runningCommand}
          </span>
        )}

        {!activeTab?.runningCommand && (
          <div className="ml-auto flex items-center gap-1.5">
            <span className={PROJECT_SCOPE_BADGE_CLASS}>
              {activeTab?.mode === 'repo' ? t('modeRepo') : t('modeGlobal')}
            </span>
            {activeScopeTokens.map(({ token, repoPath }) => (
              <span
                key={token}
                title={t('projectScopeTitle', { project: getRepoName(repoPath) })}
                className={PROJECT_SCOPE_BADGE_CLASS}
              >
                #{token}
              </span>
            ))}
            {activeTab?.sessionId && (
              <span title={t('sessionTitle', { id: activeTab.sessionId })} className={SESSION_BADGE_CLASS}>
                ↺ {providerLabel(activeTab.provider)} {t('session')}
              </span>
            )}
            {!persistentHistory && (
              <button
                onClick={() => setShowHistory((value) => !value)}
                title={t('conversationHistory')}
                className={historyToggleButtonClass(showHistory)}
              >
                <Clock size={11} />
                {historyCount > 0 && (
                  <span className="rounded-[8px] bg-[var(--primary)] px-1 text-[10px] leading-[14px] text-white">
                    {historyCount}
                  </span>
                )}
              </button>
            )}
            <button
              onClick={createNewConversationTab}
              title={t('newConversation')}
              className={NEW_CONV_BUTTON_CLASS}
              disabled={hasReachedTabLimit}
            >
              <Plus size={11} />
              {t('new')}
            </button>
          </div>
        )}
      </div>

      <div className={TAB_STRIP_CLASS}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const isRunning = !!tab.activeRunId;
          return (
            <div key={tab.id} className={tabItemClass(isActive)}>
              <button
                onClick={() => selectTab(tab.id)}
                className={TAB_SELECT_BUTTON_CLASS}
                title={tab.title}
              >
                <span className="truncate">
                  {tab.title}
                </span>
                <span className={SESSION_BADGE_COMPACT_CLASS}>
                  {providerLabel(tab.provider)}
                </span>
                {tab.hasRunCompletionNotice && <span className={TAB_COMPLETED_DOT_CLASS} />}
                {!tab.hasRunCompletionNotice && tab.hasUnread && <span className={TAB_UNREAD_DOT_CLASS} />}
                {!tab.hasRunCompletionNotice && !tab.hasUnread && isRunning && <span className={TAB_RUNNING_DOT_CLASS} />}
              </button>
              <button onClick={() => closeTab(tab.id)} className={TAB_CLOSE_BUTTON_CLASS} title={t('close')}>
                <X size={11} />
              </button>
            </div>
          );
        })}
      </div>

      {tabLimitMessage && (
        <div className="border-b border-[var(--line)] bg-[#fffbeb] px-4 py-1.5 text-[11px] text-[#b45309]">
          {tabLimitMessage}
        </div>
      )}

      {!persistentHistory && showHistory && (
        <div className={HISTORY_OVERLAY_CLASS}>
          <div className={HISTORY_HEADER_CLASS}>
            <Clock size={12} color="var(--primary)" />
            <span className="text-xs font-bold text-[var(--text)]">{t('workspaceHistory')}</span>
            <button onClick={() => setShowHistory(false)} className={HISTORY_CLOSE_BUTTON_CLASS}>✕</button>
          </div>
          {workspaceConversations.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-[var(--text-muted)]">
              {t('noSavedConversation')}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {workspaceConversations.map((conv) => (
                <div
                  key={conv.id}
                  className={historyItemClass(false)}
                  onClick={() => void openConversationFromHistory(conv)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      void openConversationFromHistory(conv);
                    }
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold text-[var(--text)]">
                      {conv.title}
                    </div>
                    <div className="mt-0.5 flex gap-1.5 text-[10px] text-[var(--text-muted)]">
                      <span>{conv.repoName}</span>
                      <span>·</span>
                      <span>{providerLabel(conv.provider)}</span>
                      <span>·</span>
                      <span>{formatRelativeDate(conv.lastUsedAt)}</span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteConversation(conv.id);
                    }}
                    className={HISTORY_DELETE_BUTTON_CLASS}
                    title={t('delete')}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div
        ref={messagesContainerRef}
        className={MESSAGES_AREA_CLASS}
        onScroll={() => {
          if (!isVisible) return;
          if (!activeTab?.hasRunCompletionNotice) return;
          const container = messagesContainerRef.current;
          if (!container) return;
          const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight <= 24;
          if (!atBottom) return;
          setTabsAndRef((prev) => prev.map((tab) => (
            tab.id === activeTab.id && tab.hasRunCompletionNotice
              ? { ...tab, hasRunCompletionNotice: false }
              : tab
          )));
        }}
      >
        {activeMessages.length === 0 && (
          <div className={EMPTY_STATE_CLASS}>
            <Bot size={32} color="var(--line-strong)" className="mb-2.5" />
            <p className="m-0">{t('emptyPrompt')}</p>
            <p className="mb-0 mt-1 text-[11px]">
              {t('example')} {' '}
              <code className="rounded-[10px] bg-[var(--bg-muted)] px-1 py-px">/nak-agent-dev</code>
            </p>
          </div>
        )}

        {activeMessages.map((msg) => (
          <div key={msg.id} className={msg.role === 'user' ? USER_MSG_WRAPPER_CLASS : AGENT_MSG_WRAPPER_CLASS}>
            {msg.role === 'user' ? (
              <div className={USER_MSG_BUBBLE_CLASS}>{msg.content}</div>
            ) : (
              <div>
                <div className={AGENT_HEADER_CLASS}>
                  <Bot size={13} color="var(--primary)" />
                  <span className="text-[11px] font-bold text-[var(--primary)]">{t('agent')}</span>
                  {msg.status === 'error' && (
                    <span className="text-[10px] text-[#ef4444]">{t('error')}</span>
                  )}
                </div>

                {msg.tools.length > 0 && (
                  <div className={TOOL_TRACE_CLASS}>
                    {(() => {
                      const toolsExpanded = isToolPanelExpanded(msg);
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
                                <div key={`${tool.name}-${index}`} className={TOOL_ROW_CLASS}>
                                  <ToolIcon name={tool.name} />
                                  <span className={TOOL_DISPLAY_TEXT_CLASS}>{tool.display}</span>
                                </div>
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
                    })()}
                  </div>
                )}

                {(msg.content.trim() || msg.status === 'error') && (
                  <MessageContent msg={msg} />
                )}
                {msg.status === 'streaming' && (
                  <div className="mt-1">
                    <StreamingActivityText
                      label={activeStreamingLabel}
                      compact={Boolean(msg.content.trim())}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      {activeTab && activeMessages.length > 0 && (() => {
        if (!feedbackRefsMap.current.has(activeTab.id)) {
          feedbackRefsMap.current.set(activeTab.id, { current: null });
        }
        const fbRef = feedbackRefsMap.current.get(activeTab.id)!;
        return (
          <SessionFeedback
            ref={fbRef}
            sessionId={activeTab.id}
            workspaceId={workspaceId}
            agent={feedbackAgent}
            workflow={feedbackWorkflow}
            editor={activeTab.provider ?? 'claude'}
            messageCount={activeMessages.length}
            getDurationSeconds={() => {
              const start = sessionStartTimesRef.current.get(activeTab.id);
              return start ? Math.floor((Date.now() - start) / 1000) : 0;
            }}
            getRawLines={() => tabRawLinesRef.current.get(activeTab.id) ?? []}
          />
        );
      })()}

      <div className={INPUT_BAR_CLASS}>
        {showSlashCommands && (
          <div className={SLASH_MENU_CLASS}>
            <div className={SLASH_MENU_HEADER_CLASS}>
              <span>{t('slashCommands')}</span>
              <span>{t('slashHint')}</span>
            </div>
            {filteredSlashCommands.length === 0 ? (
              <div className={SLASH_MENU_EMPTY_CLASS}>{t('slashNoMatch')}</div>
            ) : (
              <div className="max-h-[220px] overflow-y-auto">
                {filteredSlashCommands.map((command, index) => {
                  const active = index === highlightedSlashIndex;
                  return (
                    <button
                      key={command.id}
                      type="button"
                      aria-selected={active}
                      ref={active ? activeSlashItemRef : undefined}
                      className={slashMenuItemClass(active)}
                      onMouseEnter={() => setHighlightedSlashIndex(index)}
                      onClick={() => activeTab && applySlashCommand(activeTab.id, command.command)}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className={slashMenuCursorClass(active)} />
                        <div className="min-w-0">
                          <div className={slashMenuCommandClass(active)}>{command.command}</div>
                          <div className={slashMenuLabelClass(active)}>{command.label}</div>
                        </div>
                      </div>
                      <span className={slashMenuKindBadgeClass(active)}>
                        {command.kind === 'workflow' ? t('workflows') : t('agent')}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {!showSlashCommands && showMentionMenu && (
          <div className={SLASH_MENU_CLASS}>
            <div className={SLASH_MENU_HEADER_CLASS}>
              <span>{t('mentionAgents')}</span>
              <span>{t('mentionHint')}</span>
            </div>
            {mentionOptions.length === 0 ? (
              <div className={SLASH_MENU_EMPTY_CLASS}>{t('mentionNoMeetingAgents')}</div>
            ) : filteredMentionOptions.length === 0 ? (
              <div className={SLASH_MENU_EMPTY_CLASS}>{t('mentionNoMatch')}</div>
            ) : (
              <div className="max-h-[220px] overflow-y-auto">
                {filteredMentionOptions.map((option, index) => {
                  const active = index === highlightedMentionIndex;
                  return (
                    <button
                      key={option.tag}
                      type="button"
                      aria-selected={active}
                      ref={active ? activeMentionItemRef : undefined}
                      className={slashMenuItemClass(active)}
                      onMouseEnter={() => setHighlightedMentionIndex(index)}
                      onClick={() => activeTab && applyAgentMention(activeTab.id, option.tag)}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className={slashMenuCursorClass(active)} />
                        <div className="min-w-0">
                          <div className={slashMenuCommandClass(active)}>{option.token}</div>
                          <div className={slashMenuLabelClass(active)}>{option.label}</div>
                        </div>
                      </div>
                      <span className={slashMenuKindBadgeClass(active)}>
                        {t('agent')}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {!showSlashCommands && !showMentionMenu && showProjectScopeMenu && (
          <div className={SLASH_MENU_CLASS}>
            <div className={SLASH_MENU_HEADER_CLASS}>
              <span>{t('projectScopes')}</span>
              <span>{t('projectHint')}</span>
            </div>
            {filteredProjectScopeOptions.length === 0 ? (
              <div className={SLASH_MENU_EMPTY_CLASS}>{t('projectNoMatch')}</div>
            ) : (
              <div className="max-h-[220px] overflow-y-auto">
                {filteredProjectScopeOptions.map((option, index) => {
                  const active = index === highlightedProjectScopeIndex;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-selected={active}
                      ref={active ? activeProjectScopeItemRef : undefined}
                      className={slashMenuItemClass(active)}
                      onMouseEnter={() => setHighlightedProjectScopeIndex(index)}
                      onClick={() => activeTab && applyProjectScope(activeTab.id, option.token)}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className={slashMenuCursorClass(active)} />
                        <div className="min-w-0">
                          <div className={slashMenuCommandClass(active)}>#{option.token}</div>
                          <div className={slashMenuLabelClass(active)}>{option.label}</div>
                        </div>
                      </div>
                      <span className={slashMenuKindBadgeClass(active)}>
                        {option.isWorkspace ? t('allProjectsBadge') : t('projectBadge')}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
        <div className={INPUT_GRID_CLASS}>
          <div className="col-span-10 min-w-0">
            <textarea
              ref={inputRef}
              value={activeTab?.input ?? ''}
              onChange={(e) => activeTab && updateTabInput(activeTab.id, e.target.value)}
              onKeyDown={(e) => {
                if (activeTab && showSlashCommands) {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    if (filteredSlashCommands.length > 0) {
                      setHighlightedSlashIndex((prev) => (prev + 1) % filteredSlashCommands.length);
                    }
                    return;
                  }
                  if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    if (filteredSlashCommands.length > 0) {
                      setHighlightedSlashIndex((prev) => (prev - 1 + filteredSlashCommands.length) % filteredSlashCommands.length);
                    }
                    return;
                  }
                  if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
                    const nextCommand = filteredSlashCommands[highlightedSlashIndex] ?? filteredSlashCommands[0];
                    if (nextCommand) {
                      e.preventDefault();
                      applySlashCommand(activeTab.id, nextCommand.command);
                      return;
                    }
                  }
                }
                if (activeTab && !showSlashCommands && showMentionMenu) {
                  if (e.key === 'ArrowDown') {
                    if (filteredMentionOptions.length > 0) {
                      e.preventDefault();
                      setHighlightedMentionIndex((prev) => (prev + 1) % filteredMentionOptions.length);
                      return;
                    }
                  }
                  if (e.key === 'ArrowUp') {
                    if (filteredMentionOptions.length > 0) {
                      e.preventDefault();
                      setHighlightedMentionIndex((prev) => (prev - 1 + filteredMentionOptions.length) % filteredMentionOptions.length);
                      return;
                    }
                  }
                  if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
                    const nextMention = filteredMentionOptions[highlightedMentionIndex] ?? filteredMentionOptions[0];
                    if (nextMention) {
                      e.preventDefault();
                      applyAgentMention(activeTab.id, nextMention.tag);
                      return;
                    }
                    if (e.key === 'Tab') {
                      e.preventDefault();
                      return;
                    }
                  }
                }
                if (activeTab && !showSlashCommands && !showMentionMenu && showProjectScopeMenu) {
                  if (e.key === 'ArrowDown') {
                    if (filteredProjectScopeOptions.length > 0) {
                      e.preventDefault();
                      setHighlightedProjectScopeIndex((prev) => (prev + 1) % filteredProjectScopeOptions.length);
                      return;
                    }
                  }
                  if (e.key === 'ArrowUp') {
                    if (filteredProjectScopeOptions.length > 0) {
                      e.preventDefault();
                      setHighlightedProjectScopeIndex((prev) => (
                        prev - 1 + filteredProjectScopeOptions.length
                      ) % filteredProjectScopeOptions.length);
                      return;
                    }
                  }
                  if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
                    const nextProject = filteredProjectScopeOptions[highlightedProjectScopeIndex] ?? filteredProjectScopeOptions[0];
                    if (nextProject) {
                      e.preventDefault();
                      applyProjectScope(activeTab.id, nextProject.token);
                      return;
                    }
                    if (e.key === 'Tab') {
                      e.preventDefault();
                      return;
                    }
                  }
                }
                if (e.key === 'Enter' && !e.shiftKey && activeTab) {
                  e.preventDefault();
                  void sendMessageToTab(activeTab.id, activeTab.input);
                }
              }}
              placeholder={t('inputPlaceholder')}
              disabled={isInputDisabled}
              rows={4}
              className={textareaClass(isInputDisabled)}
            />
          </div>
          <div className="col-span-2 min-w-0">
            <div className={COMBO_CONTROL_CLASS}>
              <select
                value={activeTab?.provider ?? 'claude'}
                onChange={(e) => activeTab && updateTabProvider(activeTab.id, e.target.value as AgentProvider)}
                className={COMBO_SELECT_CLASS}
                disabled={!activeTab || !!activeTab.activeRunId}
                title={t('provider')}
              >
                <option value="claude">Claude</option>
                <option value="codex">Codex</option>
                <option value="cursor">Cursor</option>
              </select>
              <span className={COMBO_SEPARATOR_CLASS} />
              {activeTab?.activeRunId ? (
                <button
                  onClick={stopActiveRun}
                  title={t('stop')}
                  className={comboActionButtonClass({ running: true, disabled: false })}
                >
                  <span className="h-3 w-3 rounded-[1px] bg-white" />
                </button>
              ) : (
                <button
                  onClick={() => activeTab && void sendMessageToTab(activeTab.id, activeTab.input)}
                  disabled={!canSend}
                  title={t('sendEnter')}
                  className={comboActionButtonClass({ running: false, disabled: !canSend })}
                >
                  <Send size={14} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}

const HEADER_CLASS =
  'flex shrink-0 items-center gap-2.5 border-b border-[var(--line)] bg-[var(--bg-soft)] px-4 py-2.5';
const TAB_STRIP_CLASS =
  'flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-[var(--line)] bg-[var(--bg-soft)] px-3 py-1.5';
const TAB_SELECT_BUTTON_CLASS =
  'flex min-w-0 items-center border-none bg-transparent px-2 py-1 text-[11px] text-[var(--text)]';
const TAB_CLOSE_BUTTON_CLASS =
  'grid h-6 w-6 shrink-0 place-items-center border-0 border-l border-[var(--line)] bg-transparent text-[var(--text-muted)]';
const TAB_RUNNING_DOT_CLASS = 'ml-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--primary)]';
const TAB_COMPLETED_DOT_CLASS = 'ml-1.5 h-2 w-2 shrink-0 rounded-full bg-[#14b8a6]';
const TAB_UNREAD_DOT_CLASS = 'ml-1.5 h-2 w-2 shrink-0 rounded-full bg-[#f59e0b]';
const MESSAGES_AREA_CLASS = 'flex flex-1 flex-col gap-3.5 overflow-y-auto p-4';
const INPUT_BAR_CLASS =
  'flex shrink-0 flex-col border-t border-[var(--line)] bg-[var(--bg-soft)] px-3 py-2.5';
const INPUT_GRID_CLASS = 'grid grid-cols-12 items-end gap-2';
const EMPTY_STATE_CLASS = 'm-auto flex flex-col items-center text-center text-[13px] text-[var(--text-muted)]';
const COMBO_CONTROL_CLASS =
  'flex h-[34px] w-full items-center overflow-hidden rounded-[10px] border border-[var(--line)] bg-[var(--bg-card)] focus-within:border-[var(--primary)]';
const COMBO_SELECT_CLASS =
  'h-full min-w-0 flex-1 cursor-pointer border-none bg-transparent px-2 text-[11px] text-[var(--text)] outline-none disabled:cursor-not-allowed disabled:opacity-60';
const COMBO_SEPARATOR_CLASS = 'h-4 w-px bg-[var(--line)]';
const RUNNING_INDICATOR_CLASS =
  'ml-auto max-w-[280px] truncate font-mono text-[10px] text-[var(--primary)]';
const SESSION_BADGE_CLASS =
  'cursor-default rounded-[10px] bg-[var(--primary-soft)] px-1.5 py-px font-mono text-[10px] text-[var(--primary)]';
const PROJECT_SCOPE_BADGE_CLASS =
  'cursor-default rounded-[10px] border border-[var(--line)] bg-[var(--bg-card)] px-1.5 py-px font-mono text-[10px] text-[var(--text)]';
const STREAMING_ACTIVITY_CLASS =
  'inline-flex max-w-full items-center gap-1.5 rounded-[10px] border border-[var(--line)] bg-[var(--bg-card)] px-2 py-1 text-[10px] text-[var(--text-muted)]';
const STREAMING_ACTIVITY_COMPACT_CLASS =
  'inline-flex max-w-full items-center gap-1 text-[10px] text-[var(--text-muted)]';
const STREAMING_PULSE_DOT_CLASS =
  'inline-block h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[var(--primary)]';
const NEW_CONV_BUTTON_CLASS =
  'inline-flex shrink-0 items-center gap-1 rounded-[10px] border border-[var(--line)] bg-transparent px-2 py-[3px] text-[11px] text-[var(--text-muted)] disabled:opacity-50';
const NEW_CONV_BUTTON_SMALL_CLASS =
  'inline-flex shrink-0 items-center gap-1 rounded-[10px] border border-[var(--line)] bg-transparent px-1.5 py-[2px] text-[11px] text-[var(--text-muted)] disabled:opacity-50';
const SESSION_BADGE_COMPACT_CLASS =
  'ml-1.5 cursor-default rounded-[10px] bg-[var(--primary-soft)] px-1.5 py-px font-mono text-[9px] text-[var(--primary)]';
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
const TOOL_ROW_STREAMING_CLASS = 'flex items-center gap-1.5 opacity-50';
const TOOL_DISPLAY_TEXT_CLASS =
  'truncate whitespace-nowrap font-mono text-[11px] text-[var(--text-muted)]';
const HISTORY_OVERLAY_CLASS =
  'absolute inset-x-0 bottom-0 top-[73px] z-10 flex flex-col border-t border-[var(--line)] bg-[var(--bg)]';
const HISTORY_HEADER_CLASS =
  'flex shrink-0 items-center gap-2 border-b border-[var(--line)] bg-[var(--bg-soft)] px-4 py-2.5';
const HISTORY_CLOSE_BUTTON_CLASS =
  'ml-auto border-none bg-transparent px-1 py-0.5 text-sm leading-none text-[var(--text-muted)]';
const HISTORY_DELETE_BUTTON_CLASS =
  'grid shrink-0 place-items-center rounded-[10px] border-none bg-transparent p-1 text-[var(--text-muted)]';
const LEFT_HISTORY_PANEL_CLASS =
  'flex w-[220px] shrink-0 flex-col overflow-hidden border-r border-[var(--line)] bg-[var(--bg-soft)]';
const HISTORY_PANEL_HEADER_CLASS =
  'flex shrink-0 items-center gap-1.5 border-b border-[var(--line)] px-3 py-2.5';
const HISTORY_GROUP_LABEL_CLASS =
  'px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--text-muted)]';
const SLASH_MENU_CLASS = 'mb-2 rounded-[12px] border border-[var(--line)] bg-[var(--bg-card)]';
const SLASH_MENU_HEADER_CLASS =
  'flex items-center justify-between border-b border-[var(--line)] px-2.5 py-1 text-[10px] uppercase tracking-[0.06em] text-[var(--text-muted)]';
const SLASH_MENU_EMPTY_CLASS = 'px-2.5 py-2 text-[11px] text-[var(--text-muted)]';
const SLASH_KIND_BADGE_CLASS =
  'rounded-[9px] border border-[var(--line)] bg-[var(--bg-soft)] px-1.5 py-px text-[10px] text-[var(--text-muted)]';
const CURSOR_CLASS = 'animate-pulse text-[var(--primary)]';
const AGENT_SEGMENT_TAG_BASE_CLASS =
  'rounded-lg border px-2 py-0.5 font-["Space_Mono"] text-[10px] font-bold tracking-[0.04em]';
const AGENT_SEGMENT_BODY_BASE_CLASS =
  'rounded-[0_10px_10px_10px] border border-l-[3px] px-[14px] py-[10px]';

const AGENT_SEGMENT_TAG_CLASS: Record<string, string> = {
  Nakiros: 'border-[#0D9E9E40] bg-[rgba(13,158,158,0.07)] text-[#0D9E9E]',
  PM: 'border-[#7C3AED40] bg-[rgba(124,58,237,0.07)] text-[#7C3AED]',
  Architect: 'border-[#2563EB40] bg-[rgba(37,99,235,0.07)] text-[#2563EB]',
  Dev: 'border-[#16A34A40] bg-[rgba(22,163,74,0.07)] text-[#16A34A]',
  SM: 'border-[#D9770640] bg-[rgba(217,119,6,0.07)] text-[#D97706]',
  QA: 'border-[#DC262640] bg-[rgba(220,38,38,0.07)] text-[#DC2626]',
  Hotfix: 'border-[#B91C1C40] bg-[rgba(185,28,28,0.07)] text-[#B91C1C]',
  Brainstorming: 'border-[#DB277740] bg-[rgba(219,39,119,0.07)] text-[#DB2777]',
};

const AGENT_SEGMENT_BODY_CLASS: Record<string, string> = {
  Nakiros: 'border-[#0D9E9E25] border-l-[#0D9E9E] bg-[rgba(13,158,158,0.07)]',
  PM: 'border-[#7C3AED25] border-l-[#7C3AED] bg-[rgba(124,58,237,0.07)]',
  Architect: 'border-[#2563EB25] border-l-[#2563EB] bg-[rgba(37,99,235,0.07)]',
  Dev: 'border-[#16A34A25] border-l-[#16A34A] bg-[rgba(22,163,74,0.07)]',
  SM: 'border-[#D9770625] border-l-[#D97706] bg-[rgba(217,119,6,0.07)]',
  QA: 'border-[#DC262625] border-l-[#DC2626] bg-[rgba(220,38,38,0.07)]',
  Hotfix: 'border-[#B91C1C25] border-l-[#B91C1C] bg-[rgba(185,28,28,0.07)]',
  Brainstorming: 'border-[#DB277725] border-l-[#DB2777] bg-[rgba(219,39,119,0.07)]',
};

function tabItemClass(active: boolean): string {
  return clsx(
    'flex min-w-0 items-center rounded-[10px] border',
    active
      ? 'border-[var(--line-strong)] bg-[var(--bg-card)]'
      : 'border-[var(--line)] bg-[var(--bg-soft)]',
  );
}

function historyToggleButtonClass(showHistory: boolean): string {
  return clsx(NEW_CONV_BUTTON_CLASS, showHistory ? 'bg-[var(--bg-muted)]' : 'bg-transparent');
}

function slashMenuItemClass(active: boolean): string {
  return clsx(
    'flex w-full items-center justify-between gap-2 border-none border-b border-[var(--line)] bg-transparent px-2.5 py-2 text-left last:border-b-0',
    active && 'bg-[var(--primary-soft)] shadow-[inset_0_0_0_1px_var(--primary)]',
  );
}

function slashMenuCursorClass(active: boolean): string {
  return clsx(
    'h-6 w-[3px] shrink-0 rounded-full bg-[var(--primary)] transition-opacity',
    active ? 'opacity-100' : 'opacity-0',
  );
}

function slashMenuCommandClass(active: boolean): string {
  return clsx(
    'truncate font-mono text-[11px]',
    active ? 'font-bold text-[var(--primary)]' : 'text-[var(--text)]',
  );
}

function slashMenuLabelClass(active: boolean): string {
  return clsx(
    'truncate text-[10px]',
    active ? 'text-[var(--text)]' : 'text-[var(--text-muted)]',
  );
}

function slashMenuKindBadgeClass(active: boolean): string {
  return clsx(
    SLASH_KIND_BADGE_CLASS,
    active && 'border-[var(--primary)] text-[var(--primary)]',
  );
}

function toolTraceChevronClass(expanded: boolean): string {
  return clsx('transition-transform', expanded ? 'rotate-0' : '-rotate-90');
}

function historyItemClass(active: boolean): string {
  return clsx(
    'flex items-center gap-2.5 border-b border-[var(--line)] px-4 py-2.5 transition-colors',
    active ? 'bg-[var(--primary-soft)]' : 'bg-transparent',
  );
}

function agentSegmentTagClass(tag: string): string {
  return clsx(
    AGENT_SEGMENT_TAG_BASE_CLASS,
    AGENT_SEGMENT_TAG_CLASS[tag] ?? 'border-[var(--primary)] bg-[var(--bg-soft)] text-[var(--primary)]',
  );
}

function agentSegmentBodyClass(tag: string): string {
  return clsx(
    AGENT_SEGMENT_BODY_BASE_CLASS,
    AGENT_SEGMENT_BODY_CLASS[tag] ?? 'border-[var(--line)] border-l-[var(--primary)] bg-[var(--bg-soft)]',
  );
}

function agentMessageContainerClass(status: MessageStatus): string {
  return clsx(
    'rounded-[8px_10px_10px_10px] border px-4 py-3',
    status === 'error'
      ? 'border-[rgba(239,68,68,0.25)] bg-[rgba(239,68,68,0.06)]'
      : 'border-[var(--line)] bg-[var(--bg-soft)]',
  );
}

function textareaClass(disabled: boolean): string {
  return clsx(
    'ui-form-control block w-full resize-none rounded-[10px] border border-[var(--line)] bg-[var(--bg-card)] px-2.5 py-[7px] text-[13px] leading-[1.5] text-[var(--text)] focus:border-[var(--primary)] focus:outline-none',
    disabled && 'opacity-50',
  );
}

function comboActionButtonClass({ running, disabled }: { running: boolean; disabled: boolean }): string {
  return clsx(
    'grid h-full w-9 shrink-0 place-items-center border-none transition-colors',
    running
      ? 'bg-[#ef4444] text-white'
      : (disabled
        ? 'cursor-not-allowed bg-[var(--bg-muted)] text-[var(--text-muted)]'
        : 'bg-[var(--primary)] text-white'),
  );
}
