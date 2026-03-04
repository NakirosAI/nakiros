import { useEffect, useMemo, useState } from 'react';
import type {
  AgentProvider,
  LocalEpic,
  LocalTicket,
  ResolvedLanguage,
  StoredRepo,
  StoredWorkspace,
  TicketPriority,
  TicketStatus,
} from '@nakiros/shared';
import AgentPanel from './AgentPanel';

const STATUS_LABELS: Record<TicketStatus, string> = {
  backlog: 'Backlog',
  todo: 'A faire',
  in_progress: 'En cours',
  done: 'Termine',
};

const PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

type TicketHubTab = 'definition' | 'context' | 'execution' | 'artifacts';

interface Props {
  ticket: LocalTicket;
  allTickets: LocalTicket[];
  epics: LocalEpic[];
  repos: string[];
  storedRepos: StoredRepo[];
  workspaceId: string;
  workspace: StoredWorkspace;
  onUpdate(ticket: LocalTicket): void;
  onClose(): void;
  onContextCopy(): void;
  copying: boolean;
  defaultProvider: AgentProvider;
  language: ResolvedLanguage;
}

export default function TicketDetail({
  ticket,
  allTickets,
  epics,
  repos,
  storedRepos,
  workspaceId,
  workspace,
  onUpdate,
  onClose,
  onContextCopy,
  copying,
  defaultProvider,
  language,
}: Props) {
  const [t, setT] = useState(ticket);
  const [activeTab, setActiveTab] = useState<TicketHubTab>('definition');
  const [contextPreview, setContextPreview] = useState<string>('');
  const [contextLoading, setContextLoading] = useState(false);
  const [executionLaunchKey, setExecutionLaunchKey] = useState(0);
  const [executionMessage, setExecutionMessage] = useState<string | null>(null);
  const [executionRepoPath, setExecutionRepoPath] = useState<string>('');
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [executionRunning, setExecutionRunning] = useState(false);
  const isFr = language === 'fr';

  const repoMap = useMemo(
    () => new Map(storedRepos.map((repo) => [repo.name, repo])),
    [storedRepos],
  );
  const selectedRepoPath = executionRepoPath || repoMap.get(t.repoName ?? '')?.localPath || storedRepos[0]?.localPath || '';

  useEffect(() => setT(ticket), [ticket]);
  useEffect(() => {
    setExecutionRepoPath(repoMap.get(ticket.repoName ?? '')?.localPath ?? storedRepos[0]?.localPath ?? '');
  }, [ticket.id, ticket.repoName, storedRepos, repoMap]);
  useEffect(() => {
    function onKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeydown);
    return () => window.removeEventListener('keydown', onKeydown);
  }, [onClose]);

  useEffect(() => {
    if (activeTab !== 'context') return;
    setContextLoading(true);
    void window.nakiros
      .generateContext(workspaceId, t.id, workspace)
      .then(setContextPreview)
      .catch(() => setContextPreview(isFr ? 'Impossible de generer le contexte.' : 'Unable to generate context.'))
      .finally(() => setContextLoading(false));
  }, [activeTab, isFr, t.id, workspace, workspaceId]);

  async function save(updated: LocalTicket) {
    const next = { ...updated, updatedAt: new Date().toISOString() };
    setT(next);
    await window.nakiros.saveTicket(workspaceId, next);
    onUpdate(next);
  }

  function field<K extends keyof LocalTicket>(key: K, value: LocalTicket[K]) {
    void save({ ...t, [key]: value });
  }

  async function refreshContext() {
    setContextLoading(true);
    try {
      const generated = await window.nakiros.generateContext(
        workspaceId,
        t.id,
        workspace,
      );
      setContextPreview(generated);
    } catch {
      setContextPreview(isFr ? 'Impossible de generer le contexte.' : 'Unable to generate context.');
    } finally {
      setContextLoading(false);
    }
  }

  async function launchDevStory() {
    if (!selectedRepoPath) {
      setExecutionError(isFr ? 'Selectionne un repo cible avant de lancer le workflow.' : 'Select a target repository before running the workflow.');
      return;
    }
    setExecutionError(null);
    setExecutionRunning(true);
    const command = '/nak-workflow-dev-story';
    const nextMessage = [
      command,
      '',
      `Ticket: ${t.id}`,
      `Titre: ${t.title}`,
      `Priorite: ${t.priority}`,
      'Acceptance criteria:',
      ...(t.acceptanceCriteria.length > 0 ? t.acceptanceCriteria.map((criteria) => `- ${criteria || '(a completer)'}`) : ['- (a completer)']),
    ].join('\n');
    setExecutionMessage(nextMessage);
    setExecutionLaunchKey((prev) => prev + 1);
    await save({
      ...t,
      lastRunAt: new Date().toISOString(),
      lastRunStatus: 'running',
      lastRunProvider: defaultProvider,
      lastRunCommand: command,
    });
  }

  function handleExecutionDone() {
    setExecutionRunning(false);
    void save({
      ...t,
      lastRunStatus: 'success',
      lastRunAt: new Date().toISOString(),
      lastRunProvider: defaultProvider,
      lastRunCommand: t.lastRunCommand ?? '/nak-workflow-dev-story',
    });
  }

  const blockers = t.blockedBy
    .map((id) => allTickets.find((item) => item.id === id))
    .filter(Boolean) as LocalTicket[];
  const unblocks = allTickets.filter((item) => item.blockedBy.includes(t.id));
  const candidates = allTickets.filter((item) => item.id !== t.id && !t.blockedBy.includes(item.id));
  const targetRepo = storedRepos.find((repo) => repo.localPath === selectedRepoPath);

  return (
    <div
      style={{
        width: 560,
        borderLeft: '1px solid var(--line)',
        background: 'var(--bg-soft)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text-muted)' }}>{t.id}</span>
          <span style={{ fontSize: 15, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={headerBadge}>{STATUS_LABELS[t.status]}</span>
            <span style={headerBadge}>{PRIORITY_LABELS[t.priority]}</span>
          </div>
        </div>
        <button onClick={onClose} style={iconButton}>✕</button>
      </div>
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--line)', background: 'var(--bg-card)', padding: '0 10px' }}>
        <TabButton active={activeTab === 'definition'} onClick={() => setActiveTab('definition')} label="Definition" />
        <TabButton active={activeTab === 'context'} onClick={() => setActiveTab('context')} label="Context" />
        <TabButton active={activeTab === 'execution'} onClick={() => setActiveTab('execution')} label="Execution" />
        <TabButton active={activeTab === 'artifacts'} onClick={() => setActiveTab('artifacts')} label="Artifacts" />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {activeTab === 'definition' && (
          <>
            <textarea
              value={t.title}
              onChange={(event) => setT((prev) => ({ ...prev, title: event.target.value }))}
              onBlur={() => field('title', t.title)}
              style={titleInput}
            />
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Cree le {new Date(t.createdAt).toLocaleDateString(isFr ? 'fr-FR' : 'en-US')} · MAJ le {new Date(t.updatedAt).toLocaleDateString(isFr ? 'fr-FR' : 'en-US')}
            </div>
            <div style={sectionCard}>
              <label style={labelStyle}>Pilotage</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <select value={t.status} onChange={(event) => field('status', event.target.value as TicketStatus)} style={selectStyle}>
                {(Object.keys(STATUS_LABELS) as TicketStatus[]).map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
              <select value={t.priority} onChange={(event) => field('priority', event.target.value as TicketPriority)} style={selectStyle}>
                {(Object.keys(PRIORITY_LABELS) as TicketPriority[]).map((priority) => (
                  <option key={priority} value={priority}>
                    {PRIORITY_LABELS[priority]}
                  </option>
                ))}
              </select>
              {epics.length > 0 && (
                <select value={t.epicId ?? ''} onChange={(event) => field('epicId', event.target.value || undefined)} style={selectStyle}>
                  <option value="">Epic</option>
                  {epics.map((epic) => (
                    <option key={epic.id} value={epic.id}>
                      {epic.name}
                    </option>
                  ))}
                </select>
              )}
              {repos.length > 0 && (
                <select value={t.repoName ?? ''} onChange={(event) => field('repoName', event.target.value || undefined)} style={selectStyle}>
                  <option value="">Repo</option>
                  {repos.map((repo) => (
                    <option key={repo} value={repo}>
                      {repo}
                    </option>
                  ))}
                </select>
              )}
              </div>
            </div>
            <div style={sectionCard}>
              <label style={labelStyle}>Description</label>
              <textarea
                value={t.description ?? ''}
                onChange={(event) => setT((prev) => ({ ...prev, description: event.target.value }))}
                onBlur={() => field('description', t.description)}
                style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
              />
            </div>
            <div style={sectionCard}>
              <label style={labelStyle}>Acceptance Criteria</label>
              {t.acceptanceCriteria.map((criteria, index) => (
                <div key={index} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  <input
                    value={criteria}
                    onChange={(event) => {
                      const next = [...t.acceptanceCriteria];
                      next[index] = event.target.value;
                      setT((prev) => ({ ...prev, acceptanceCriteria: next }));
                    }}
                    onBlur={() => field('acceptanceCriteria', t.acceptanceCriteria)}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <button
                    onClick={() => {
                      const next = t.acceptanceCriteria.filter((_, itemIndex) => itemIndex !== index);
                      void save({ ...t, acceptanceCriteria: next });
                    }}
                    style={removeButton}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                onClick={() => setT((prev) => ({ ...prev, acceptanceCriteria: [...prev.acceptanceCriteria, ''] }))}
                style={linkButton}
              >
                + Critere
              </button>
            </div>
            <div style={sectionCard}>
              <label style={labelStyle}>Blocked By</label>
              {blockers.map((blocker) => (
                <div key={blocker.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={statusPill(blocker.status)}>{blocker.id}</span>
                  <span style={{ fontSize: 13, flex: 1 }}>{blocker.title}</span>
                  <button onClick={() => field('blockedBy', t.blockedBy.filter((id) => id !== blocker.id))} style={removeButton}>
                    ✕
                  </button>
                </div>
              ))}
              {candidates.length > 0 && (
                <select
                  value=""
                  onChange={(event) => {
                    if (event.target.value) field('blockedBy', [...t.blockedBy, event.target.value]);
                  }}
                  style={selectStyle}
                >
                  <option value="">+ Ajouter un bloquant...</option>
                  {candidates.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.id} - {candidate.title}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {unblocks.length > 0 && (
              <div style={sectionCard}>
                <label style={labelStyle}>Debloque</label>
                {unblocks.map((nextTicket) => (
                  <div key={nextTicket.id} style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>
                    {nextTicket.id} - {nextTicket.title}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'context' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => void refreshContext()} style={secondaryButton}>
                {contextLoading ? '...' : 'Rafraichir'}
              </button>
              <button onClick={onContextCopy} disabled={copying} style={secondaryButton}>
                {copying ? 'Copie...' : 'Copier le contexte'}
              </button>
            </div>
            <pre style={contextPreviewStyle}>
              {contextLoading ? (isFr ? 'Generation du contexte...' : 'Generating context...') : (contextPreview || (isFr ? 'Aucun contexte.' : 'No context.'))}
            </pre>
          </div>
        )}

        {activeTab === 'execution' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 460 }}>
            <div style={executionHeader}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={labelStyle}>Repo de travail</label>
                <select value={selectedRepoPath} onChange={(event) => setExecutionRepoPath(event.target.value)} style={selectStyle}>
                  {storedRepos.map((repo) => (
                    <option key={repo.localPath} value={repo.localPath}>
                      {repo.name}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 170 }}>
                <button onClick={() => void launchDevStory()} style={primaryButton} disabled={storedRepos.length === 0}>
                  Lancer dev-story
                </button>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {executionRunning ? 'Run en cours...' : `Dernier statut: ${t.lastRunStatus ?? 'idle'}`}
                </span>
              </div>
            </div>
            {executionError && <p style={{ margin: 0, color: 'var(--danger)', fontSize: 12 }}>{executionError}</p>}
            {executionMessage ? (
              <div style={{ flex: 1, border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden' }}>
                <AgentPanel
                  key={`${t.id}-${executionLaunchKey}`}
                  workspaceId={workspaceId}
                  repos={storedRepos}
                  workspacePath={workspace.workspacePath}
                  initialRepoPath={selectedRepoPath}
                  initialMessage={executionMessage}
                  hideRepoSelector
                  onDone={handleExecutionDone}
                />
              </div>
            ) : (
              <div style={emptyExecution}>
                Clique sur <strong>Lancer dev-story</strong> pour ouvrir l'execution ticket avec IA.
              </div>
            )}
          </div>
        )}

        {activeTab === 'artifacts' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={artifactBlock}>
              <h4 style={artifactTitle}>Repo cible</h4>
              {targetRepo ? (
                <>
                  <div style={artifactLine}><strong>Nom:</strong> {targetRepo.name}</div>
                  <div style={artifactLine}><strong>Path:</strong> <code>{targetRepo.localPath}</code></div>
                  {targetRepo.url && <div style={artifactLine}><strong>Remote:</strong> <code>{targetRepo.url}</code></div>}
                </>
              ) : (
                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13 }}>Aucun repo cible defini.</p>
              )}
            </div>
            <div style={artifactBlock}>
              <h4 style={artifactTitle}>Artifacts & Contexte</h4>
              <div style={artifactLine}><code>.nakiros/context/brainstorming.md</code></div>
              <div style={artifactLine}><code>.nakiros/context/tickets/{t.id}.md</code></div>
              <div style={artifactLine}><code>.nakiros/context/dev-notes/{t.id}.md</code></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick(): void; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        borderRadius: '10px 10px 0 0',
        border: 'none',
        borderBottom: active ? '2px solid var(--primary)' : '2px solid transparent',
        background: 'transparent',
        color: active ? 'var(--primary)' : 'var(--text-muted)',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        padding: '11px 10px 9px',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}

const titleInput: React.CSSProperties = {
  fontSize: 17,
  fontWeight: 600,
  border: '1px solid var(--line)',
  borderRadius: 10,
  padding: '8px 10px',
  resize: 'none',
  width: '100%',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
  lineHeight: 1.4,
  minHeight: 58,
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 10,
  fontWeight: 600,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 11px',
  border: '1px solid var(--line)',
  borderRadius: 10,
  fontSize: 13,
  color: 'var(--text)',
  background: 'var(--bg-soft)',
  boxSizing: 'border-box',
};

const selectStyle: React.CSSProperties = {
  padding: '7px 9px',
  border: '1px solid var(--line)',
  borderRadius: 10,
  fontSize: 12,
  color: 'var(--text)',
  background: 'var(--bg-soft)',
  cursor: 'pointer',
};

const iconButton: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  fontSize: 16,
};

const secondaryButton: React.CSSProperties = {
  border: '1px solid var(--line)',
  background: 'var(--bg-soft)',
  color: 'var(--text)',
  borderRadius: 10,
  padding: '7px 11px',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
};

const primaryButton: React.CSSProperties = {
  border: 'none',
  background: 'var(--primary)',
  color: '#fff',
  borderRadius: 10,
  padding: '9px 12px',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
};

const removeButton: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  color: '#ef4444',
  fontSize: 14,
};

const linkButton: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--primary)',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: 0,
};

const contextPreviewStyle: React.CSSProperties = {
  margin: 0,
  border: '1px solid var(--line)',
  background: 'var(--bg-card)',
  borderRadius: 10,
  padding: 12,
  whiteSpace: 'pre-wrap',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 12,
  lineHeight: 1.5,
  maxHeight: 460,
  overflowY: 'auto',
};

const executionHeader: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  justifyContent: 'space-between',
  alignItems: 'flex-end',
  flexWrap: 'wrap',
  border: '1px solid var(--line)',
  borderRadius: 10,
  padding: 12,
  background: 'var(--bg-card)',
};

const emptyExecution: React.CSSProperties = {
  border: '1px dashed var(--line-strong)',
  borderRadius: 10,
  padding: 16,
  color: 'var(--text-muted)',
  fontSize: 13,
  lineHeight: 1.5,
};

const artifactBlock: React.CSSProperties = {
  border: '1px solid var(--line)',
  borderRadius: 10,
  background: 'var(--bg-card)',
  padding: 13,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const artifactTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: '0.02em',
};

const artifactLine: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--text)',
  lineHeight: 1.45,
};

const sectionCard: React.CSSProperties = {
  border: '1px solid var(--line)',
  borderRadius: 10,
  background: 'var(--bg-card)',
  padding: 11,
};

const headerBadge: React.CSSProperties = {
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
  fontWeight: 700,
  borderRadius: 10,
  border: '1px solid var(--line)',
  background: 'var(--bg-card)',
  color: 'var(--text-muted)',
  padding: '2px 6px',
};

function statusPill(status: TicketStatus): React.CSSProperties {
  return {
    fontSize: 11,
    padding: '2px 6px',
    borderRadius: 10,
    background: status === 'done' ? '#d1fae5' : '#fef3c7',
    color: status === 'done' ? '#065f46' : '#92400e',
  };
}
