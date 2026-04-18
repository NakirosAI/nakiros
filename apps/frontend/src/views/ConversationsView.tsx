import { useEffect, useState } from 'react';
import { ArrowLeft, MessageSquare } from 'lucide-react';
import type { Project, ProjectConversation, ConversationMessage } from '@nakiros/shared';

interface Props {
  project: Project;
}

export default function ConversationsView({ project }: Props) {
  const [conversations, setConversations] = useState<ProjectConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  useEffect(() => {
    setLoading(true);
    window.nakiros.listProjectConversations(project.id).then((convs) => {
      setConversations(convs);
      setLoading(false);
    });
  }, [project.id]);

  function openConversation(sessionId: string) {
    setSelectedSession(sessionId);
    setLoadingMessages(true);
    window.nakiros.getProjectConversationMessages(project.id, sessionId).then((msgs) => {
      setMessages(msgs);
      setLoadingMessages(false);
    });
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-[var(--text-muted)]">
        Loading conversations...
      </div>
    );
  }

  // Conversation detail
  if (selectedSession) {
    const conv = conversations.find((c) => c.sessionId === selectedSession);
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-3">
          <button
            onClick={() => setSelectedSession(null)}
            className="rounded p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-muted)] hover:text-[var(--text-primary)]"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <div className="text-sm font-medium text-[var(--text-primary)]">
              {conv?.summary ?? selectedSession}
            </div>
            {conv && (
              <div className="flex gap-3 text-xs text-[var(--text-muted)]">
                <span>{conv.messageCount} messages</span>
                <span>{new Date(conv.startedAt).toLocaleString()}</span>
                {conv.gitBranch && <span>{conv.gitBranch}</span>}
              </div>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loadingMessages ? (
            <div className="text-center text-[var(--text-muted)]">Loading messages...</div>
          ) : (
            <div className="flex flex-col gap-3">
              {messages.map((msg) => (
                <div
                  key={msg.uuid}
                  className={`rounded-lg px-4 py-3 ${
                    msg.type === 'user'
                      ? 'ml-8 bg-[var(--primary-soft)] text-[var(--text-primary)]'
                      : msg.type === 'assistant'
                        ? 'mr-8 border border-[var(--line)] bg-[var(--bg-card)]'
                        : 'mx-8 bg-[var(--bg-muted)] text-xs text-[var(--text-muted)]'
                  }`}
                >
                  <div className="mb-1 flex items-center gap-2 text-xs text-[var(--text-muted)]">
                    <span className="font-semibold capitalize">{msg.type}</span>
                    <span>{new Date(msg.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <div className="whitespace-pre-wrap text-sm">
                    {msg.content.slice(0, 2000)}
                    {msg.content.length > 2000 && '...'}
                  </div>
                  {msg.toolUse && msg.toolUse.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {msg.toolUse.map((tool, i) => (
                        <span
                          key={i}
                          className="rounded bg-[var(--bg-muted)] px-2 py-0.5 text-[10px] text-[var(--text-muted)]"
                        >
                          {tool.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Conversation list
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <h2 className="mb-4 text-lg font-bold text-[var(--text-primary)]">
        Conversations ({conversations.length})
      </h2>
      {conversations.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-[var(--line-strong)] px-4 py-3.5 text-[13px] text-[var(--text-muted)]">
          No conversations found for this project.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {conversations.map((conv) => (
            <button
              key={conv.sessionId}
              onClick={() => openConversation(conv.sessionId)}
              className="flex w-full items-start gap-3 rounded-lg border border-[var(--line)] bg-[var(--bg-card)] px-4 py-3 text-left transition-colors hover:border-[var(--primary)]"
            >
              <MessageSquare size={16} className="mt-0.5 shrink-0 text-[var(--text-muted)]" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-[var(--text-primary)]">
                  {conv.summary}
                </div>
                <div className="mt-1 flex flex-wrap gap-3 text-xs text-[var(--text-muted)]">
                  <span>{conv.messageCount} messages</span>
                  <span>{new Date(conv.lastMessageAt).toLocaleDateString()}</span>
                  {conv.gitBranch && <span>{conv.gitBranch}</span>}
                  {conv.toolsUsed.length > 0 && (
                    <span>{conv.toolsUsed.length} tools used</span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
