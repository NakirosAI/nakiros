import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { BookOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import type { StoredWorkspace } from '@nakiros/shared';
import PrdAssistant from './PrdAssistant';
import {
  ActionButton,
  DocRow,
  EmptyGlobalSection,
  EmptyPanel,
  FreshnessBanner,
  MissingDocRow,
  SectionHeader,
} from './context/ContextPanelParts';
import { WORKFLOW_CAPABILITIES } from '../utils/workflow-capabilities';

interface Props {
  workspace: StoredWorkspace;
  onDocumentsChanged?(docsCount: number): void;
  openPrdAssistantSignal?: number;
  onOpenChat?(): void;
}

// Names (without .md ext) expected in each repo's _nakiros/ subfolder
const NAKIROS_EXPECTED_NAMES = ['architecture', 'conventions', 'llms.txt'];

export default function ContextPanel({
  workspace,
  onDocumentsChanged,
  openPrdAssistantSignal,
  onOpenChat,
}: Props) {
  const { t } = useTranslation('context');
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
      .catch(() => setDocContent(t('unableToReadFile')));
  }, [selectedDoc?.absolutePath, t]);

  useEffect(() => {
    if (!openPrdAssistantSignal) return;
    setShowPrdAssistant(true);
  }, [openPrdAssistantSignal]);

  const scanStatusLabel = (() => {
    if (scanning) {
      return t('syncInProgress', { elapsed: Math.max(1, Math.floor(scanElapsedMs / 1000)) });
    }
    if (lastScanDurationMs != null) {
      const time = lastScanAt ? new Date(lastScanAt).toLocaleTimeString() : '-';
      return t('lastScan', { count: lastScanDocsCount ?? 0, duration: lastScanDurationMs, time });
    }
    return t('noScanYet');
  })();

  return (
    <div className="flex h-full w-full min-w-0 flex-1 overflow-hidden">
      <div className="flex w-80 shrink-0 flex-col overflow-hidden border-r border-[var(--line)]">
        <div className="flex shrink-0 items-center justify-between px-[14px] pb-0 pt-[10px]">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--text-muted)]">
              {t('documents')}
            </span>
            <span className="text-[10px] text-[var(--text-muted)]">{scanStatusLabel}</span>
          </div>
          <button
            onClick={scan}
            disabled={scanning}
            title={scanning ? t('syncing') : t('refresh')}
            className={clsx(
              'border-none bg-transparent px-1 py-0.5 text-sm leading-none text-[var(--text-muted)]',
              scanning ? 'cursor-default opacity-50' : 'opacity-100',
            )}
          >
            {scanning ? '⟳' : '↺'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-1.5">
          {scanning && !scanResult ? (
            <p className="px-[14px] py-2 text-xs italic text-[var(--text-muted)]">{t('syncing')}</p>
          ) : !scanResult ? (
            <p className="px-[14px] py-2 text-xs text-[var(--text-muted)]">
              {hasRepos ? t('noDocumentsFound') : t('noRepositoryConfigured')}
            </p>
          ) : (
            <>
              <SectionHeader label={t('globalSection')} />
              {scanResult.globalSection.docs.length === 0 && scanResult.globalSection.missingNames.length === 0 ? (
                <EmptyGlobalSection onGenerate={() => onOpenChat?.()} />
              ) : (
                <>
                  {scanResult.globalSection.docs.map((doc) => (
                    <DocRow
                      key={doc.absolutePath}
                      doc={doc}
                      isSelected={selectedDoc?.absolutePath === doc.absolutePath}
                      onSelect={() => setSelectedDoc(doc)}
                      onRegenerate={() => onOpenChat?.()}
                    />
                  ))}
                  {scanResult.globalSection.missingNames.map((name) => (
                    <MissingDocRow
                      key={name}
                      name={name}
                      onGenerate={() => onOpenChat?.()}
                    />
                  ))}
                </>
              )}

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
                        onSelect={() => setSelectedDoc(doc)}
                      />
                    ))}

                    {(nakirosDocs.length > 0 || missingNakiros.length > 0) && (
                      <div>
                        <div className="px-[14px] pb-0.5 pt-[5px] pl-6 font-mono text-[10px] text-[var(--text-muted)]">
                          _nakiros/
                        </div>
                        {nakirosDocs.map((doc) => (
                          <DocRow
                            key={doc.absolutePath}
                            doc={doc}
                            isSelected={selectedDoc?.absolutePath === doc.absolutePath}
                            onSelect={() => setSelectedDoc(doc)}
                            onRegenerate={() => onOpenChat?.()}
                            indent
                          />
                        ))}
                        {missingNakiros.map((name) => (
                          <MissingDocRow
                            key={name}
                            name={name}
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

        <div className="shrink-0 border-t border-[var(--line)] p-[10px_12px]">
          <p className="mb-2 mt-0 text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--text-muted)]">
            {t('aiActions')}
          </p>
          <div className="flex flex-col gap-[5px]">
            <ActionButton
              label={t('prdAssistant')}
              description="/nak-agent-brainstorming"
              recommended
              onClick={() => setShowPrdAssistant(true)}
            />
            <ActionButton
              label={t('generateContext')}
              description="/nak-workflow-generate-context"
              onClick={() => onOpenChat?.()}
            />
            <ActionButton
              label={t('pmContext')}
              description="/nak-workflow-fetch-project-context"
              badge={pmWorkflow?.status === 'beta' ? t('betaBadge') : undefined}
              onClick={() => onOpenChat?.()}
            />
            <ActionButton
              label={t('openChat')}
              description={t('openChatDescription')}
              onClick={() => onOpenChat?.()}
            />
            {pmWorkflow?.status === 'beta' && (
              <p className="mb-0 mt-1 text-[11px] text-[var(--text-muted)]">{t('pmWorkflowBetaFallback')}</p>
            )}
          </div>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {selectedDoc && docContent !== null ? (
          <div className="agent-md flex-1 overflow-y-auto px-7 py-5">
            <p className="mb-2 mt-0 text-[11px] text-[var(--text-muted)]">{selectedDoc.relativePath}</p>
            {selectedDoc.isGenerated && (
              <FreshnessBanner doc={selectedDoc} onRegenerate={() => onOpenChat?.()} />
            )}
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{docContent}</ReactMarkdown>
          </div>
        ) : scanning && !scanResult ? (
          <EmptyPanel
            icon={<BookOpen size={32} color="var(--text-muted)" strokeWidth={1.5} />}
            title={t('syncingProjectContext')}
            subtitle={t('scanningRepositories')}
          />
        ) : (
          <EmptyPanel
            icon={<BookOpen size={32} color="var(--text-muted)" strokeWidth={1.5} />}
            title={t('selectDocOrLaunchAgent')}
          />
        )}
      </div>

      {showPrdAssistant && (
        <PrdAssistant
          onClose={() => setShowPrdAssistant(false)}
          onSubmit={async () => {
            setShowPrdAssistant(false);
            onOpenChat?.();
          }}
        />
      )}
    </div>
  );
}
