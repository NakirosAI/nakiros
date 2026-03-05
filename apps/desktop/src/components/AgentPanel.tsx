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
import type { AgentProvider, ResolvedLanguage, StoredRepo } from '@nakiros/shared';
import SessionFeedback, { type SessionFeedbackHandle } from './SessionFeedback.js';

interface QuickAction {
  label: string;
  description: string;
  command: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  { label: 'Generate Context', description: 'Analyse le code + tickets et genere un contexte global', command: '/nak-workflow-generate-context' },
  { label: 'Project Confidence', description: 'Evalue la confiance IA sur la comprehension du projet et les docs manquantes', command: '/nak-workflow-project-understanding-confidence' },
  { label: 'Architect', description: "Analyse l'architecture et les patterns techniques", command: '/nak-agent-architect' },
  { label: 'PM Agent', description: 'Cree et affine des tickets, gere les priorites', command: '/nak-agent-pm' },
  { label: 'Dev Agent', description: 'Implemente des stories avec discipline de branche', command: '/nak-agent-dev' },
];

// ─── Agent select options ──────────────────────────────────────────────────────

interface AgentOption {
  id: string;
  label: string;
  command: string | null;
  placeholder: string;
  group: 'meta' | 'agent' | 'workflow';
}

const AGENT_OPTIONS: AgentOption[] = [
  { id: 'nakiros', label: 'Nakiros', command: '/nak-agent-nakiros', placeholder: 'Parle avec Nakiros…', group: 'meta' },
  { id: 'dev', label: 'Dev Agent', command: '/nak-agent-dev', placeholder: 'Message pour Dev Agent…', group: 'agent' },
  { id: 'pm', label: 'PM Agent', command: '/nak-agent-pm', placeholder: 'Message pour PM Agent…', group: 'agent' },
  { id: 'architect', label: 'Architect', command: '/nak-agent-architect', placeholder: 'Message pour Architect…', group: 'agent' },
  { id: 'sm', label: 'SM Agent', command: '/nak-agent-sm', placeholder: 'Message pour SM Agent…', group: 'agent' },
  { id: 'qa', label: 'QA Agent', command: '/nak-agent-qa', placeholder: 'Message pour QA Agent…', group: 'agent' },
  { id: 'hotfix', label: 'Hotfix Agent', command: '/nak-agent-hotfix', placeholder: 'Message pour Hotfix Agent…', group: 'agent' },
  { id: 'brainstorming', label: 'Brainstorming', command: '/nak-agent-brainstorming', placeholder: 'Message pour Brainstorming…', group: 'agent' },
  { id: 'dev-story', label: 'Dev Story', command: '/nak-workflow-dev-story', placeholder: 'ID du ticket (ex: EX-203)', group: 'workflow' },
  { id: 'create-story', label: 'Create Story', command: '/nak-workflow-create-story', placeholder: 'Décris la story à créer…', group: 'workflow' },
  { id: 'create-ticket', label: 'Create Ticket', command: '/nak-workflow-create-ticket', placeholder: 'Décris le ticket à créer…', group: 'workflow' },
  { id: 'generate-context', label: 'Generate Context', command: '/nak-workflow-generate-context', placeholder: 'Lancer Generate Context sur ce workspace ?', group: 'workflow' },
  { id: 'project-confidence', label: 'Project Confidence', command: '/nak-workflow-project-understanding-confidence', placeholder: 'Évaluer la confiance du projet ?', group: 'workflow' },
  { id: 'qa-review', label: 'QA Review', command: '/nak-workflow-qa-review', placeholder: 'Lancer QA Review ?', group: 'workflow' },
  { id: 'hotfix-story', label: 'Hotfix Story', command: '/nak-workflow-hotfix-story', placeholder: 'ID du ticket hotfix (ex: EX-203)', group: 'workflow' },
  { id: 'sprint-planning', label: 'Sprint Planning', command: '/nak-workflow-sprint', placeholder: 'Lancer Sprint Planning ?', group: 'workflow' },
];

const COMMAND_TITLE_MAP: Record<string, string> = Object.fromEntries(
  AGENT_OPTIONS
    .filter((o) => o.command)
    .map((o) => [o.command!, o.label]),
);

// ─── Multi-agent message rendering ───────────────────────────────────────────

const AGENT_COLORS: Record<string, { accent: string; bg: string }> = {
  Nakiros:       { accent: '#0D9E9E', bg: 'rgba(13,158,158,0.07)'   },
  PM:            { accent: '#7C3AED', bg: 'rgba(124,58,237,0.07)'   },
  Architect:     { accent: '#2563EB', bg: 'rgba(37,99,235,0.07)'    },
  Dev:           { accent: '#16A34A', bg: 'rgba(22,163,74,0.07)'    },
  SM:            { accent: '#D97706', bg: 'rgba(217,119,6,0.07)'    },
  QA:            { accent: '#DC2626', bg: 'rgba(220,38,38,0.07)'    },
  Hotfix:        { accent: '#B91C1C', bg: 'rgba(185,28,28,0.07)'    },
  Brainstorming: { accent: '#DB2777', bg: 'rgba(219,39,119,0.07)'   },
};

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

function generateTitle(text: string): string {
  const trimmed = text.trim();
  for (const [cmd, name] of Object.entries(COMMAND_TITLE_MAP)) {
    if (trimmed === cmd || trimmed.startsWith(`${cmd} `) || trimmed.startsWith(`${cmd}\n`)) {
      const args = trimmed.slice(cmd.length).trim();
      return args ? `${name} · ${args.slice(0, 40)}` : name;
    }
  }
  const words = trimmed.split(/\s+/);
  const short = words.slice(0, 8).join(' ');
  return words.length > 8 ? `${short}…` : short;
}

function buildEffectiveMessage(input: string, agentId: string | null, injectCommand = true): string {
  const opt = AGENT_OPTIONS.find((o) => o.id === agentId);
  if (!opt?.command || !injectCommand) return input;
  const trimmed = input.trim();
  return trimmed ? `${opt.command} ${trimmed}` : opt.command;
}

// ─── Raw NDJSON → UI messages ─────────────────────────────────────────────────

function formatToolDisplay(name: string, input: Record<string, unknown>): string {
  const s = (v: unknown) => String(v ?? '');
  const truncate = (str: string, max = 72) => str.length > max ? `${str.slice(0, max)}…` : str;
  switch (name) {
    case 'Read': return `Reading ${s(input['file_path'])}`;
    case 'Write': return `Writing ${s(input['file_path'])}`;
    case 'Edit': case 'MultiEdit': return `Editing ${s(input['file_path'])}`;
    case 'Bash': return `$ ${truncate(s(input['command']))}`;
    case 'Glob': return `Glob: ${s(input['pattern'])}`;
    case 'Grep': return `Grep: ${s(input['pattern'])} in ${s(input['path'] ?? '.')}`;
    case 'TodoWrite': return 'Updating tasks';
    case 'WebFetch': return `Fetch: ${truncate(s(input['url']), 60)}`;
    case 'WebSearch': return `Search: ${s(input['query'])}`;
    case 'Task': return `Sub-agent: ${truncate(s(input['description']), 60)}`;
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
  workspacePath?: string;
  initialRepoPath?: string;
  initialMessage?: string;
  initialAgentId?: string;
  persistentHistory?: boolean;
  lang?: ResolvedLanguage;
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {segments.map((seg, i) => {
          const colors = AGENT_COLORS[seg.tag] ?? { accent: 'var(--primary)', bg: 'var(--bg-soft)' };
          const isLast = i === segments.length - 1;
          return (
            <div key={i}>
              {seg.tag && (
                <div style={{ marginBottom: 4 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, fontFamily: '"Space Mono", monospace',
                    color: colors.accent,
                    background: colors.bg,
                    padding: '2px 8px', borderRadius: 8,
                    border: `1px solid ${colors.accent}40`,
                    letterSpacing: '0.04em',
                  }}>
                    {seg.tag}
                  </span>
                </div>
              )}
              <div style={{
                padding: '10px 14px',
                background: colors.bg,
                border: `1px solid ${colors.accent}25`,
                borderLeft: `3px solid ${colors.accent}`,
                borderRadius: '0 10px 10px 10px',
              }}>
                <div className="agent-md">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {seg.content || ' '}
                  </ReactMarkdown>
                  {isLast && msg.status === 'streaming' && seg.content && (
                    <span style={cursor}>▌</span>
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
  lang = 'fr',
  onDone,
}: Props) {
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
    if (globalWorkspacePath && repoPath === globalWorkspacePath) return 'Workspace (global)';
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
    void window.nakiros.saveConversation(nextConversation);
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
        title: storedTab.title || NEW_TAB_TITLE,
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
          title: storedTab.title || conv?.title || NEW_TAB_TITLE,
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

  useEffect(() => {
    const removeStart = window.nakiros.onAgentStart(({ runId, command, cwd }) => {
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

    const removeEvent = window.nakiros.onAgentEvent(({ runId, event }) => {
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

    const removeDone = window.nakiros.onAgentDone(({ runId, exitCode, error, rawLines }) => {
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
            return { ...msg, content: `Process exited with code ${String(exitCode)}`, status: 'error' as const };
          }
          return { ...msg, status: 'complete' as const };
        });

        return { ...tab, activeRunId: null, runningCommand: null, messages: nextMessages };
      }));

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
    const selectedOption = AGENT_OPTIONS.find((o) => o.id === selectedAgent);
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
    const title = generateTitle(effectiveText);
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
    void window.nakiros.agentCancel(runId);

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

  function groupConversations(convs: StoredConversation[]): Array<{ label: string; items: StoredConversation[] }> {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const yesterdayStart = new Date(todayStart.getTime() - 86400000);
    const weekStart = new Date(todayStart.getTime() - 6 * 86400000);
    const groups: Record<string, StoredConversation[]> = {
      "Aujourd'hui": [],
      'Hier': [],
      'Cette semaine': [],
      'Plus ancien': [],
    };
    for (const conv of convs) {
      const d = new Date(conv.lastUsedAt);
      if (d >= todayStart) groups["Aujourd'hui"].push(conv);
      else if (d >= yesterdayStart) groups['Hier'].push(conv);
      else if (d >= weekStart) groups['Cette semaine'].push(conv);
      else groups['Plus ancien'].push(conv);
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
  const selectedAgentOption = AGENT_OPTIONS.find((o) => o.id === selectedAgent);
  const isInputDisabled = !activeTab || !!activeTab.activeRunId;
  const canLaunchPresetCommand = Boolean(
    activeTab
    && !activeTab.activeRunId
    && selectedAgentOption?.command
    && activeTab.messages.filter((msg) => msg.role === 'user').length === 0,
  );
  const canSend = Boolean(activeTab) && !activeTab.activeRunId && (Boolean(activeTab?.input.trim()) || canLaunchPresetCommand);
  const activePlaceholder = selectedAgentOption?.placeholder ?? 'Message ou /nak-agent-dev…';

  return (
    <div style={{ display: 'flex', flexDirection: persistentHistory ? 'row' : 'column', height: '100%', width: '100%', minWidth: 0, background: 'var(--bg)', overflow: 'hidden', position: 'relative' }}>
      {persistentHistory && (
        <div style={leftHistoryPanel}>
          <div style={historyPanelHeader}>
            <Clock size={12} color="var(--primary)" />
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', flex: 1 }}>Historique</span>
            <button
              onClick={createNewConversationTab}
              title="Nouvelle conversation"
              style={{ ...newConvButton, padding: '2px 6px' }}
              disabled={hasReachedTabLimit}
            >
              <Plus size={11} />
            </button>
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {workspaceConversations.length === 0 ? (
              <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
                Aucune conversation
              </div>
            ) : (
              groupConversations(workspaceConversations).map(({ label, items }) => (
                <div key={label}>
                  <div style={historyGroupLabel}>{label}</div>
                  {items.map((conv) => {
                    const isOpen = tabs.some((t) => t.conversationId === conv.id);
                    return (
                      <div key={conv.id} style={historyItem(isOpen)} onClick={() => void openConversationFromHistory(conv)}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: isOpen ? 700 : 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {conv.title}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                            {formatRelativeDate(conv.lastUsedAt)}
                          </div>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}
                          style={historyDeleteBtn}
                          title="Supprimer"
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
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, overflow: 'hidden', position: 'relative' }}>
      <div style={headerStyle}>
        <Bot size={15} color="var(--primary)" />
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>Agents</span>

        {activeTab && !persistentHistory && (
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
            {!persistentHistory && (
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
            )}
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

      {!persistentHistory && showHistory && (
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
              <code style={{ background: 'var(--bg-muted)', padding: '1px 4px', borderRadius: 10 }}>/nak-agent-dev</code>
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
            lang={lang}
          />
        );
      })()}

      <div style={inputBar}>
        {persistentHistory && (
          <div style={inputSelectsRow}>
            <select
              value={selectedAgent ?? ''}
              onChange={(e) => setSelectedAgent(e.target.value || null)}
              style={{ ...selectStyle, flex: 1, minWidth: 0 }}
              disabled={!activeTab || !!activeTab.activeRunId}
            >
              <option value="">Chat libre</option>
              <optgroup label="Meta">
                <option value="nakiros">Nakiros</option>
              </optgroup>
              <optgroup label="Agents">
                {AGENT_OPTIONS.filter((o) => o.group === 'agent').map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </optgroup>
              <optgroup label="Workflows">
                {AGENT_OPTIONS.filter((o) => o.group === 'workflow').map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </optgroup>
            </select>
            <select
              value={activeTab?.provider ?? 'claude'}
              onChange={(e) => activeTab && updateTabProvider(activeTab.id, e.target.value as AgentProvider)}
              style={selectStyle}
              disabled={!activeTab || !!activeTab.activeRunId}
            >
              <option value="claude">Claude</option>
              <option value="codex">Codex</option>
              <option value="cursor">Cursor</option>
            </select>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
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
            style={textareaStyle(isInputDisabled)}
          />
          {activeTab?.activeRunId ? (
            <button onClick={stopActiveRun} title="Stop" style={stopButton}>
              <Square size={14} />
            </button>
          ) : (
            <button
              onClick={() => activeTab && void sendMessageToTab(activeTab.id, activeTab.input)}
              disabled={!canSend}
              title="Send (Enter)"
              style={sendButton(!canSend)}
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
  borderRadius: 10,
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
  display: 'flex', flexDirection: 'column',
};

const emptyState: React.CSSProperties = {
  margin: 'auto', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13,
};

const selectStyle: React.CSSProperties = {
  background: 'var(--bg-card)', border: '1px solid var(--line)',
  borderRadius: 10, color: 'var(--text)', fontSize: 12, padding: '3px 6px', cursor: 'pointer',
};

const runningIndicator: React.CSSProperties = {
  marginLeft: 'auto', fontSize: 10, color: 'var(--primary)',
  fontFamily: 'monospace', maxWidth: 280,
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};

const sessionBadge: React.CSSProperties = {
  fontSize: 10, color: 'var(--primary)', fontFamily: 'monospace',
  background: 'var(--primary-soft)', borderRadius: 10, padding: '1px 5px',
  cursor: 'default',
};

const newConvButton: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 4,
  padding: '3px 8px', background: 'transparent',
  border: '1px solid var(--line)', borderRadius: 10,
  color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer', flexShrink: 0,
};

const quickActionButton = (disabled: boolean): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px',
  background: disabled ? 'var(--bg-muted)' : 'var(--bg-card)',
  border: '1px solid var(--line)', borderRadius: 10,
  color: disabled ? 'var(--text-muted)' : 'var(--text)',
  fontSize: 12, fontWeight: 600,
  cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
});

const userMsgWrapper: React.CSSProperties = { display: 'flex', justifyContent: 'flex-end' };
const agentMsgWrapper: React.CSSProperties = { display: 'flex', flexDirection: 'column' };

const userMsgBubble: React.CSSProperties = {
  maxWidth: '72%', padding: '9px 13px',
  background: 'var(--primary)', color: '#fff',
  borderRadius: '10px 10px 8px 10px',
  fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
};

const agentHeader: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6,
};

const toolTrace: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 3,
  marginBottom: 8, padding: '6px 10px',
  background: 'var(--bg-muted)', borderRadius: '8px 10px 10px 8px',
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
  borderRadius: '8px 10px 10px 10px',
});

const cursor: React.CSSProperties = {
  animation: 'blink 1s step-end infinite', color: 'var(--primary)',
};

const textareaStyle = (disabled: boolean): React.CSSProperties => ({
  flex: 1, resize: 'none', border: '1px solid var(--line)', borderRadius: 10,
  background: 'var(--bg-card)', color: 'var(--text)', fontSize: 13,
  padding: '7px 10px', fontFamily: 'inherit', lineHeight: 1.5, outline: 'none',
  opacity: disabled ? 0.5 : 1,
});

const sendButton = (disabled: boolean): React.CSSProperties => ({
  width: 34, height: 34, display: 'grid', placeItems: 'center',
  background: disabled ? 'var(--bg-muted)' : 'var(--primary)',
  border: 'none', borderRadius: 10,
  color: disabled ? 'var(--text-muted)' : '#fff',
  cursor: disabled ? 'not-allowed' : 'pointer', flexShrink: 0,
});

const stopButton: React.CSSProperties = {
  width: 34, height: 34, display: 'grid', placeItems: 'center',
  background: '#ef4444', border: 'none', borderRadius: 10,
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
  cursor: 'pointer', padding: 4, borderRadius: 10, flexShrink: 0,
  display: 'grid', placeItems: 'center',
};

const leftHistoryPanel: React.CSSProperties = {
  width: 220, flexShrink: 0,
  display: 'flex', flexDirection: 'column',
  borderRight: '1px solid var(--line)',
  background: 'var(--bg-soft)',
  overflow: 'hidden',
};

const historyPanelHeader: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '10px 12px',
  borderBottom: '1px solid var(--line)',
  flexShrink: 0,
};

const historyGroupLabel: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.06em',
  padding: '8px 12px 4px',
};

const inputSelectsRow: React.CSSProperties = {
  display: 'flex', gap: 6, marginBottom: 6,
};
