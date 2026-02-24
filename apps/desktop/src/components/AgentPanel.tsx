import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Bot, Send, Square, Sparkles, RotateCcw, Terminal, FileText, Code2, Search, Globe, ListTodo, Wrench, Clock, Trash2 } from 'lucide-react';
import type { StoredRepo } from '@tiqora/shared';

// ─── Quick actions ─────────────────────────────────────────────────────────────

interface QuickAction { label: string; description: string; command: string }

const QUICK_ACTIONS: QuickAction[] = [
  { label: 'Generate Context', description: 'Analyse le code + tickets et génère un contexte global', command: '/tiq-workflow-generate-context' },
  { label: 'Architect',        description: 'Analyse l\'architecture et les patterns techniques',       command: '/tiq-agent-architect' },
  { label: 'PM Agent',         description: 'Crée et affine des tickets, gère les priorités',           command: '/tiq-agent-pm' },
  { label: 'Dev Agent',        description: 'Implémente des stories avec discipline de branche',        command: '/tiq-agent-dev' },
];

// ─── Tool icon mapping ────────────────────────────────────────────────────────

function ToolIcon({ name }: { name: string }) {
  const size = 11;
  const color = 'var(--primary)';
  switch (name) {
    case 'Read':        return <FileText size={size} color={color} />;
    case 'Write':
    case 'Edit':
    case 'MultiEdit':   return <Code2 size={size} color={color} />;
    case 'Bash':        return <Terminal size={size} color={color} />;
    case 'Glob':
    case 'Grep':        return <Search size={size} color={color} />;
    case 'WebFetch':
    case 'WebSearch':   return <Globe size={size} color={color} />;
    case 'TodoWrite':   return <ListTodo size={size} color={color} />;
    default:            return <Wrench size={size} color={color} />;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

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

interface Props {
  repos: StoredRepo[];
  initialRepoPath?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AgentPanel({ repos, initialRepoPath }: Props) {
  const [repoPath, setRepoPath] = useState(initialRepoPath ?? repos[0]?.localPath ?? '');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [runningCommand, setRunningCommand] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<StoredConversation[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const msgCounter = useRef(0);
  const convIdRef = useRef<string | null>(null);
  const pendingTitleRef = useRef<string | null>(null);
  // messagesRef mirrors messages state synchronously — safe to read in IPC callbacks
  // (React 18 functional updaters are NOT called synchronously, so we can't rely on
  //  the `let final = []; setMessages(prev => { final = ...; return ... })` pattern)
  const messagesRef = useRef<Message[]>([]);

  // Load conversation history on mount
  useEffect(() => {
    void window.tiqora.getConversations().then(setConversations);
  }, []);

  // Auto-scroll on new content
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Subscribe to agent stream events
  useEffect(() => {
    const removeStart = window.tiqora.onAgentStart(({ runId, command, cwd }) => {
      setRunningCommand(command);
      messagesRef.current = messagesRef.current.map((m) =>
        m.id === `agent-${runId}` ? { ...m, content: `_cwd: \`${cwd}\`_\n\n` } : m,
      );
      setMessages(messagesRef.current);
    });

    const removeEvent = window.tiqora.onAgentEvent(({ runId, event }) => {
      const evt = event as AgentStreamEvent;

      if (evt.type === 'session') {
        setSessionId(evt.id);

        if (pendingTitleRef.current && !convIdRef.current) {
          // First session capture: create + save the conversation
          const id = `conv-${Date.now()}`;
          convIdRef.current = id;
          const repoName = repos.find((r) => r.localPath === repoPath)?.name ?? repoPath.split('/').pop() ?? '';
          const conv: StoredConversation = {
            id,
            sessionId: evt.id,
            repoPath,
            repoName,
            title: pendingTitleRef.current,
            createdAt: new Date().toISOString(),
            lastUsedAt: new Date().toISOString(),
            messages: [],
          };
          pendingTitleRef.current = null;
          void window.tiqora.saveConversation(conv);
          setConversations((prev) => [conv, ...prev.filter((c) => c.id !== id)]);
        } else if (convIdRef.current) {
          // Subsequent turns: update lastUsedAt
          const now = new Date().toISOString();
          setConversations((prev) => {
            const updated = prev.map((c) =>
              c.id === convIdRef.current ? { ...c, lastUsedAt: now, sessionId: evt.id } : c,
            );
            const conv = updated.find((c) => c.id === convIdRef.current);
            if (conv) void window.tiqora.saveConversation(conv);
            return updated;
          });
        }

      } else if (evt.type === 'text') {
        // Update ref synchronously (source of truth for callbacks)
        messagesRef.current = messagesRef.current.map((m) =>
          m.id === `agent-${runId}` ? { ...m, content: m.content + evt.text } : m,
        );
        setMessages(messagesRef.current);

      } else if (evt.type === 'tool') {
        messagesRef.current = messagesRef.current.map((m) =>
          m.id === `agent-${runId}`
            ? { ...m, tools: [...m.tools, { name: evt.name, display: evt.display }] }
            : m,
        );
        setMessages(messagesRef.current);
      }
    });

    const removeDone = window.tiqora.onAgentDone(({ runId, exitCode, error }) => {
      setActiveRunId(null);
      setRunningCommand(null);

      // Read from ref — always current, unlike React state which updates asynchronously
      const finalMessages = messagesRef.current.map((m) => {
        if (m.id !== `agent-${runId}`) return m;
        if (error) return { ...m, content: error, status: 'error' as const };
        if (exitCode !== 0 && !m.content.trim()) {
          return { ...m, content: `Process exited with code ${String(exitCode)}`, status: 'error' as const };
        }
        return { ...m, status: 'complete' as const };
      });
      messagesRef.current = finalMessages;
      setMessages(finalMessages);

      // Persist messages in conversation record after each completed turn
      if (convIdRef.current) {
        const storedMsgs = finalMessages
          .filter((m) => m.content.trim())
          .map(({ role, content, tools }) => ({ role, content, tools }));
        setConversations((convs) => {
          const now = new Date().toISOString();
          const next = convs.map((c) =>
            c.id === convIdRef.current ? { ...c, lastUsedAt: now, messages: storedMsgs } : c,
          );
          const conv = next.find((c) => c.id === convIdRef.current);
          if (conv) void window.tiqora.saveConversation(conv);
          return next;
        });
      }
    });

    return () => { removeStart(); removeEvent(); removeDone(); };
  }, []);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || activeRunId) return;

    // Capture title for first message of a new conversation
    if (messages.length === 0 && !convIdRef.current) {
      pendingTitleRef.current = trimmed.slice(0, 80);
    }

    const userMsgId = `user-${++msgCounter.current}`;
    const userMsg: Message = { id: userMsgId, role: 'user', content: trimmed, status: 'complete', tools: [] };
    messagesRef.current = [...messagesRef.current, userMsg];
    setMessages(messagesRef.current);
    setInput('');

    // Use captured session_id for --resume (proper multi-turn, not --continue)
    const runId = await window.tiqora.agentRun(repoPath, trimmed, sessionId);

    setActiveRunId(runId);
    const agentMsg: Message = { id: `agent-${runId}`, role: 'agent', content: '', status: 'streaming', tools: [] };
    messagesRef.current = [...messagesRef.current, agentMsg];
    setMessages(messagesRef.current);
  }

  function handleNewConversation() {
    if (activeRunId) return;
    messagesRef.current = [];
    setMessages([]);
    setSessionId(null);
    msgCounter.current = 0;
    convIdRef.current = null;
    pendingTitleRef.current = null;
  }

  function handleResumeConversation(conv: StoredConversation) {
    if (activeRunId) return;
    setSessionId(conv.sessionId);
    setRepoPath(conv.repoPath);
    convIdRef.current = conv.id;
    pendingTitleRef.current = null;
    setShowHistory(false);
    msgCounter.current = 0;

    // Read messages from Claude's JSONL (source of truth — includes old conversations too)
    void window.tiqora.readConversationMessages(conv.sessionId, conv.repoPath).then((msgs) => {
      const restored: Message[] = msgs.map((m, i) => ({
        id: `restored-${i}`,
        role: m.role,
        content: m.content,
        status: 'complete' as const,
        tools: m.tools,
      }));
      messagesRef.current = restored;
      setMessages(restored);
    });
  }

  function handleDeleteConversation(id: string) {
    void window.tiqora.deleteConversation(id);
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (convIdRef.current === id) {
      convIdRef.current = null;
    }
  }

  function formatRelativeDate(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  function handleStop() {
    if (!activeRunId) return;
    void window.tiqora.agentCancel(activeRunId);
    setActiveRunId(null);
    messagesRef.current = messagesRef.current.map((m) =>
      m.status === 'streaming'
        ? { ...m, status: 'complete' as const, content: m.content + '\n\n_[Stopped]_' }
        : m,
    );
    setMessages(messagesRef.current);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', overflow: 'hidden', position: 'relative' }}>

      {/* Header */}
      <div style={headerStyle}>
        <Bot size={15} color="var(--primary)" />
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>Agents</span>
        {repos.length > 1 && (
          <>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>in</span>
            <select value={repoPath} onChange={(e) => setRepoPath(e.target.value)} style={selectStyle}>
              {repos.map((r) => <option key={r.localPath} value={r.localPath}>{r.name}</option>)}
            </select>
          </>
        )}
        {repos.length === 1 && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{repos[0]?.name}</span>}

        {/* Running indicator */}
        {runningCommand && (
          <span style={runningIndicator}>
            ● {runningCommand.length > 50 ? runningCommand.slice(0, 50) + '…' : runningCommand}
          </span>
        )}

        {/* Right controls */}
        {!runningCommand && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            {sessionId && (
              <span title={`Session: ${sessionId}`} style={sessionBadge}>
                ↺ session
              </span>
            )}
            {/* History button */}
            <button
              onClick={() => setShowHistory((v) => !v)}
              title="Historique des conversations"
              style={{ ...newConvButton, background: showHistory ? 'var(--bg-muted)' : 'transparent' }}
            >
              <Clock size={11} />
              {conversations.length > 0 && (
                <span style={{ fontSize: 10, background: 'var(--primary)', color: '#fff', borderRadius: 8, padding: '0 4px', lineHeight: '14px' }}>
                  {conversations.length}
                </span>
              )}
            </button>
            {messages.length > 0 && (
              <button onClick={handleNewConversation} title="Nouvelle conversation" style={newConvButton}>
                <RotateCcw size={11} />
                Nouveau
              </button>
            )}
          </div>
        )}
      </div>

      {/* History overlay */}
      {showHistory && (
        <div style={historyOverlay}>
          <div style={historyHeader}>
            <Clock size={12} color="var(--primary)" />
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>Historique</span>
            <button onClick={() => setShowHistory(false)} style={historyCloseBtn}>✕</button>
          </div>
          {conversations.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
              Aucune conversation sauvegardée
            </div>
          ) : (
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  style={historyItem(conv.id === convIdRef.current)}
                  onClick={() => handleResumeConversation(conv)}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {conv.title}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, display: 'flex', gap: 6 }}>
                      <span>{conv.repoName}</span>
                      <span>·</span>
                      <span>{formatRelativeDate(conv.lastUsedAt)}</span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteConversation(conv.id); }}
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

      {/* Quick actions */}
      <div style={quickActionsBar}>
        <div style={quickActionsLabel}>Quick actions</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {QUICK_ACTIONS.map((qa) => (
            <button
              key={qa.command}
              onClick={() => void sendMessage(qa.command)}
              disabled={!!activeRunId}
              title={qa.description}
              style={quickActionButton(!!activeRunId)}
            >
              <Sparkles size={11} />
              {qa.label}
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div style={messagesArea}>
        {messages.length === 0 && (
          <div style={emptyState}>
            <Bot size={32} color="var(--line-strong)" style={{ marginBottom: 10 }} />
            <p style={{ margin: 0 }}>Lance un agent ou tape une commande</p>
            <p style={{ margin: '4px 0 0', fontSize: 11 }}>
              Ex.{' '}
              <code style={{ background: 'var(--bg-muted)', padding: '1px 4px', borderRadius: 2 }}>/tiq-agent-dev</code>
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} style={msg.role === 'user' ? userMsgWrapper : agentMsgWrapper}>

            {msg.role === 'user' ? (
              <div style={userMsgBubble}>{msg.content}</div>
            ) : (
              <div>
                {/* Agent header */}
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

                {/* Tool activity trace */}
                {msg.tools.length > 0 && (
                  <div style={toolTrace}>
                    {msg.tools.map((tool, i) => (
                      <div key={i} style={toolRow}>
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

                {/* Text content */}
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

      {/* Input bar */}
      <div style={inputBar}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message ou /tiq-agent-dev…"
          disabled={!!activeRunId}
          rows={1}
          style={textareaStyle(!!activeRunId)}
        />
        {activeRunId ? (
          <button onClick={handleStop} title="Stop" style={stopButton}>
            <Square size={14} />
          </button>
        ) : (
          <button
            onClick={() => void sendMessage(input)}
            disabled={!input.trim()}
            title="Send (Enter)"
            style={sendButton(!input.trim())}
          >
            <Send size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const headerStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10,
  padding: '10px 16px',
  borderBottom: '1px solid var(--line)',
  background: 'var(--bg-soft)',
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

// ─── History panel styles ─────────────────────────────────────────────────────

const historyOverlay: React.CSSProperties = {
  position: 'absolute', top: 41, left: 0, right: 0, bottom: 0,
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
