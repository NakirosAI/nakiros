import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { BookOpen } from 'lucide-react';
import type { ResolvedLanguage, StoredWorkspace } from '@tiqora/shared';
import AgentPanel from './AgentPanel';
import PrdAssistant from './PrdAssistant';
import { WORKFLOW_CAPABILITIES } from '../utils/workflow-capabilities';

type AgentType = 'brainstorming' | 'architect' | 'pm' | 'chat';

interface ActiveAgent {
  type: AgentType;
  message: string;
  key: number;
}

interface Props {
  workspace: StoredWorkspace;
  language: ResolvedLanguage;
  onDocumentsChanged?(docsCount: number): void;
  openPrdAssistantSignal?: number;
  openFreeChatSignal?: number;
}

function buildAgentMessage(type: AgentType): string {
  switch (type) {
    case 'architect':
      return '/tiq-workflow-generate-context';
    case 'brainstorming':
      return '/tiq-agent-brainstorming';
    case 'pm':
      return '/tiq-workflow-fetch-project-context';
    case 'chat':
      return '';
  }
}

export default function ContextPanel({
  workspace,
  language,
  onDocumentsChanged,
  openPrdAssistantSignal,
  openFreeChatSignal,
}: Props) {
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<ScannedDoc | null>(null);
  const [docContent, setDocContent] = useState<string | null>(null);
  const [activeAgent, setActiveAgent] = useState<ActiveAgent | null>(null);
  const [primaryRepoPath, setPrimaryRepoPath] = useState<string | null>(null);
  const [showPrdAssistant, setShowPrdAssistant] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [lastScanDurationMs, setLastScanDurationMs] = useState<number | null>(null);
  const [lastScanDocsCount, setLastScanDocsCount] = useState<number | null>(null);
  const [scanStartedAt, setScanStartedAt] = useState<number | null>(null);
  const [scanElapsedMs, setScanElapsedMs] = useState(0);
  const [lastScanAt, setLastScanAt] = useState<number | null>(null);
  const scanningRef = useRef(false);

  const isFr = language === 'fr';
  const hasRepos = workspace.repos.length > 0;
  const pmWorkflow = useMemo(
    () => WORKFLOW_CAPABILITIES.find((capability) => capability.id === 'fetch-project-context'),
    [],
  );

  function pushToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2800);
  }

  useEffect(() => {
    if (!scanStartedAt || !scanning) return;
    const timer = window.setInterval(() => {
      setScanElapsedMs(Date.now() - scanStartedAt);
    }, 250);
    return () => window.clearInterval(timer);
  }, [scanStartedAt, scanning]);

  function scan() {
    if (scanningRef.current) return;
    scanningRef.current = true;
    setScanning(true);
    const startedAt = Date.now();
    setScanStartedAt(startedAt);
    setScanElapsedMs(0);
    void window.tiqora
      .scanDocs(workspace)
      .then((result) => {
        setScanResult(result);
        const docsCount = result.repos.reduce((sum, repo) => sum + repo.docs.length, 0);
        setLastScanDocsCount(docsCount);
        setLastScanDurationMs(Date.now() - startedAt);
        setLastScanAt(Date.now());
        onDocumentsChanged?.(docsCount);
      })
      .catch(() => {
        setScanResult(null);
        setLastScanDocsCount(0);
        setLastScanDurationMs(Date.now() - startedAt);
        setLastScanAt(Date.now());
        onDocumentsChanged?.(0);
      })
      .finally(() => {
        scanningRef.current = false;
        setScanning(false);
        setScanStartedAt(null);
      });
  }

  useEffect(() => {
    setActiveAgent(null);
    setSelectedDoc(null);
    setDocContent(null);
    scan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.id]);

  useEffect(() => {
    if (!selectedDoc) {
      setDocContent(null);
      return;
    }
    void window.tiqora
      .readDoc(selectedDoc.absolutePath)
      .then(setDocContent)
      .catch(() => setDocContent(isFr ? '_Impossible de lire ce fichier._' : '_Unable to read this file._'));
  }, [selectedDoc?.absolutePath, isFr]);

  useEffect(() => {
    if (!openPrdAssistantSignal) return;
    setShowPrdAssistant(true);
  }, [openPrdAssistantSignal]);

  useEffect(() => {
    if (!openFreeChatSignal) return;
    if (!hasRepos) return;
    void launchAgent('chat');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openFreeChatSignal, hasRepos]);

  async function launchAgent(type: AgentType, message?: string) {
    setSelectedDoc(null);
    setDocContent(null);
    const cwd = await window.tiqora.syncWorkspaceYaml(workspace);
    setPrimaryRepoPath(cwd);
    setActiveAgent({ type, message: message ?? buildAgentMessage(type), key: Date.now() });
  }

  function handleAgentDone() {
    if (activeAgent?.type && activeAgent.type !== 'chat') {
      scan();
    }
    if (activeAgent?.type === 'brainstorming') {
      pushToast(
        isFr
          ? 'Session brainstorming terminée. Vérifie .tiqora/context/brainstorming.md.'
          : 'Brainstorming session completed. Check .tiqora/context/brainstorming.md.',
      );
    }
  }

  return (
    <div style={{ display: 'flex', flex: 1, width: '100%', minWidth: 0, height: '100%', overflow: 'hidden' }}>
      <div
        style={{
          width: 320,
          borderRight: '1px solid var(--line)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px 0', flexShrink: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {isFr ? 'Documents' : 'Documents'}
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              {scanning
                ? `${isFr ? 'Synchronisation en cours' : 'Sync in progress'} · ${Math.max(1, Math.floor(scanElapsedMs / 1000))}s`
                : lastScanDurationMs != null
                  ? `${isFr ? 'Dernier scan' : 'Last scan'}: ${lastScanDocsCount ?? 0} docs · ${lastScanDurationMs}ms${lastScanAt ? ` · ${new Date(lastScanAt).toLocaleTimeString(isFr ? 'fr-FR' : 'en-US', { hour: '2-digit', minute: '2-digit' })}` : ''}`
                  : (isFr ? 'Scan non effectué' : 'No scan yet')}
            </span>
          </div>
          <button
            onClick={scan}
            disabled={scanning}
            title={scanning ? (isFr ? 'Synchronisation…' : 'Syncing…') : (isFr ? 'Rafraîchir' : 'Refresh')}
            style={{
              border: 'none',
              background: 'transparent',
              cursor: scanning ? 'default' : 'pointer',
              color: 'var(--text-muted)',
              fontSize: 14,
              lineHeight: 1,
              padding: '2px 4px',
              opacity: scanning ? 0.5 : 1,
            }}
          >
            {scanning ? '⟳' : '↺'}
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
          {scanning && !scanResult ? (
            <p style={{ padding: '8px 14px', fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
              {isFr ? 'Synchronisation…' : 'Syncing…'}
            </p>
          ) : !scanResult || scanResult.repos.length === 0 ? (
            <p style={{ padding: '8px 14px', fontSize: 12, color: 'var(--text-muted)' }}>
              {hasRepos
                ? (isFr ? 'Aucun document trouvé' : 'No documents found')
                : (isFr ? 'Aucun repo configuré' : 'No repository configured')}
            </p>
          ) : (
            scanResult.repos.map((repo) => (
              <div key={repo.repoPath}>
                <div
                  style={{
                    padding: '6px 14px 2px',
                    fontSize: 10,
                    fontWeight: 700,
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  {repo.repoName}
                </div>
                {repo.docs.map((doc) => (
                  <button
                    key={doc.absolutePath}
                    onClick={() => {
                      setActiveAgent(null);
                      setSelectedDoc(doc);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      width: '100%',
                      textAlign: 'left',
                      padding: '4px 14px',
                      background: selectedDoc?.absolutePath === doc.absolutePath ? 'var(--bg-muted)' : 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--text)',
                      fontSize: 12,
                    }}
                  >
                    <span style={{ fontSize: 11, flexShrink: 0 }}>{doc.isGenerated ? '🤖' : '📄'}</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>

        <div style={{ borderTop: '1px solid var(--line)', padding: '10px 12px', flexShrink: 0 }}>
          <p
            style={{
              margin: '0 0 8px',
              fontSize: 10,
              fontWeight: 700,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            {isFr ? 'Actions IA' : 'AI actions'}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <ActionButton
              label={isFr ? 'PRD Assistant' : 'PRD Assistant'}
              description="/tiq-agent-brainstorming"
              recommended
              onClick={() => setShowPrdAssistant(true)}
            />
            {hasRepos && (
              <ActionButton
                label={isFr ? 'Générer le contexte' : 'Generate context'}
                description="/tiq-workflow-generate-context"
                onClick={() => void launchAgent('architect')}
              />
            )}
            <ActionButton
              label={isFr ? 'Contexte PM' : 'PM context'}
              description="/tiq-workflow-fetch-project-context"
              badge={pmWorkflow?.status === 'beta' ? 'Beta' : undefined}
              onClick={() => void launchAgent('pm')}
            />
            {hasRepos && (
              <ActionButton
                label={isFr ? 'Discussion libre' : 'Open chat'}
                description={isFr ? 'Chat agent sans workflow impose' : 'Agent chat without predefined workflow'}
                onClick={() => void launchAgent('chat')}
              />
            )}
            {pmWorkflow?.status === 'beta' && (
              <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
                {pmWorkflow.fallbackMessage}
              </p>
            )}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {activeAgent ? (
          <div style={{ flex: 1, minWidth: 0, width: '100%', overflow: 'hidden' }}>
            <AgentPanel
              key={activeAgent.key}
              workspaceId={workspace.id}
              repos={workspace.repos}
              initialRepoPath={primaryRepoPath ?? scanResult?.primaryRepoPath}
              initialMessage={activeAgent.message || undefined}
              hideRepoSelector={activeAgent.type !== 'chat'}
              onDone={handleAgentDone}
            />
          </div>
        ) : selectedDoc && docContent !== null ? (
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }} className="agent-md">
            <p style={{ margin: '0 0 16px', fontSize: 11, color: 'var(--text-muted)' }}>{selectedDoc.relativePath}</p>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{docContent}</ReactMarkdown>
          </div>
        ) : scanning && !scanResult ? (
          <EmptyPanel
            icon={<BookOpen size={32} color="var(--text-muted)" strokeWidth={1.5} />}
            title={isFr ? 'Synchronisation du contexte du projet…' : 'Syncing project context…'}
            subtitle={isFr ? 'Analyse des dépôts en cours' : 'Scanning repositories'}
          />
        ) : (
          <EmptyPanel
            icon={<BookOpen size={32} color="var(--text-muted)" strokeWidth={1.5} />}
            title={isFr ? 'Sélectionne un document ou lance un agent' : 'Select a document or launch an agent'}
          />
        )}
      </div>
      {showPrdAssistant && (
        <PrdAssistant
          language={language}
          onClose={() => setShowPrdAssistant(false)}
          onSubmit={(message) => launchAgent('brainstorming', message)}
        />
      )}
      {toast && (
        <div
          style={{
            position: 'fixed',
            right: 16,
            bottom: 14,
            background: '#0f172a',
            color: '#fff',
            borderRadius: 2,
            padding: '9px 12px',
            fontSize: 12,
            boxShadow: 'var(--shadow-lg)',
            zIndex: 1200,
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

function ActionButton({
  label,
  description,
  onClick,
  recommended,
  badge,
}: {
  label: string;
  description: string;
  onClick(): void;
  recommended?: boolean;
  badge?: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        textAlign: 'left',
        padding: '7px 8px',
        background: recommended ? 'var(--primary-soft)' : 'var(--bg-soft)',
        border: `1px solid ${recommended ? 'var(--primary)' : 'var(--line)'}`,
        borderRadius: 2,
        cursor: 'pointer',
        width: '100%',
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 700, color: recommended ? 'var(--primary)' : 'var(--text)' }}>
        {label}
        {badge && (
          <span
            style={{
              marginLeft: 6,
              fontSize: 10,
              fontWeight: 700,
              color: '#92400e',
              background: '#fef3c7',
              border: '1px solid #f59e0b',
              borderRadius: 2,
              padding: '1px 4px',
              verticalAlign: 'middle',
            }}
          >
            {badge}
          </span>
        )}
      </span>
      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{description}</span>
    </button>
  );
}

function EmptyPanel({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 10,
        color: 'var(--text-muted)',
      }}
    >
      {icon}
      <span style={{ fontSize: 13 }}>{title}</span>
      {subtitle && <span style={{ fontSize: 11 }}>{subtitle}</span>}
    </div>
  );
}
