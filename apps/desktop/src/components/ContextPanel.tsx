import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { BookOpen } from 'lucide-react';
import type { ResolvedLanguage, StoredWorkspace } from '@nakiros/shared';
import PrdAssistant from './PrdAssistant';
import { WORKFLOW_CAPABILITIES } from '../utils/workflow-capabilities';

interface Props {
  workspace: StoredWorkspace;
  language: ResolvedLanguage;
  onDocumentsChanged?(docsCount: number): void;
  openPrdAssistantSignal?: number;
  onOpenChat?(): void;
}

// Names (without .md ext) expected in each repo's _nakiros/ subfolder
const NAKIROS_EXPECTED_NAMES = ['architecture', 'conventions', 'llms.txt'];

export default function ContextPanel({
  workspace,
  language,
  onDocumentsChanged,
  openPrdAssistantSignal,
  onOpenChat,
}: Props) {
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<ScannedDoc | null>(null);
  const [docContent, setDocContent] = useState<string | null>(null);
  const [showPrdAssistant, setShowPrdAssistant] = useState(false);
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
    void window.nakiros
      .scanDocs(workspace)
      .then((result) => {
        setScanResult(result);
        const repoDocsCount = result.repos.reduce((sum, repo) => sum + repo.docs.length, 0);
        const globalDocsCount = result.globalSection?.docs.length ?? 0;
        const docsCount = repoDocsCount + globalDocsCount;
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
    void window.nakiros
      .readDoc(selectedDoc.absolutePath)
      .then(setDocContent)
      .catch(() => setDocContent(isFr ? '_Impossible de lire ce fichier._' : '_Unable to read this file._'));
  }, [selectedDoc?.absolutePath, isFr]);

  useEffect(() => {
    if (!openPrdAssistantSignal) return;
    setShowPrdAssistant(true);
  }, [openPrdAssistantSignal]);

  return (
    <div style={{ display: 'flex', flex: 1, width: '100%', minWidth: 0, height: '100%', overflow: 'hidden' }}>
      {/* ── Left panel ── */}
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
        {/* Header */}
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

        {/* Document list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
          {scanning && !scanResult ? (
            <p style={{ padding: '8px 14px', fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
              {isFr ? 'Synchronisation…' : 'Syncing…'}
            </p>
          ) : !scanResult ? (
            <p style={{ padding: '8px 14px', fontSize: 12, color: 'var(--text-muted)' }}>
              {hasRepos
                ? (isFr ? 'Aucun document trouvé' : 'No documents found')
                : (isFr ? 'Aucun repo configuré' : 'No repository configured')}
            </p>
          ) : (
            <>
              {/* ── GLOBAL SECTION ── */}
              <SectionHeader label="GLOBAL" />
              {scanResult.globalSection.docs.length === 0 && scanResult.globalSection.missingNames.length === 0 ? (
                <EmptyGlobalSection isFr={isFr} onGenerate={() => onOpenChat?.()} />
              ) : (
                <>
                  {scanResult.globalSection.docs.map((doc) => (
                    <DocRow
                      key={doc.absolutePath}
                      doc={doc}
                      isSelected={selectedDoc?.absolutePath === doc.absolutePath}
                      isFr={isFr}
                      onSelect={() => setSelectedDoc(doc)}
                      onRegenerate={() => onOpenChat?.()}
                    />
                  ))}
                  {scanResult.globalSection.missingNames.map((name) => (
                    <MissingDocRow
                      key={name}
                      name={name}
                      isFr={isFr}
                      onGenerate={() => onOpenChat?.()}
                    />
                  ))}
                </>
              )}

              {/* ── PER-REPO SECTIONS ── */}
              {scanResult.repos.map((repo) => {
                const rootDocs = repo.docs.filter((d) => !d.relativePath.startsWith('_nakiros/'));
                const nakirosDocs = repo.docs.filter((d) => d.relativePath.startsWith('_nakiros/'));
                const nakirosDocNames = new Set(nakirosDocs.map((d) => d.name));
                const missingNakiros = NAKIROS_EXPECTED_NAMES.filter((n) => !nakirosDocNames.has(n));

                return (
                  <div key={repo.repoPath}>
                    <SectionHeader label={repo.repoName.toUpperCase()} />

                    {rootDocs.map((doc) => (
                      <DocRow
                        key={doc.absolutePath}
                        doc={doc}
                        isSelected={selectedDoc?.absolutePath === doc.absolutePath}
                        isFr={isFr}
                        onSelect={() => setSelectedDoc(doc)}
                      />
                    ))}

                    {(nakirosDocs.length > 0 || missingNakiros.length > 0) && (
                      <div>
                        <div
                          style={{
                            padding: '5px 14px 2px 24px',
                            fontSize: 10,
                            color: 'var(--text-muted)',
                            fontFamily: 'monospace',
                          }}
                        >
                          _nakiros/
                        </div>
                        {nakirosDocs.map((doc) => (
                          <DocRow
                            key={doc.absolutePath}
                            doc={doc}
                            isSelected={selectedDoc?.absolutePath === doc.absolutePath}
                            isFr={isFr}
                            onSelect={() => setSelectedDoc(doc)}
                            onRegenerate={() => onOpenChat?.()}
                            indent
                          />
                        ))}
                        {missingNakiros.map((name) => (
                          <MissingDocRow
                            key={name}
                            name={name}
                            isFr={isFr}
                            onGenerate={() => onOpenChat?.()}
                            indent
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* AI Actions */}
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
              description="/nak-agent-brainstorming"
              recommended
              onClick={() => setShowPrdAssistant(true)}
            />
            <ActionButton
              label={isFr ? 'Générer le contexte' : 'Generate context'}
              description="/nak-workflow-generate-context"
              onClick={() => onOpenChat?.()}
            />
            <ActionButton
              label={isFr ? 'Contexte PM' : 'PM context'}
              description="/nak-workflow-fetch-project-context"
              badge={pmWorkflow?.status === 'beta' ? 'Beta' : undefined}
              onClick={() => onOpenChat?.()}
            />
            <ActionButton
              label={isFr ? 'Discussion libre' : 'Open chat'}
              description={isFr ? 'Chat agent sans workflow imposé' : 'Agent chat without predefined workflow'}
              onClick={() => onOpenChat?.()}
            />
            {pmWorkflow?.status === 'beta' && (
              <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
                {pmWorkflow.fallbackMessage}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Right panel (viewer) ── */}
      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {selectedDoc && docContent !== null ? (
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }} className="agent-md">
            <p style={{ margin: '0 0 8px', fontSize: 11, color: 'var(--text-muted)' }}>{selectedDoc.relativePath}</p>
            {selectedDoc.isGenerated && (
              <FreshnessBanner doc={selectedDoc} isFr={isFr} onRegenerate={() => onOpenChat?.()} />
            )}
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
          onSubmit={async () => { setShowPrdAssistant(false); onOpenChat?.(); }}
        />
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getDaysAgo(lastModifiedAt?: number): number | null {
  if (!lastModifiedAt) return null;
  return Math.floor((Date.now() - lastModifiedAt) / (1000 * 60 * 60 * 24));
}

function freshnessColor(days: number): string {
  if (days < 3) return 'var(--text-muted)';
  if (days < 7) return '#f59e0b';
  return '#ef4444';
}

function freshnessLabel(days: number, isGenerated: boolean, isFr: boolean): string {
  const verb = isGenerated
    ? (isFr ? 'Généré' : 'Generated')
    : (isFr ? 'Modifié' : 'Modified');
  if (days === 0) return isFr ? `${verb} aujourd'hui` : `${verb} today`;
  if (days === 1) return isFr ? `${verb} il y a 1 jour` : `${verb} 1 day ago`;
  return isFr ? `${verb} il y a ${days} jours` : `${verb} ${days} days ago`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <div
      style={{
        padding: '8px 14px 2px',
        fontSize: 10,
        fontWeight: 700,
        color: 'var(--text-muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
      }}
    >
      {label}
    </div>
  );
}

function DocRow({
  doc,
  isSelected,
  isFr,
  onSelect,
  onRegenerate,
  indent,
}: {
  doc: ScannedDoc;
  isSelected: boolean;
  isFr: boolean;
  onSelect(): void;
  onRegenerate?(): void;
  indent?: boolean;
}) {
  const days = getDaysAgo(doc.lastModifiedAt);
  const label = days !== null ? freshnessLabel(days, doc.isGenerated, isFr) : null;
  const color = days !== null ? freshnessColor(days) : 'var(--text-muted)';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: indent ? '3px 8px 3px 28px' : '3px 8px 3px 14px',
        background: isSelected ? 'var(--bg-muted)' : 'transparent',
      }}
    >
      <button
        onClick={onSelect}
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 1,
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text)',
          textAlign: 'left',
          padding: '1px 0',
          minWidth: 0,
        }}
      >
        <span style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
          {doc.name}
        </span>
        {label && (
          <span style={{ fontSize: 10, color }}>{label}</span>
        )}
      </button>
      {doc.isGenerated && onRegenerate && (
        <button
          onClick={(e) => { e.stopPropagation(); onRegenerate(); }}
          title={isFr ? 'Régénérer' : 'Regenerate'}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            fontSize: 13,
            padding: '2px 3px',
            flexShrink: 0,
            lineHeight: 1,
          }}
        >
          ↻
        </button>
      )}
    </div>
  );
}

function MissingDocRow({
  name,
  isFr,
  onGenerate,
  indent,
}: {
  name: string;
  isFr: boolean;
  onGenerate(): void;
  indent?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 6,
        padding: indent ? '3px 8px 3px 28px' : '3px 8px 3px 14px',
      }}
    >
      <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {name}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic', whiteSpace: 'nowrap' }}>
          {isFr ? 'Non généré' : 'Not generated'}
        </span>
        <button
          onClick={onGenerate}
          style={{
            background: 'transparent',
            border: '1px solid var(--line)',
            borderRadius: 4,
            cursor: 'pointer',
            color: 'var(--text-muted)',
            fontSize: 10,
            padding: '1px 5px',
            whiteSpace: 'nowrap',
          }}
        >
          {isFr ? 'Générer →' : 'Generate →'}
        </button>
      </div>
    </div>
  );
}

function EmptyGlobalSection({ isFr, onGenerate }: { isFr: boolean; onGenerate(): void }) {
  return (
    <div style={{ padding: '4px 14px 8px' }}>
      <p style={{ margin: '0 0 6px', fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
        {isFr ? 'Aucun contexte global généré.' : 'No global context generated.'}
      </p>
      <button
        onClick={onGenerate}
        style={{
          background: 'var(--bg-soft)',
          border: '1px solid var(--line)',
          borderRadius: 6,
          cursor: 'pointer',
          color: 'var(--text-muted)',
          fontSize: 11,
          padding: '3px 8px',
        }}
      >
        {isFr ? 'Générer le contexte global →' : 'Generate global context →'}
      </button>
    </div>
  );
}

function FreshnessBanner({
  doc,
  isFr,
  onRegenerate,
}: {
  doc: ScannedDoc;
  isFr: boolean;
  onRegenerate(): void;
}) {
  const days = getDaysAgo(doc.lastModifiedAt);
  if (days === null) return null;

  const isStale = days >= 7;
  const color = freshnessColor(days);
  const label = isStale
    ? (isFr
      ? `⚠ Généré il y a ${days} jours — peut ne plus être à jour`
      : `⚠ Generated ${days} days ago — may be outdated`)
    : (isFr
      ? `Généré ${days === 0 ? "aujourd'hui" : days === 1 ? 'il y a 1 jour' : `il y a ${days} jours`}`
      : `Generated ${days === 0 ? 'today' : days === 1 ? '1 day ago' : `${days} days ago`}`);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        padding: '6px 10px',
        marginBottom: 14,
        background: isStale ? 'rgba(245, 158, 11, 0.08)' : 'var(--bg-soft)',
        border: `1px solid ${isStale ? '#f59e0b' : 'var(--line)'}`,
        borderRadius: 8,
        fontSize: 11,
        color,
      }}
    >
      <span>{label}</span>
      <button
        onClick={onRegenerate}
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          fontSize: 11,
          color: 'var(--primary)',
          fontWeight: 600,
          flexShrink: 0,
          padding: 0,
        }}
      >
        {isFr ? 'Régénérer →' : 'Regenerate →'}
      </button>
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
        borderRadius: 10,
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
              borderRadius: 10,
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
