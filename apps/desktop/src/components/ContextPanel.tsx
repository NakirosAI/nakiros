import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { BookOpen } from 'lucide-react';
import type { StoredWorkspace } from '@tiqora/shared';
import AgentPanel from './AgentPanel';

type AgentType = 'brainstorming' | 'architect' | 'pm';

interface ActiveAgent {
  type: AgentType;
  message: string;
  key: number;
}

interface Props {
  workspace: StoredWorkspace;
}

// Slash commands installés dans .claude/commands/ par agent-installer —
// même source de vérité que le CLI. Claude Code les expand nativement.
// Le nom de commande = nom du fichier sans .md (tirets, pas deux-points).
function buildAgentMessage(type: AgentType): string {
  switch (type) {
    case 'architect':    return '/tiq-workflow-generate-context';
    case 'brainstorming': return '/tiq-agent-brainstorming';
    case 'pm':           return '/tiq-workflow-fetch-project-context';
  }
}

export default function ContextPanel({ workspace }: Props) {
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<ScannedDoc | null>(null);
  const [docContent, setDocContent] = useState<string | null>(null);
  const [activeAgent, setActiveAgent] = useState<ActiveAgent | null>(null);
  const [primaryRepoPath, setPrimaryRepoPath] = useState<string | null>(null);

  const hasRepos = workspace.repos.length > 0;

  function scan() {
    setScanning(true);
    void window.tiqora
      .scanDocs(workspace)
      .then((result) => {
        setScanResult(result);
      })
      .catch(() => {
        setScanResult(null);
      })
      .finally(() => {
        setScanning(false);
      });
  }

  useEffect(() => {
    // Workspace changé → reset complet + re-scan
    setActiveAgent(null);
    setSelectedDoc(null);
    setDocContent(null);
    scan();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.id]);

  useEffect(() => {
    if (!selectedDoc) { setDocContent(null); return; }
    void window.tiqora.readDoc(selectedDoc.absolutePath).then(setDocContent).catch(() => setDocContent('_Impossible de lire ce fichier._'));
  }, [selectedDoc?.absolutePath]);

  async function launchAgent(type: AgentType) {
    setSelectedDoc(null);
    setDocContent(null);
    const cwd = await window.tiqora.syncWorkspaceYaml(workspace);
    setPrimaryRepoPath(cwd);
    setActiveAgent({ type, message: buildAgentMessage(type), key: Date.now() });
  }

  function handleAgentDone() {
    scan(); // re-scan to pick up generated docs
  }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* ── Left: doc list + agent launcher ── */}
      <div style={{ width: 260, borderRight: '1px solid var(--line)', display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>

        {/* Doc list header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px 0', flexShrink: 0 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Documents
          </span>
          <button
            onClick={scan}
            disabled={scanning}
            title={scanning ? 'Synchronisation…' : 'Rafraîchir'}
            style={{ border: 'none', background: 'transparent', cursor: scanning ? 'default' : 'pointer', color: 'var(--text-muted)', fontSize: 14, lineHeight: 1, padding: '2px 4px', opacity: scanning ? 0.5 : 1 }}
          >
            {scanning ? '⟳' : '↺'}
          </button>
        </div>

        {/* Doc list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          {scanning && !scanResult ? (
            <p style={{ padding: '8px 14px', fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
              Synchronisation…
            </p>
          ) : !scanResult || scanResult.repos.length === 0 ? (
            <p style={{ padding: '8px 14px', fontSize: 12, color: 'var(--text-muted)' }}>
              {hasRepos ? 'Aucun document trouvé' : 'Aucun repo configuré'}
            </p>
          ) : (
            scanResult.repos.map((repo) => (
              <div key={repo.repoPath}>
                <div style={{
                  padding: '6px 14px 2px',
                  fontSize: 10,
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}>
                  {repo.repoName}
                </div>
                {repo.docs.map((doc) => (
                  <button
                    key={doc.absolutePath}
                    onClick={() => { setActiveAgent(null); setSelectedDoc(doc); }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      width: '100%',
                      textAlign: 'left',
                      padding: '4px 14px',
                      background: selectedDoc?.absolutePath === doc.absolutePath
                        ? 'var(--bg-muted)'
                        : 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--text)',
                      fontSize: 12,
                    }}
                  >
                    <span style={{ fontSize: 11, flexShrink: 0 }}>{doc.isGenerated ? '🤖' : '📄'}</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {doc.name}
                    </span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>

        {/* Agent launcher */}
        <div style={{ borderTop: '1px solid var(--line)', padding: '10px 12px', flexShrink: 0 }}>
          <p style={{
            margin: '0 0 6px',
            fontSize: 10,
            fontWeight: 700,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}>
            Lancer un agent
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {hasRepos && (
              <AgentButton
                label="🏗 Générer le contexte"
                description="/tiq-workflow-generate-context"
                recommended
                onClick={() => launchAgent('architect')}
              />
            )}
            <AgentButton
              label="🧠 Brainstorming"
              description="/tiq-agent-brainstorming"
              onClick={() => launchAgent('brainstorming')}
            />
            {hasRepos && (
              <AgentButton
                label="📋 Contexte PM"
                description="/tiq-workflow-fetch-project-context"
                onClick={() => launchAgent('pm')}
              />
            )}
          </div>
        </div>
      </div>

      {/* ── Right: viewer or agent chat ── */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {activeAgent ? (
          <AgentPanel
            key={activeAgent.key}
            workspaceId={workspace.id}
            repos={workspace.repos}
            initialRepoPath={primaryRepoPath ?? scanResult?.primaryRepoPath}
            initialMessage={activeAgent.message}
            hideRepoSelector
            onDone={handleAgentDone}
          />
        ) : selectedDoc && docContent !== null ? (
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }} className="agent-md">
            <p style={{ margin: '0 0 16px', fontSize: 11, color: 'var(--text-muted)' }}>
              {selectedDoc.relativePath}
            </p>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{docContent}</ReactMarkdown>
          </div>
        ) : scanning && !scanResult ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            gap: 10,
            color: 'var(--text-muted)',
          }}>
            <BookOpen size={32} color="var(--text-muted)" strokeWidth={1.5} />
            <span style={{ fontSize: 13 }}>Synchronisation du contexte du projet…</span>
            <span style={{ fontSize: 11 }}>Analyse des dépôts en cours</span>
          </div>
        ) : (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            gap: 10,
            color: 'var(--text-muted)',
          }}>
            <BookOpen size={32} color="var(--text-muted)" strokeWidth={1.5} />
            <span style={{ fontSize: 13 }}>
              Sélectionne un document ou lance un agent
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function AgentButton({
  label,
  description,
  recommended,
  onClick,
}: {
  label: string;
  description: string;
  recommended?: boolean;
  onClick(): void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        textAlign: 'left',
        padding: '6px 8px',
        background: recommended ? 'var(--primary-soft)' : 'var(--bg-soft)',
        border: `1px solid ${recommended ? 'var(--primary)' : 'var(--line)'}`,
        borderRadius: 2,
        cursor: 'pointer',
        width: '100%',
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 700, color: recommended ? 'var(--primary)' : 'var(--text)' }}>
        {label}{recommended ? ' ★' : ''}
      </span>
      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{description}</span>
    </button>
  );
}
