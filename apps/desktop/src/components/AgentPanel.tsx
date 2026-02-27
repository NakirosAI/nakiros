import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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
import type { AgentProvider, StoredRepo } from '@tiqora/shared';

interface QuickAction {
  label: string;
  description: string;
  command: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  { label: 'Generate Context', description: 'Analyse le code + tickets et genere un contexte global', command: '/tiq-workflow-generate-context' },
  { label: 'Architect', description: "Analyse l'architecture et les patterns techniques", command: '/tiq-agent-architect' },
  { label: 'PM Agent', description: 'Cree et affine des tickets, gere les priorites', command: '/tiq-agent-pm' },
  { label: 'Dev Agent', description: 'Implemente des stories avec discipline de branche', command: '/tiq-agent-dev' },
];

const MAX_TABS = 12;
const NEW_TAB_TITLE = 'Nouvelle conversation';
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
  initialRepoPath?: string;
  initialMessage?: string;
  hideRepoSelector?: boolean;
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

function truncateTitle(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return NEW_TAB_TITLE;
  return trimmed.length > 80 ? `${trimmed.slice(0, 80)}…` : trimmed;
}

function toUiMessages(messages: StoredMessage[]): Message[] {
  return messages.map((msg, index) => ({
    id: `restored-${index}-${Date.now()}`,
    role: msg.role,
    content: msg.content,
    status: 'complete',
    tools: msg.tools,
  }));
}

function toStoredMessages(messages: Message[]): StoredMessage[] {
  return messages
    .filter((msg) => msg.content.trim() || msg.tools.length > 0)
    .map(({ role, content, tools }) => ({ role, content, tools }));
}

function providerLabel(provider: AgentProvider): string {
  if (provider === 'codex') return 'Codex';
  if (provider === 'cursor') return 'Cursor';
  return 'Claude';
}

function isAgentProvider(value: unknown): value is AgentProvider {
  return value === 'claude' || value === 'codex' || value === 'cursor';
}

export default function AgentPanel({
  workspaceId,
  repos,
  initialRepoPath,
  initialMessage,
  hideRepoSelector,
  onDone,
}: Props) {
  const [tabs, setTabs] = useState<AgentTabState[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<StoredConversation[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [defaultProvider, setDefaultProvider] = useState<AgentProvider>('claude');
  const [tabsLoaded, setTabsLoaded] = useState(false);
  const [tabLimitMessage, setTabLimitMessage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const tabCounterRef = useRef(0);
  const runToTabIdRef = useRef(new Map<string, string>());
  const cancelledRunIdsRef = useRef(new Set<string>());
  const tabsRef = useRef<AgentTabState[]>([]);
  const conversationsRef = useRef<StoredConversation[]>([]);
  const activeTabIdRef = useRef<string | null>(null);
  const persistTimerRef = useRef<number | null>(null);
  const initialMessageSentRef = useRef(false);

  const repoPathSet = useMemo(() => new Set(repos.map((repo) => repo.localPath)), [repos]);

  const workspaceConversations = useMemo(
    () => conversations.filter((conv) => {
      if (conv.workspaceId) return conv.workspaceId === workspaceId;
      return repoPathSet.has(conv.repoPath);
    }),
    [conversations, workspaceId, repoPathSet],
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
    return repos.find((repo) => repo.localPath === repoPath)?.name ?? repoPath.split('/').pop() ?? '';
  }

  function getDefaultRepoPath(): string {
    return initialRepoPath ?? repos[0]?.localPath ?? '';
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
    repoPath: string;
    provider: AgentProvider;
    sessionId?: string | null;
    conversationId?: string | null;
    messages?: Message[];
  }): AgentTabState {
    return {
      id: args.id ?? makeTabId(),
      title: args.title ?? NEW_TAB_TITLE,
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
    void window.tiqora.saveConversation(nextConversation);
  }

  function createConversationFromTab(tab: AgentTabState, sessionId: string, explicitTitle?: string): StoredConversation {
    const title = explicitTitle ?? tab.pendingTitle ?? tab.title ?? NEW_TAB_TITLE;
    const now = new Date().toISOString();
    return {
      id: `conv-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
      sessionId,
      repoPath: tab.repoPath,
      repoName: getRepoName(tab.repoPath),
      provider: tab.provider,
      workspaceId,
      title,
      createdAt: now,
      lastUsedAt: now,
      messages: toStoredMessages(tab.messages),
    };
  }

  async function hydrateTabs() {
    const [storedConversations, prefs, storedTabs] = await Promise.all([
      window.tiqora.getConversations(),
      window.tiqora.getPreferences(),
      window.tiqora.getAgentTabs(workspaceId),
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
        title: storedTab.title || NEW_TAB_TITLE,
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
        void window.tiqora.saveConversation(recovered);
      }
    }

    conversationsRef.current = mergedConversations;
    setConversations(mergedConversations);

    const restoredTabs: AgentTabState[] = (storedTabs?.tabs ?? [])
      .map((storedTab) => {
        const conv = storedTab.conversationId ? conversationById.get(storedTab.conversationId) : undefined;
        const provider = isAgentProvider(storedTab.provider)
          ? storedTab.provider
          : (conv?.provider ?? preferredProvider);
        const repoPath = resolveRepoPath(storedTab.repoPath ?? conv?.repoPath);
        if (!repoPath) return null;
        return buildTab({
          id: storedTab.tabId,
          title: storedTab.title || conv?.title || NEW_TAB_TITLE,
          repoPath,
          provider,
          sessionId: storedTab.sessionId ?? conv?.sessionId ?? null,
          conversationId: conv?.id ?? storedTab.conversationId ?? null,
          messages: conv ? toUiMessages(conv.messages) : [],
        });
      })
      .filter(Boolean) as AgentTabState[];

    const tabsWithProviderHistory = await Promise.all(
      restoredTabs.map(async (tab) => {
        if (!tab.sessionId) return tab;
        if (tab.provider !== 'codex' && tab.messages.length > 0) return tab;
        try {
          const restored = await window.tiqora.readConversationMessages(
            tab.sessionId,
            tab.repoPath,
            tab.provider,
          );
          if (restored.length === 0) return tab;
          return { ...tab, messages: toUiMessages(restored) };
        } catch {
          return tab;
        }
      }),
    );

    const initialTabs = tabsWithProviderHistory.length > 0
      ? tabsWithProviderHistory
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
      void window.tiqora.saveAgentTabs(workspaceId, state);
    }, TAB_SAVE_DEBOUNCE_MS);

    return () => {
      if (persistTimerRef.current) {
        window.clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
    };
  }, [workspaceId, tabs, activeTabId, tabsLoaded]);

  useEffect(() => {
    const removeStart = window.tiqora.onAgentStart(({ runId, command, cwd }) => {
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

    const removeEvent = window.tiqora.onAgentEvent(({ runId, event }) => {
      const tabId = runToTabIdRef.current.get(runId);
      if (!tabId) return;

      const evt = event as AgentStreamEvent;
      if (evt.type === 'session') {
        let createdConversation: StoredConversation | null = null;
        let updatedExistingConversation: StoredConversation | null = null;

        setTabsAndRef((prev) => prev.map((tab) => {
          if (tab.id !== tabId) return tab;

          if (!tab.conversationId) {
            createdConversation = createConversationFromTab(tab, evt.id);
            return {
              ...tab,
              sessionId: evt.id,
              conversationId: createdConversation.id,
              pendingTitle: null,
              title: createdConversation.title,
            };
          }

          if (tab.conversationId) {
            const conv = conversationsRef.current.find((item) => item.id === tab.conversationId);
            if (conv) {
              const now = new Date().toISOString();
              updatedExistingConversation = {
                ...conv,
                sessionId: evt.id,
                lastUsedAt: now,
              };
            }
          }

          return { ...tab, sessionId: evt.id };
        }));

        if (createdConversation) {
          upsertConversation(createdConversation);
        }
        if (updatedExistingConversation) {
          upsertConversation(updatedExistingConversation);
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

    const removeDone = window.tiqora.onAgentDone(({ runId, exitCode, error }) => {
      const tabId = runToTabIdRef.current.get(runId);
      runToTabIdRef.current.delete(runId);
      const wasCancelled = cancelledRunIdsRef.current.delete(runId);
      if (!tabId) return;

      let updatedConversation: StoredConversation | null = null;

      setTabsAndRef((prev) => prev.map((tab) => {
        if (tab.id !== tabId) return tab;

        const nextMessages = tab.messages.map((msg) => {
          if (msg.id !== `agent-${runId}`) return msg;
          if (wasCancelled) return { ...msg, status: 'complete' as const };
          if (error) return { ...msg, content: error, status: 'error' as const };
          if (exitCode !== 0) {
            if (msg.content.trim()) return { ...msg, status: 'error' as const };
            return { ...msg, content: `Process exited with code ${String(exitCode)}`, status: 'error' as const };
          }
          return { ...msg, status: 'complete' as const };
        });

        if (tab.conversationId) {
          const conv = conversationsRef.current.find((item) => item.id === tab.conversationId);
          const now = new Date().toISOString();
          if (conv) {
            updatedConversation = {
              ...conv,
              repoPath: tab.repoPath,
              repoName: getRepoName(tab.repoPath),
              provider: tab.provider,
              workspaceId,
              sessionId: tab.sessionId ?? conv.sessionId,
              lastUsedAt: now,
              messages: toStoredMessages(nextMessages),
            };
          }
        }

        return {
          ...tab,
          activeRunId: null,
          runningCommand: null,
          messages: nextMessages,
        };
      }));

      if (updatedConversation) {
        upsertConversation(updatedConversation);
      }

      markTabUnread(tabId);

      if (!wasCancelled) onDone?.();
    });

    return () => {
      removeStart();
      removeEvent();
      removeDone();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, onDone]);

  function updateTabInput(tabId: string, value: string) {
    setTabsAndRef((prev) => prev.map((tab) => (tab.id === tabId ? { ...tab, input: value } : tab)));
  }

  function updateTabProvider(tabId: string, provider: AgentProvider) {
    setTabsAndRef((prev) => prev.map((tab) => (tab.id === tabId ? { ...tab, provider } : tab)));
  }

  function updateTabRepoPath(tabId: string, repoPath: string) {
    setTabsAndRef((prev) => prev.map((tab) => (tab.id === tabId ? { ...tab, repoPath } : tab)));
  }

  function createNewTab(opts?: { focus?: boolean; repoPath?: string; provider?: AgentProvider; title?: string }): string | null {
    if (tabsRef.current.length >= MAX_TABS) {
      setTabLimitMessage(`Limite de ${String(MAX_TABS)} onglets atteinte`);
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

    if (tab.activeRunId) {
      const runId = tab.activeRunId;
      cancelledRunIdsRef.current.add(runId);
      runToTabIdRef.current.delete(runId);
      void window.tiqora.agentCancel(runId).finally(() => {
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
    if (!text) return;

    const currentTab = tabsRef.current.find((tab) => tab.id === tabId);
    if (!currentTab || currentTab.activeRunId) return;

    const title = truncateTitle(text);
    const shouldSetPendingTitle = !currentTab.conversationId && currentTab.messages.filter((msg) => msg.role === 'user').length === 0;
    let createdConversation: StoredConversation | null = null;

    const userMessage: Message = {
      id: `user-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
      role: 'user',
      content: text,
      status: 'complete',
      tools: [],
    };

    if (shouldSetPendingTitle) {
      const now = new Date().toISOString();
      createdConversation = {
        id: `conv-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
        sessionId: currentTab.sessionId ?? `pending-${Date.now()}`,
        repoPath: currentTab.repoPath,
        repoName: getRepoName(currentTab.repoPath),
        provider: currentTab.provider,
        workspaceId,
        title,
        createdAt: now,
        lastUsedAt: now,
        messages: [{ role: 'user', content: text, tools: [] }],
      };
      upsertConversation(createdConversation);
    }

    setTabsAndRef((prev) => prev.map((tab) => {
      if (tab.id !== tabId) return tab;
      return {
        ...tab,
        input: '',
        title: shouldSetPendingTitle ? title : tab.title,
        pendingTitle: shouldSetPendingTitle ? null : tab.pendingTitle,
        conversationId: tab.conversationId ?? createdConversation?.id ?? null,
        messages: [...tab.messages, userMessage],
      };
    }));

    const nextTab = tabsRef.current.find((tab) => tab.id === tabId);
    if (!nextTab) return;

    const additionalDirs = repos
      .map((repo) => repo.localPath)
      .filter((path) => path !== nextTab.repoPath);

    try {
      const runId = await window.tiqora.agentRun(
        nextTab.repoPath,
        text,
        nextTab.sessionId,
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
        content: errorMessage || 'Unable to start agent run.',
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
    void window.tiqora.agentCancel(runId);

    setTabsAndRef((prev) => prev.map((tab) => {
      if (tab.id !== activeTab.id) return tab;
      return {
        ...tab,
        activeRunId: null,
        runningCommand: null,
        messages: tab.messages.map((msg) => (
          msg.status === 'streaming'
            ? { ...msg, status: 'complete', content: `${msg.content}\n\n_[Stopped]_` }
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
        messages: toUiMessages(conv.messages),
      };
    }));

    if (conv.provider === 'codex' || conv.messages.length === 0) {
      try {
        const restored = await window.tiqora.readConversationMessages(
          conv.sessionId,
          conv.repoPath,
          conv.provider,
        );
        if (restored.length > 0) {
          setTabsAndRef((prev) => prev.map((tab) => {
            if (tab.id !== tabId) return tab;
            return { ...tab, messages: toUiMessages(restored) };
          }));
          const updatedConv: StoredConversation = {
            ...conv,
            messages: restored,
          };
          upsertConversation(updatedConv);
        }
      } catch {
        // Ignore history fallback failures.
      }
    }

    setShowHistory(false);
  }

  function deleteConversation(id: string) {
    void window.tiqora.deleteConversation(id);
    setConversations((prev) => {
      const next = prev.filter((conv) => conv.id !== id);
      conversationsRef.current = next;
      return next;
    });
    setTabsAndRef((prev) => prev.map((tab) => (
      tab.conversationId === id
        ? { ...tab, conversationId: null, sessionId: null, title: NEW_TAB_TITLE }
        : tab
    )));
  }

  function formatRelativeDate(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
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
  const repoLocked = !!activeTab && activeTab.messages.some((msg) => msg.role === 'user');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', overflow: 'hidden', position: 'relative' }}>
      <div style={headerStyle}>
        <Bot size={15} color="var(--primary)" />
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>Agents</span>

        {activeTab && (
          <>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>provider</span>
            <select
              value={activeTab.provider}
              onChange={(e) => updateTabProvider(activeTab.id, e.target.value as AgentProvider)}
              style={selectStyle}
              disabled={!!activeTab.activeRunId}
            >
              <option value="claude">Claude</option>
              <option value="codex">Codex</option>
              <option value="cursor">Cursor</option>
            </select>
          </>
        )}

        {!hideRepoSelector && activeTab && (
          <>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>repo</span>
            <select
              value={activeTab.repoPath}
              onChange={(e) => updateTabRepoPath(activeTab.id, e.target.value)}
              style={selectStyle}
              disabled={repoLocked || !!activeTab.activeRunId}
            >
              {repos.map((repo) => (
                <option key={repo.localPath} value={repo.localPath}>{repo.name}</option>
              ))}
            </select>
            {repoLocked && (
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>repo verrouille</span>
            )}
          </>
        )}

        {activeTab?.runningCommand && (
          <span style={runningIndicator}>
            ● {activeTab.runningCommand.length > 55 ? `${activeTab.runningCommand.slice(0, 55)}…` : activeTab.runningCommand}
          </span>
        )}

        {!activeTab?.runningCommand && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            {activeTab?.sessionId && (
              <span title={`Session: ${activeTab.sessionId}`} style={sessionBadge}>
                ↺ {providerLabel(activeTab.provider)} session
              </span>
            )}
            <button
              onClick={() => setShowHistory((value) => !value)}
              title="Historique des conversations"
              style={{ ...newConvButton, background: showHistory ? 'var(--bg-muted)' : 'transparent' }}
            >
              <Clock size={11} />
              {historyCount > 0 && (
                <span style={{ fontSize: 10, background: 'var(--primary)', color: '#fff', borderRadius: 8, padding: '0 4px', lineHeight: '14px' }}>
                  {historyCount}
                </span>
              )}
            </button>
            <button
              onClick={createNewConversationTab}
              title="Nouvelle conversation"
              style={newConvButton}
              disabled={hasReachedTabLimit}
            >
              <Plus size={11} />
              Nouveau
            </button>
          </div>
        )}
      </div>

      <div style={tabStrip}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const isRunning = !!tab.activeRunId;
          return (
            <div key={tab.id} style={tabItem(isActive)}>
              <button
                onClick={() => selectTab(tab.id)}
                style={tabSelectButton}
                title={tab.title}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {tab.title}
                </span>
                <span style={{ ...sessionBadge, marginLeft: 6, fontSize: 9 }}>
                  {providerLabel(tab.provider)}
                </span>
                {tab.hasUnread && <span style={tabUnreadDot} />}
                {!tab.hasUnread && isRunning && <span style={tabRunningDot} />}
              </button>
              <button onClick={() => closeTab(tab.id)} style={tabCloseBtn} title="Fermer">
                <X size={11} />
              </button>
            </div>
          );
        })}
      </div>

      {tabLimitMessage && (
        <div style={{ padding: '6px 16px', fontSize: 11, color: '#b45309', borderBottom: '1px solid var(--line)', background: '#fffbeb' }}>
          {tabLimitMessage}
        </div>
      )}

      {showHistory && (
        <div style={historyOverlay}>
          <div style={historyHeader}>
            <Clock size={12} color="var(--primary)" />
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>Historique (workspace)</span>
            <button onClick={() => setShowHistory(false)} style={historyCloseBtn}>✕</button>
          </div>
          {workspaceConversations.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
              Aucune conversation sauvegardee
            </div>
          ) : (
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {workspaceConversations.map((conv) => (
                <div key={conv.id} style={historyItem(false)} onClick={() => void openConversationFromHistory(conv)}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {conv.title}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, display: 'flex', gap: 6 }}>
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
                    style={historyDeleteBtn}
                    title="Supprimer"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={quickActionsBar}>
        <div style={quickActionsLabel}>Quick actions</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {QUICK_ACTIONS.map((qa) => (
            <button
              key={qa.command}
              onClick={() => activeTab && void sendMessageToTab(activeTab.id, qa.command)}
              disabled={!activeTab || !!activeTab.activeRunId}
              title={qa.description}
              style={quickActionButton(!activeTab || !!activeTab.activeRunId)}
            >
              <Sparkles size={11} />
              {qa.label}
            </button>
          ))}
        </div>
      </div>

      <div style={messagesArea}>
        {activeMessages.length === 0 && (
          <div style={emptyState}>
            <Bot size={32} color="var(--line-strong)" style={{ marginBottom: 10 }} />
            <p style={{ margin: 0 }}>Lance un agent ou tape une commande</p>
            <p style={{ margin: '4px 0 0', fontSize: 11 }}>
              Ex.{' '}
              <code style={{ background: 'var(--bg-muted)', padding: '1px 4px', borderRadius: 2 }}>/tiq-agent-dev</code>
            </p>
          </div>
        )}

        {activeMessages.map((msg) => (
          <div key={msg.id} style={msg.role === 'user' ? userMsgWrapper : agentMsgWrapper}>
            {msg.role === 'user' ? (
              <div style={userMsgBubble}>{msg.content}</div>
            ) : (
              <div>
                <div style={agentHeader}>
                  <Bot size={13} color="var(--primary)" />
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)' }}>Agent</span>
                  {msg.status === 'streaming' && !msg.tools.length && !msg.content && (
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>thinking…</span>
                  )}
                  {msg.status === 'error' && (
                    <span style={{ fontSize: 10, color: '#ef4444' }}>error</span>
                  )}
                </div>

                {msg.tools.length > 0 && (
                  <div style={toolTrace}>
                    {msg.tools.map((tool, index) => (
                      <div key={`${tool.name}-${index}`} style={toolRow}>
                        <ToolIcon name={tool.name} />
                        <span style={toolDisplayText}>{tool.display}</span>
                      </div>
                    ))}
                    {msg.status === 'streaming' && !msg.content.trim() && (
                      <div style={{ ...toolRow, opacity: 0.5 }}>
                        <Wrench size={11} color="var(--primary)" />
                        <span style={toolDisplayText}><span style={cursor}>▌</span></span>
                      </div>
                    )}
                  </div>
                )}

                {(msg.content.trim() || msg.status !== 'streaming') && (
                  <div style={agentMsgContainer(msg.status)}>
                    <div className={`agent-md${msg.status === 'error' ? ' agent-md--error' : ''}`}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.content || ' '}
                      </ReactMarkdown>
                      {msg.status === 'streaming' && msg.content && (
                        <span style={cursor}>▌</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      <div style={inputBar}>
        <textarea
          value={activeTab?.input ?? ''}
          onChange={(e) => activeTab && updateTabInput(activeTab.id, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && activeTab) {
              e.preventDefault();
              void sendMessageToTab(activeTab.id, activeTab.input);
            }
          }}
          placeholder="Message ou /tiq-agent-dev…"
          disabled={!activeTab || !!activeTab.activeRunId}
          rows={1}
          style={textareaStyle(!activeTab || !!activeTab.activeRunId)}
        />
        {activeTab?.activeRunId ? (
          <button onClick={stopActiveRun} title="Stop" style={stopButton}>
            <Square size={14} />
          </button>
        ) : (
          <button
            onClick={() => activeTab && void sendMessageToTab(activeTab.id, activeTab.input)}
            disabled={!activeTab || !activeTab.input.trim()}
            title="Send (Enter)"
            style={sendButton(!activeTab || !activeTab.input.trim())}
          >
            <Send size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

const headerStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10,
  padding: '10px 16px',
  borderBottom: '1px solid var(--line)',
  background: 'var(--bg-soft)',
  flexShrink: 0,
};

const tabStrip: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 12px',
  borderBottom: '1px solid var(--line)',
  background: 'var(--bg-soft)',
  overflowX: 'auto',
  flexShrink: 0,
};

const tabItem = (active: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  minWidth: 0,
  borderRadius: 2,
  border: active ? '1px solid var(--line-strong)' : '1px solid var(--line)',
  background: active ? 'var(--bg-card)' : 'var(--bg-soft)',
});

const tabSelectButton: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: 'var(--text)',
  padding: '4px 8px',
  fontSize: 11,
  display: 'flex',
  alignItems: 'center',
  minWidth: 0,
  cursor: 'pointer',
};

const tabCloseBtn: React.CSSProperties = {
  width: 24,
  height: 24,
  border: 'none',
  borderLeft: '1px solid var(--line)',
  background: 'transparent',
  color: 'var(--text-muted)',
  display: 'grid',
  placeItems: 'center',
  cursor: 'pointer',
  flexShrink: 0,
};

const tabRunningDot: React.CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: '50%',
  background: 'var(--primary)',
  marginLeft: 6,
  flexShrink: 0,
};

const tabUnreadDot: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: '50%',
  background: '#f59e0b',
  marginLeft: 6,
  flexShrink: 0,
};

const quickActionsBar: React.CSSProperties = {
  padding: '10px 16px',
  borderBottom: '1px solid var(--line)',
  background: 'var(--bg-soft)',
  flexShrink: 0,
};

const quickActionsLabel: React.CSSProperties = {
  fontSize: 10, color: 'var(--text-muted)', fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8,
};

const messagesArea: React.CSSProperties = {
  flex: 1, overflowY: 'auto', padding: '16px',
  display: 'flex', flexDirection: 'column', gap: 14,
};

const inputBar: React.CSSProperties = {
  borderTop: '1px solid var(--line)', padding: '10px 12px',
  background: 'var(--bg-soft)', flexShrink: 0,
  display: 'flex', gap: 8, alignItems: 'flex-end',
};

const emptyState: React.CSSProperties = {
  margin: 'auto', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13,
};

const selectStyle: React.CSSProperties = {
  background: 'var(--bg-card)', border: '1px solid var(--line)',
  borderRadius: 2, color: 'var(--text)', fontSize: 12, padding: '3px 6px', cursor: 'pointer',
};

const runningIndicator: React.CSSProperties = {
  marginLeft: 'auto', fontSize: 10, color: 'var(--primary)',
  fontFamily: 'monospace', maxWidth: 280,
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};

const sessionBadge: React.CSSProperties = {
  fontSize: 10, color: 'var(--primary)', fontFamily: 'monospace',
  background: 'var(--primary-soft)', borderRadius: 2, padding: '1px 5px',
  cursor: 'default',
};

const newConvButton: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 4,
  padding: '3px 8px', background: 'transparent',
  border: '1px solid var(--line)', borderRadius: 2,
  color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer', flexShrink: 0,
};

const quickActionButton = (disabled: boolean): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px',
  background: disabled ? 'var(--bg-muted)' : 'var(--bg-card)',
  border: '1px solid var(--line)', borderRadius: 2,
  color: disabled ? 'var(--text-muted)' : 'var(--text)',
  fontSize: 12, fontWeight: 600,
  cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
});

const userMsgWrapper: React.CSSProperties = { display: 'flex', justifyContent: 'flex-end' };
const agentMsgWrapper: React.CSSProperties = { display: 'flex', flexDirection: 'column' };

const userMsgBubble: React.CSSProperties = {
  maxWidth: '72%', padding: '9px 13px',
  background: 'var(--primary)', color: '#fff',
  borderRadius: '10px 10px 2px 10px',
  fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
};

const agentHeader: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6,
};

const toolTrace: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 3,
  marginBottom: 8, padding: '6px 10px',
  background: 'var(--bg-muted)', borderRadius: '4px 8px 8px 4px',
  borderLeft: '2px solid var(--primary)',
};

const toolRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
};

const toolDisplayText: React.CSSProperties = {
  fontSize: 11, color: 'var(--text-muted)',
  fontFamily: '"JetBrains Mono", "Cascadia Code", Menlo, monospace',
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
};

const agentMsgContainer = (status: MessageStatus): React.CSSProperties => ({
  padding: '12px 16px',
  background: status === 'error' ? 'rgba(239,68,68,0.06)' : 'var(--bg-soft)',
  border: `1px solid ${status === 'error' ? 'rgba(239,68,68,0.25)' : 'var(--line)'}`,
  borderRadius: '4px 10px 10px 10px',
  maxHeight: 560, overflowY: 'auto',
});

const cursor: React.CSSProperties = {
  animation: 'blink 1s step-end infinite', color: 'var(--primary)',
};

const textareaStyle = (disabled: boolean): React.CSSProperties => ({
  flex: 1, resize: 'none', border: '1px solid var(--line)', borderRadius: 2,
  background: 'var(--bg-card)', color: 'var(--text)', fontSize: 13,
  padding: '7px 10px', fontFamily: 'inherit', lineHeight: 1.5, outline: 'none',
  opacity: disabled ? 0.5 : 1,
});

const sendButton = (disabled: boolean): React.CSSProperties => ({
  width: 34, height: 34, display: 'grid', placeItems: 'center',
  background: disabled ? 'var(--bg-muted)' : 'var(--primary)',
  border: 'none', borderRadius: 2,
  color: disabled ? 'var(--text-muted)' : '#fff',
  cursor: disabled ? 'not-allowed' : 'pointer', flexShrink: 0,
});

const stopButton: React.CSSProperties = {
  width: 34, height: 34, display: 'grid', placeItems: 'center',
  background: '#ef4444', border: 'none', borderRadius: 2,
  color: '#fff', cursor: 'pointer', flexShrink: 0,
};

const historyOverlay: React.CSSProperties = {
  position: 'absolute', top: 73, left: 0, right: 0, bottom: 0,
  background: 'var(--bg)', zIndex: 10,
  display: 'flex', flexDirection: 'column',
  borderTop: '1px solid var(--line)',
};

const historyHeader: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '10px 16px', borderBottom: '1px solid var(--line)',
  background: 'var(--bg-soft)', flexShrink: 0,
};

const historyCloseBtn: React.CSSProperties = {
  marginLeft: 'auto', background: 'transparent', border: 'none',
  color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, lineHeight: 1,
  padding: '2px 4px',
};

const historyItem = (active: boolean): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: 10,
  padding: '10px 16px', cursor: 'pointer',
  borderBottom: '1px solid var(--line)',
  background: active ? 'var(--primary-soft)' : 'transparent',
  transition: 'background 0.1s',
});

const historyDeleteBtn: React.CSSProperties = {
  background: 'transparent', border: 'none', color: 'var(--text-muted)',
  cursor: 'pointer', padding: 4, borderRadius: 2, flexShrink: 0,
  display: 'grid', placeItems: 'center',
};
