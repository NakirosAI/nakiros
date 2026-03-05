import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import {
  Bot,
  Send,
  Square,
  Sparkles,
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
import type { AgentProvider, StoredRepo } from '@nakiros/shared';
import SessionFeedback, { type SessionFeedbackHandle } from './SessionFeedback.js';
import { AGENT_DEFINITIONS, AGENT_COLORS } from '../constants/agents';
import i18n from '../i18n/index';
import { useIpcListener } from '../hooks/useIpcListener';

interface QuickAction {
  labelKey: string;
  descriptionKey: string;
  command: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  { labelKey: 'quickActions.generateContext.label', descriptionKey: 'quickActions.generateContext.description', command: '/nak-workflow-generate-context' },
  { labelKey: 'quickActions.projectConfidence.label', descriptionKey: 'quickActions.projectConfidence.description', command: '/nak-workflow-project-understanding-confidence' },
  { labelKey: 'quickActions.architect.label', descriptionKey: 'quickActions.architect.description', command: '/nak-agent-architect' },
  { labelKey: 'quickActions.pmAgent.label', descriptionKey: 'quickActions.pmAgent.description', command: '/nak-agent-pm' },
  { labelKey: 'quickActions.devAgent.label', descriptionKey: 'quickActions.devAgent.description', command: '/nak-agent-dev' },
];

// ─── Multi-agent message rendering ───────────────────────────────────────────

const AGENT_TAG_PATTERN = new RegExp(
  `(?<!@)\\[(${Object.keys(AGENT_COLORS).join('|')})\\]`,
  'g',
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

function buildEffectiveMessage(input: string, agentId: string | null, injectCommand = true): string {
  const opt = AGENT_DEFINITIONS.find((o) => o.id === agentId);
  if (!opt?.command || !injectCommand) return input;
  const trimmed = input.trim();
  return trimmed ? `${opt.command} ${trimmed}` : opt.command;
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
            agentTools.push({ name: b['name'], display: formatToolDisplay(b['name'], inp) });
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
      }
      continue;
    }
  }

  flushAgent();
  return result;
}

const MAX_TABS = 12;
const TAB_SAVE_DEBOUNCE_MS = 320;

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
}

interface Props {
  workspaceId: string;
  repos: StoredRepo[];
  workspacePath?: string;
  initialRepoPath?: string;
  initialMessage?: string;
  initialAgentId?: string;
  persistentHistory?: boolean;
  onDone?: () => void;
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

function startsWithNakirosSlashCommand(input: string): boolean {
  const normalized = input.trimStart();
  return normalized.startsWith('/nak-') || normalized.startsWith('/nak:');
}

function isAgentProvider(value: unknown): value is AgentProvider {
  return value === 'claude' || value === 'codex' || value === 'cursor';
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

export default function AgentPanel({
  workspaceId,
  repos,
  workspacePath,
  initialRepoPath,
  initialMessage,
  initialAgentId,
  persistentHistory,
  onDone,
}: Props) {
  const { t } = useTranslation('agent');
  const defaultTabTitle = t('newConversation');
  const commandLabelMap = useMemo(
    () => Object.fromEntries(
      AGENT_DEFINITIONS.map((definition) => [
        definition.command,
        t(definition.labelKey, { defaultValue: definition.label }),
      ]),
    ),
    [t],
  );
  const quickActions = useMemo(
    () => QUICK_ACTIONS.map((action) => ({
      ...action,
      label: t(action.labelKey),
      description: t(action.descriptionKey),
    })),
    [t],
  );
  const agentLabel = (id: string) => {
    const definition = AGENT_DEFINITIONS.find((item) => item.id === id);
    if (!definition) return id;
    return t(definition.labelKey, { defaultValue: definition.label });
  };
  const agentPlaceholder = (id: string) => {
    const definition = AGENT_DEFINITIONS.find((item) => item.id === id);
    if (!definition) return t('inputPlaceholder');
    return t(definition.placeholderKey, { defaultValue: definition.placeholder });
  };
  const [tabs, setTabs] = useState<AgentTabState[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<StoredConversation[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [defaultProvider, setDefaultProvider] = useState<AgentProvider>('claude');
  const [tabsLoaded, setTabsLoaded] = useState(false);
  const [tabLimitMessage, setTabLimitMessage] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(initialAgentId ?? null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const tabCounterRef = useRef(0);
  const runToTabIdRef = useRef(new Map<string, string>());
  const cancelledRunIdsRef = useRef(new Set<string>());
  const tabsRef = useRef<AgentTabState[]>([]);
  const conversationsRef = useRef<StoredConversation[]>([]);
  const activeTabIdRef = useRef<string | null>(null);
  const persistTimerRef = useRef<number | null>(null);
  const initialMessageSentRef = useRef(false);
  const sessionStartTimesRef = useRef(new Map<string, number>());
  const tabRawLinesRef = useRef(new Map<string, unknown[]>());
  const feedbackRefsMap = useRef(new Map<string, React.RefObject<SessionFeedbackHandle | null>>());

  const repoPathSet = useMemo(() => new Set(repos.map((repo) => repo.localPath)), [repos]);
  const globalWorkspacePath = useMemo(() => {
    const candidate = workspacePath?.trim();
    if (!candidate) return null;
    return repoPathSet.has(candidate) ? null : candidate;
  }, [workspacePath, repoPathSet]);
  const runnablePathSet = useMemo(() => {
    const next = new Set(repoPathSet);
    if (globalWorkspacePath) next.add(globalWorkspacePath);
    return next;
  }, [repoPathSet, globalWorkspacePath]);

  const workspaceConversations = useMemo(
    () => conversations.filter((conv) => {
      if (conv.workspaceId) return conv.workspaceId === workspaceId;
      return runnablePathSet.has(conv.repoPath);
    }),
    [conversations, workspaceId, runnablePathSet],
  );

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? null,
    [tabs, activeTabId],
  );

  const hasReachedTabLimit = tabs.length >= MAX_TABS;

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeTab?.messages]);

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
      tab.id === nextTabId ? { ...tab, hasUnread: false } : tab
    )));
    setActiveTabId(nextTabId);
  }

  function getRepoName(repoPath: string): string {
    if (globalWorkspacePath && repoPath === globalWorkspacePath) return t('workspaceGlobal');
    return repos.find((repo) => repo.localPath === repoPath)?.name ?? repoPath.split('/').pop() ?? '';
  }

  function getDefaultRepoPath(): string {
    return globalWorkspacePath ?? initialRepoPath ?? repos[0]?.localPath ?? '';
  }

  function resolveRepoPath(candidate: string | null | undefined): string {
    if (candidate && runnablePathSet.has(candidate)) return candidate;
    return getDefaultRepoPath();
  }

  function makeTabId(): string {
    tabCounterRef.current += 1;
    return `tab-${Date.now()}-${tabCounterRef.current}`;
  }

  function buildTab(args: {
    id?: string;
    title?: string;
    repoPath: string;
    provider: AgentProvider;
    sessionId?: string | null;
    conversationId?: string | null;
    messages?: Message[];
  }): AgentTabState {
    return {
      id: args.id ?? makeTabId(),
      title: args.title ?? defaultTabTitle,
      repoPath: resolveRepoPath(args.repoPath),
      provider: args.provider,
      input: '',
      messages: args.messages ?? [],
      activeRunId: null,
      runningCommand: null,
      sessionId: args.sessionId ?? null,
      conversationId: args.conversationId ?? null,
      pendingTitle: null,
      hasUnread: false,
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
      repoPath: tab.repoPath,
      repoName: getRepoName(tab.repoPath),
      provider: tab.provider,
      workspaceId,
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
        repoPath,
        repoName: getRepoName(repoPath),
        provider: isAgentProvider(storedTab.provider) ? storedTab.provider : preferredProvider,
        workspaceId,
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
          repoPath: tab.repoPath,
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
  }, [workspaceId, tabs, activeTabId, tabsLoaded]);

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
          repoPath: currentTab.repoPath,
          repoName: getRepoName(currentTab.repoPath),
          provider: currentTab.provider,
          workspaceId,
          sessionId: currentTab.sessionId ?? conv.sessionId,
          lastUsedAt: new Date().toISOString(),
          messages: [...conv.messages, ...(rawLines ?? [])],
        });
      }
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

      return { ...tab, activeRunId: null, runningCommand: null, messages: nextMessages };
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


  function createNewTab(opts?: { focus?: boolean; repoPath?: string; provider?: AgentProvider; title?: string }): string | null {
    if (tabsRef.current.length >= MAX_TABS) {
      setTabLimitMessage(t('tabLimitReached', { count: MAX_TABS }));
      return null;
    }

    const active = tabsRef.current.find((tab) => tab.id === activeTabIdRef.current) ?? null;
    const tab = buildTab({
      repoPath: opts?.repoPath ?? active?.repoPath ?? getDefaultRepoPath(),
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
    const selectedOption = AGENT_DEFINITIONS.find((o) => o.id === selectedAgent);
    const text = rawText.trim();

    const currentTab = tabsRef.current.find((tab) => tab.id === tabId);
    if (!currentTab || currentTab.activeRunId) return;

    const userMessageCount = currentTab.messages.filter((msg) => msg.role === 'user').length;
    if (userMessageCount === 0 && !sessionStartTimesRef.current.has(tabId)) {
      sessionStartTimesRef.current.set(tabId, Date.now());
    }
    const shouldInjectPresetCommand = Boolean(selectedOption?.command) && userMessageCount === 0;
    if (!text && !shouldInjectPresetCommand) return;

    const effectiveRepoPath = globalWorkspacePath ?? getDefaultRepoPath();

    const effectiveText = buildEffectiveMessage(text, selectedAgent, shouldInjectPresetCommand);
    const title = generateTitle(effectiveText, commandLabelMap, defaultTabTitle);
    const shouldSetPendingTitle = !currentTab.conversationId && currentTab.messages.filter((msg) => msg.role === 'user').length === 0;
    let createdConversation: StoredConversation | null = null;

    const userMessage: Message = {
      id: `user-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
      role: 'user',
      content: text || (shouldInjectPresetCommand ? (selectedOption?.command ?? '') : ''),
      status: 'complete',
      tools: [],
    };

    const userRaw = { type: 'user', content: effectiveText, timestamp: new Date().toISOString() };

    if (shouldSetPendingTitle) {
      const now = new Date().toISOString();
      createdConversation = {
        id: `conv-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
        sessionId: currentTab.sessionId ?? `pending-${Date.now()}`,
        repoPath: effectiveRepoPath,
        repoName: getRepoName(effectiveRepoPath),
        provider: currentTab.provider,
        workspaceId,
        title,
        agents: selectedAgent ? [selectedAgent] : [],
        createdAt: now,
        lastUsedAt: now,
        messages: [userRaw],
      };
      upsertConversation(createdConversation);
    } else if (currentTab.conversationId) {
      // Append user message to existing conversation
      const existing = conversationsRef.current.find((c) => c.id === currentTab.conversationId);
      if (existing) {
        upsertConversation({ ...existing, messages: [...existing.messages, userRaw], lastUsedAt: new Date().toISOString() });
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
        repoPath: effectiveRepoPath,
        messages: [...tab.messages, userMessage],
      };
    }));

    const nextTab = tabsRef.current.find((tab) => tab.id === tabId);
    if (!nextTab) return;

    const additionalDirs = Array.from(new Set(repos.map((repo) => repo.localPath)));
    const sessionForRun = startsWithNakirosSlashCommand(effectiveText) ? null : nextTab.sessionId;

    try {
      const runId = await window.nakiros.agentRun(
        effectiveRepoPath,
        effectiveText,
        sessionForRun,
        additionalDirs,
        nextTab.provider,
      );

      runToTabIdRef.current.set(runId, tabId);

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
      repoPath: conv.repoPath,
      provider: conv.provider,
      title: conv.title,
    });

    if (!tabId) return;

    setTabsAndRef((prev) => prev.map((tab) => {
      if (tab.id !== tabId) return tab;
      return {
        ...tab,
        title: conv.title,
        repoPath: resolveRepoPath(conv.repoPath),
        provider: conv.provider,
        sessionId: conv.sessionId,
        conversationId: conv.id,
        messages: rawToUiMessages(conv.messages),
      };
    }));

    setShowHistory(false);
  }

  function deleteConversation(id: string) {
    void window.nakiros.deleteConversation(id, workspaceId);
    setConversations((prev) => {
      const next = prev.filter((conv) => conv.id !== id);
      conversationsRef.current = next;
      return next;
    });
    setTabsAndRef((prev) => prev.map((tab) => (
      tab.conversationId === id
        ? { ...tab, conversationId: null, sessionId: null, title: defaultTabTitle }
        : tab
    )));
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
    if (!tabsLoaded || !initialMessage || initialMessageSentRef.current) return;

    initialMessageSentRef.current = true;
    const active = tabsRef.current.find((tab) => tab.id === activeTabIdRef.current) ?? null;

    let targetTabId = active?.id ?? null;
    if (!active || active.messages.length > 0 || active.activeRunId) {
      targetTabId = createNewTab({
        focus: true,
        repoPath: active?.repoPath ?? getDefaultRepoPath(),
        provider: active?.provider ?? defaultProvider,
      });
    }

    if (targetTabId) {
      void sendMessageToTab(targetTabId, initialMessage);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabsLoaded, initialMessage]);

  const activeMessages = activeTab?.messages ?? [];
  const historyCount = workspaceConversations.length;
  const selectedAgentOption = AGENT_DEFINITIONS.find((o) => o.id === selectedAgent);
  const isInputDisabled = !activeTab || !!activeTab.activeRunId;
  const canLaunchPresetCommand = Boolean(
    activeTab
    && !activeTab.activeRunId
    && selectedAgentOption?.command
    && activeTab.messages.filter((msg) => msg.role === 'user').length === 0,
  );
  const canSend = Boolean(activeTab) && !activeTab.activeRunId && (Boolean(activeTab?.input.trim()) || canLaunchPresetCommand);
  const activePlaceholder = selectedAgentOption ? agentPlaceholder(selectedAgentOption.id) : t('inputPlaceholder');

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

        {activeTab && !persistentHistory && (
          <>
            <span className="text-[11px] text-[var(--text-muted)]">{t('provider')}</span>
            <select
              value={activeTab.provider}
              onChange={(e) => updateTabProvider(activeTab.id, e.target.value as AgentProvider)}
              className={SELECT_CLASS}
              disabled={!!activeTab.activeRunId}
            >
              <option value="claude">Claude</option>
              <option value="codex">Codex</option>
              <option value="cursor">Cursor</option>
            </select>
          </>
        )}


        {activeTab?.runningCommand && (
          <span className={RUNNING_INDICATOR_CLASS}>
            ● {activeTab.runningCommand.length > 55 ? `${activeTab.runningCommand.slice(0, 55)}…` : activeTab.runningCommand}
          </span>
        )}

        {!activeTab?.runningCommand && (
          <div className="ml-auto flex items-center gap-1.5">
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
                {tab.hasUnread && <span className={TAB_UNREAD_DOT_CLASS} />}
                {!tab.hasUnread && isRunning && <span className={TAB_RUNNING_DOT_CLASS} />}
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

      <div className={QUICK_ACTIONS_BAR_CLASS}>
        <div className={QUICK_ACTIONS_LABEL_CLASS}>{t('quickActions')}</div>
        <div className="flex flex-wrap gap-1.5">
          {quickActions.map((qa) => (
            <button
              key={qa.command}
              onClick={() => activeTab && void sendMessageToTab(activeTab.id, qa.command)}
              disabled={!activeTab || !!activeTab.activeRunId}
              title={qa.description}
              className={quickActionButtonClass(!activeTab || !!activeTab.activeRunId)}
            >
              <Sparkles size={11} />
              {qa.label}
            </button>
          ))}
        </div>
      </div>

      <div className={MESSAGES_AREA_CLASS}>
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
                  {msg.status === 'streaming' && !msg.tools.length && !msg.content && (
                    <span className="text-[10px] text-[var(--text-muted)]">{t('thinking')}</span>
                  )}
                  {msg.status === 'error' && (
                    <span className="text-[10px] text-[#ef4444]">{t('error')}</span>
                  )}
                </div>

                {msg.tools.length > 0 && (
                  <div className={TOOL_TRACE_CLASS}>
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
                  </div>
                )}

                {(msg.content.trim() || msg.status !== 'streaming') && (
                  <MessageContent msg={msg} />
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
            agent={selectedAgent}
            workflow={null}
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
        {persistentHistory && (
          <div className={INPUT_SELECT_ROW_CLASS}>
            <select
              value={selectedAgent ?? ''}
              onChange={(e) => setSelectedAgent(e.target.value || null)}
              className={WIDE_SELECT_CLASS}
              disabled={!activeTab || !!activeTab.activeRunId}
            >
              <option value="">{t('chatFree')}</option>
              <optgroup label={t('meta')}>
                <option value="nakiros">{agentLabel('nakiros')}</option>
              </optgroup>
              <optgroup label={t('agents')}>
                {AGENT_DEFINITIONS.filter((o) => o.group === 'agent').map((o) => (
                  <option key={o.id} value={o.id}>{agentLabel(o.id)}</option>
                ))}
              </optgroup>
              <optgroup label={t('workflows')}>
                {AGENT_DEFINITIONS.filter((o) => o.group === 'workflow').map((o) => (
                  <option key={o.id} value={o.id}>{agentLabel(o.id)}</option>
                ))}
              </optgroup>
            </select>
            <select
              value={activeTab?.provider ?? 'claude'}
              onChange={(e) => activeTab && updateTabProvider(activeTab.id, e.target.value as AgentProvider)}
              className={SELECT_CLASS}
              disabled={!activeTab || !!activeTab.activeRunId}
            >
              <option value="claude">Claude</option>
              <option value="codex">Codex</option>
              <option value="cursor">Cursor</option>
            </select>
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={activeTab?.input ?? ''}
            onChange={(e) => activeTab && updateTabInput(activeTab.id, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && activeTab) {
                e.preventDefault();
                void sendMessageToTab(activeTab.id, activeTab.input);
              }
            }}
            placeholder={activePlaceholder}
            disabled={isInputDisabled}
            rows={1}
            className={textareaClass(isInputDisabled)}
          />
          {activeTab?.activeRunId ? (
            <button onClick={stopActiveRun} title={t('stop')} className={STOP_BUTTON_CLASS}>
              <Square size={14} />
            </button>
          ) : (
            <button
              onClick={() => activeTab && void sendMessageToTab(activeTab.id, activeTab.input)}
              disabled={!canSend}
              title={t('sendEnter')}
              className={sendButtonClass(!canSend)}
            >
              <Send size={14} />
            </button>
          )}
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
const TAB_UNREAD_DOT_CLASS = 'ml-1.5 h-2 w-2 shrink-0 rounded-full bg-[#f59e0b]';
const QUICK_ACTIONS_BAR_CLASS =
  'shrink-0 border-b border-[var(--line)] bg-[var(--bg-soft)] px-4 py-2.5';
const QUICK_ACTIONS_LABEL_CLASS =
  'mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]';
const MESSAGES_AREA_CLASS = 'flex flex-1 flex-col gap-3.5 overflow-y-auto p-4';
const INPUT_BAR_CLASS =
  'flex shrink-0 flex-col border-t border-[var(--line)] bg-[var(--bg-soft)] px-3 py-2.5';
const EMPTY_STATE_CLASS = 'm-auto text-center text-[13px] text-[var(--text-muted)]';
const SELECT_CLASS =
  'ui-form-control cursor-pointer rounded-[10px] border border-[var(--line)] bg-[var(--bg-card)] px-1.5 py-[3px] text-xs text-[var(--text)]';
const RUNNING_INDICATOR_CLASS =
  'ml-auto max-w-[280px] truncate font-mono text-[10px] text-[var(--primary)]';
const SESSION_BADGE_CLASS =
  'cursor-default rounded-[10px] bg-[var(--primary-soft)] px-1.5 py-px font-mono text-[10px] text-[var(--primary)]';
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
const INPUT_SELECT_ROW_CLASS = 'mb-1.5 flex gap-1.5';
const WIDE_SELECT_CLASS = `${SELECT_CLASS} min-w-0 flex-1`;
const STOP_BUTTON_CLASS =
  'grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] border-none bg-[#ef4444] text-white';
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

function quickActionButtonClass(disabled: boolean): string {
  return clsx(
    'inline-flex items-center gap-[5px] rounded-[10px] border border-[var(--line)] px-2.5 py-[5px] text-xs font-semibold',
    disabled
      ? 'cursor-not-allowed bg-[var(--bg-muted)] text-[var(--text-muted)] opacity-50'
      : 'bg-[var(--bg-card)] text-[var(--text)]',
  );
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
    'ui-form-control flex-1 resize-none rounded-[10px] border border-[var(--line)] bg-[var(--bg-card)] px-2.5 py-[7px] text-[13px] leading-[1.5] text-[var(--text)] focus:border-[var(--primary)] focus:outline-none',
    disabled && 'opacity-50',
  );
}

function sendButtonClass(disabled: boolean): string {
  return clsx(
    'grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] border-none',
    disabled
      ? 'cursor-not-allowed bg-[var(--bg-muted)] text-[var(--text-muted)]'
      : 'bg-[var(--primary)] text-white',
  );
}
