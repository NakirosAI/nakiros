import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import type {
  ArtifactChangeMode,
  ArtifactChangeProposal,
  OnboardingChatLaunchRequest,
  StoredWorkspace,
} from '@nakiros/shared';
import PrdAssistant from './PrdAssistant';
import { MarkdownViewer } from './ui/MarkdownViewer';
import DocEditorChat from './context/DocEditorChat';
import { Alert, AlertDescription, AlertTitle, Badge, Button } from './ui';
import {
  ActionButton,
  DocRow,
  EmptyGlobalSection,
  EmptyPanel,
  FreshnessBanner,
  MissingDocRow,
  SectionHeader,
  formatTokens,
} from './context/ContextPanelParts';
import { WORKFLOW_CAPABILITIES } from '../utils/workflow-capabilities';
import type { ArtifactReviewMutation } from '../hooks/useArtifactReview';

interface Props {
  workspace: StoredWorkspace;
  onDocumentsChanged?(docsCount: number): void;
  openPrdAssistantSignal?: number;
  onOpenChat?(): void;
  onLaunchChat?(request: OnboardingChatLaunchRequest): void;
  onArtifactChangeProposal?: (event: {
    proposal: ArtifactChangeProposal;
    conversationId?: string | null;
    triggerMessageId?: string | null;
    baselineContentOverride?: string | null;
    alreadyApplied?: boolean;
  }) => void | Promise<void>;
  lastArtifactReviewMutation?: ArtifactReviewMutation | null;
}

type SaveStatus = 'saved' | 'saving' | 'unsaved';

const NAKIROS_EXPECTED_NAMES = ['architecture', 'stack', 'conventions', 'api', 'llms.txt'];

export default function ContextPanel({
  workspace,
  onDocumentsChanged,
  openPrdAssistantSignal,
  onOpenChat,
  onLaunchChat,
  onArtifactChangeProposal,
  lastArtifactReviewMutation,
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
  const [generatingContext, setGeneratingContext] = useState(false);
  const [contextConflict, setContextConflict] = useState<ContextConflict | null>(null);
  const [localContextHasGlobal, setLocalContextHasGlobal] = useState(
    Boolean(workspace.context?.global),
  );
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [agentMode, setAgentMode] = useState<ArtifactChangeMode>('diff');
  // Chat visible by default when a doc is open
  const [showChat, setShowChat] = useState(false);

  const trackedGenerateRunIdRef = useRef<string | null>(null);
  const scanningRef = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Refs to avoid stale closures + own-write guard
  const docContentRef = useRef<string | null>(null);
  const selectedDocRef = useRef<ScannedDoc | null>(null);
  // Prevents our own writeDoc calls from triggering the diff/reload
  const isOwnWriteRef = useRef(false);
  const skipNextWatchedReviewRef = useRef(false);

  useEffect(() => { docContentRef.current = docContent; }, [docContent]);
  useEffect(() => { selectedDocRef.current = selectedDoc; }, [selectedDoc]);

  const hasRepos = workspace.repos.length > 0;
  const projectContextWorkflow = useMemo(
    () => WORKFLOW_CAPABILITIES.find((c) => c.id === 'fetch-project-context'),
    [],
  );
  const globalDocs = scanResult?.globalSection.docs ?? [];
  const globalDecisionDocs = scanResult?.globalSection.decisionDocs ?? [];
  const globalMissingNames = scanResult?.globalSection.missingNames ?? [];

  // ── Scan timer ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!scanStartedAt || !scanning) return;
    const timer = window.setInterval(() => setScanElapsedMs(Date.now() - scanStartedAt), 250);
    return () => window.clearInterval(timer);
  }, [scanStartedAt, scanning]);

  function scan() {
    if (scanningRef.current) return;
    scanningRef.current = true;
    setScanning(true);
    const startedAt = Date.now();
    setScanStartedAt(startedAt);
    setScanElapsedMs(0);
    void window.nakiros.scanDocs(workspace)
      .then((result) => {
        setScanResult(result);
        const count =
          result.repos.reduce((s, r) => s + r.docs.length, 0) +
          (result.globalSection?.docs.length ?? 0) +
          (result.globalSection?.decisionDocs?.length ?? 0);
        setLastScanDocsCount(count);
        setLastScanDurationMs(Date.now() - startedAt);
        setLastScanAt(Date.now());
        onDocumentsChanged?.(count);
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

  // ── Workspace context events ─────────────────────────────────────────────────

  useEffect(() => {
    setLocalContextHasGlobal(Boolean(workspace.context?.global));
  }, [workspace.id, workspace.context?.global]);

  useEffect(() => {
    const unsubStart = window.nakiros.onAgentStart((event) => {
      if (event.command === '/nak-workflow-generate-context') {
        trackedGenerateRunIdRef.current = event.runId;
        setGeneratingContext(true);
      }
    });
    const unsubDone = window.nakiros.onAgentDone((event) => {
      if (event.runId === trackedGenerateRunIdRef.current) {
        trackedGenerateRunIdRef.current = null;
        setGeneratingContext(false);
        setLocalContextHasGlobal(true);
        void window.nakiros.syncWorkspace(workspace);
        void window.nakiros.pushContext(workspace).then((result) => {
          if (result.status === 'conflict') setContextConflict(result.conflict ?? null);
        });
      }
      // Re-scan after any agent run — agents may write new files to _nakiros/
      scan();
    });
    return () => { unsubStart(); unsubDone(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.id]);

  // ── File watcher — detect agent edits ────────────────────────────────────────

  useEffect(() => {
    if (!selectedDoc || selectedDoc.isRemote) return;
    void window.nakiros.watchDoc(selectedDoc.absolutePath);
    return () => { void window.nakiros.unwatchDoc(selectedDoc.absolutePath); };
  }, [selectedDoc?.absolutePath, selectedDoc?.isRemote]);

  useEffect(() => {
    const unsub = window.nakiros.onDocChanged((changedPath) => {
      if (!selectedDocRef.current || changedPath !== selectedDocRef.current.absolutePath) return;
      // Ignore changes triggered by our own writes
      if (isOwnWriteRef.current) return;
      void window.nakiros.readDoc(changedPath).then((newContent) => {
        if (skipNextWatchedReviewRef.current) {
          skipNextWatchedReviewRef.current = false;
          setDocContent(newContent);
          setSaveStatus('saved');
          return;
        }

        if (onArtifactChangeProposal) {
          void onArtifactChangeProposal({
            proposal: {
              target: { kind: 'workspace_doc', absolutePath: changedPath },
              mode: 'yolo',
              title: selectedDocRef.current?.name ?? 'Document',
              proposedContent: newContent,
            },
            baselineContentOverride: docContentRef.current ?? '',
            alreadyApplied: true,
          });
          setDocContent(newContent);
          setSaveStatus('saved');
          return;
        }

        setDocContent(newContent);
        setSaveStatus('saved');
      });
    });
    return () => unsub();
  }, [onArtifactChangeProposal]);

  // ── Doc selection ────────────────────────────────────────────────────────────

  useEffect(() => {
    setSelectedDoc(null);
    setDocContent(null);
    scan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.id]);

  function selectDoc(doc: ScannedDoc) {
    setSelectedDoc(doc);
    setSaveStatus('saved');
    setShowChat(true); // open chat by default when selecting a doc
  }

  useEffect(() => {
    if (!selectedDoc) {
      setDocContent(null);
      setSaveStatus('saved');
      return;
    }
    void window.nakiros.readDoc(selectedDoc.absolutePath)
      .then(setDocContent)
      .catch(() => setDocContent(t('unableToReadFile')));
  }, [selectedDoc?.absolutePath, t]);

  useEffect(() => {
    if (!openPrdAssistantSignal) return;
    setShowPrdAssistant(true);
  }, [openPrdAssistantSignal]);

  useEffect(() => {
    if (!lastArtifactReviewMutation) return;
    if (lastArtifactReviewMutation.target.kind !== 'workspace_doc') return;
    if (lastArtifactReviewMutation.target.absolutePath !== selectedDocRef.current?.absolutePath) return;

    skipNextWatchedReviewRef.current = true;
    window.setTimeout(() => {
      skipNextWatchedReviewRef.current = false;
    }, 1200);
    void window.nakiros.readDoc(lastArtifactReviewMutation.target.absolutePath)
      .then((content) => {
        setDocContent(content);
        setSaveStatus('saved');
      })
      .catch(() => {});
  }, [lastArtifactReviewMutation]);

  // ── Auto-save (with own-write guard) ─────────────────────────────────────────

  const handleEditorChange = useCallback(
    (markdown: string) => {
      if (markdown === docContentRef.current) return; // no real change
      setDocContent(markdown);
      setSaveStatus('unsaved');
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        const doc = selectedDocRef.current;
        if (!doc || doc.isRemote) return;
        setSaveStatus('saving');
        isOwnWriteRef.current = true;
        void window.nakiros.writeDoc(doc.absolutePath, markdown)
          .then(() => {
            setSaveStatus('saved');
            void window.nakiros.pushContext(workspace).catch(() => {});
          })
          .finally(() => {
            // Keep the guard active long enough for chokidar to fire and be ignored
            setTimeout(() => { isOwnWriteRef.current = false; }, 400);
          });
      }, 1000);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workspace.id],
  );

  // ── Generate context ─────────────────────────────────────────────────────────

  function handleGenerateContext() {
    onLaunchChat?.({
      requestId: `generate-context-${workspace.id}-${Date.now()}`,
      title: `Generate Context · ${workspace.name}`,
      agentId: 'generate-context',
      command: '/nak-workflow-generate-context',
    });
  }

  function handleScopedRegenerate(repoName: string) {
    if (!repoName) { onOpenChat?.(); return; }
    onLaunchChat?.({
      requestId: `regen-${repoName}-${Date.now()}`,
      title: `Regenerate Context · ${repoName}`,
      agentId: 'generate-context',
      command: `/nak-workflow-generate-context\n\nPlease regenerate context for the \`${repoName}\` repository only.`,
    });
  }

  function getSelectedDocRepoName(): string | null {
    if (!selectedDoc || !scanResult) return null;
    for (const repo of scanResult.repos) {
      if (repo.docs.some((d) => d.absolutePath === selectedDoc.absolutePath)) return repo.repoName;
    }
    return null;
  }

  // ── Labels ───────────────────────────────────────────────────────────────────

  const saveStatusLabel =
    saveStatus === 'saving' ? t('docEditorSaving') :
    saveStatus === 'unsaved' ? t('docEditorUnsaved') :
    t('docEditorSaved');

  const scanStatusLabel = scanning
    ? t('syncInProgress', { elapsed: Math.max(1, Math.floor(scanElapsedMs / 1000)) })
    : lastScanDurationMs != null
      ? t('lastScan', { count: lastScanDocsCount ?? 0, duration: lastScanDurationMs, time: lastScanAt ? new Date(lastScanAt).toLocaleTimeString() : '-' })
      : t('noScanYet');

  const totalContextTokens = useMemo(() => {
    if (!scanResult) return null;
    const allDocs = [
      ...scanResult.globalSection.docs,
      ...scanResult.globalSection.decisionDocs,
      ...scanResult.repos.flatMap((r) => r.docs),
    ];
    const totalChars = allDocs.reduce((sum, d) => sum + (d.charCount ?? 0), 0);
    return totalChars > 0 ? formatTokens(totalChars) : null;
  }, [scanResult]);

  const isEditableDoc = Boolean(selectedDoc && !selectedDoc.isRemote);
  const agentModeLabel = agentMode === 'diff' ? t('docEditorModeReview') : t('docEditorModeYolo');

  // ── Editor panel (center) ─────────────────────────────────────────────────────

  const editorPanel = selectedDoc && docContent !== null ? (
    <div className="flex h-full flex-col border-r border-[var(--line)] bg-[var(--bg)]">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--line)] bg-[var(--bg-soft)] px-4 py-2">
        <div className="min-w-0 flex-1">
          <div className="truncate font-mono text-[11px] text-[var(--text-muted)]">
            {selectedDoc.relativePath}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {isEditableDoc ? (
              <Badge variant="muted">{agentModeLabel}</Badge>
            ) : null}
            {isEditableDoc ? (
              <span className={clsx(
                'shrink-0 text-[10px]',
                saveStatus === 'unsaved' && 'text-[#f59e0b]',
                saveStatus === 'saving' && 'italic text-[var(--text-muted)]',
                saveStatus === 'saved' && 'text-[var(--text-muted)]',
              )}>
                {saveStatusLabel}
              </span>
            ) : null}
            {selectedDoc.isRemote ? (
              <span className="shrink-0 text-[10px] text-[var(--text-muted)]">
                {t('docEditorRemoteReadOnly')}
              </span>
            ) : null}
          </div>
        </div>
        {isEditableDoc ? (
          <Button size="sm" variant={showChat ? 'default' : 'outline'} onClick={() => setShowChat((current) => !current)}>
            <Sparkles data-icon="inline-start" />
            {showChat ? t('artifactReviewClose') : t('docEditorOpenChat')}
          </Button>
        ) : null}
      </div>

      {isEditableDoc && !showChat ? (
        <div className="shrink-0 px-5 pt-3">
          <Alert>
            <Sparkles className="size-4" />
            <AlertTitle>{t('docEditorAssistTitle')}</AlertTitle>
            <AlertDescription>{t('docEditorAssistBody')}</AlertDescription>
          </Alert>
        </div>
      ) : null}

      {/* Freshness banner */}
      {selectedDoc.isGenerated && (
        <div className="shrink-0 px-5 pt-3">
          <FreshnessBanner
            doc={selectedDoc}
            repoName={getSelectedDocRepoName() ?? ''}
            onRegenerate={handleScopedRegenerate}
          />
        </div>
      )}

      <div className="flex-1 overflow-hidden">
        <MarkdownViewer
          content={docContent}
          className="h-full"
        />
      </div>
    </div>
  ) : (
    <div className="flex h-full items-center justify-center border-r border-[var(--line)] bg-[var(--bg)]">
      <EmptyPanel
        icon={<BookOpen size={32} color="var(--text-muted)" strokeWidth={1.5} />}
        title={scanning && !scanResult ? t('syncingProjectContext') : t('selectDocOrLaunchAgent')}
        subtitle={scanning && !scanResult ? t('scanningRepositories') : undefined}
      />
    </div>
  );

  return (
    <div className="flex h-full w-full min-w-0 flex-1 overflow-hidden">

      {/* ── Left: doc tree ── */}
      <div className="flex w-72 shrink-0 flex-col overflow-hidden border-r border-[var(--line)]">
        {contextConflict && (
          <div className="shrink-0 border-b border-[var(--line)] bg-[var(--bg-soft)] px-[14px] py-2">
            <p className="m-0 text-[11px] text-[var(--text-muted)]">
              {t('contextConflict', {
                updatedBy: contextConflict.updatedBy ?? t('contextConflictUnknownUser'),
                repo: contextConflict.repoName ?? t('contextConflictGlobal'),
              })}
            </p>
            <div className="mt-1.5 flex gap-2">
              <button
                className="rounded border border-[var(--line)] bg-[var(--bg)] px-2 py-0.5 text-[10px] text-[var(--text)]"
                onClick={() => {
                  void window.nakiros.pushContext(workspace, true).then((r) => {
                    if (r.status !== 'conflict') setContextConflict(null);
                  });
                }}
              >
                {t('contextConflictOverwrite')}
              </button>
              <button
                className="rounded border border-[var(--line)] bg-[var(--bg)] px-2 py-0.5 text-[10px] text-[var(--text-muted)]"
                onClick={() => setContextConflict(null)}
              >
                {t('contextConflictDismiss')}
              </button>
            </div>
          </div>
        )}

        {/* Generate Context */}
        <div className="shrink-0 border-b border-[var(--line)] px-[14px] py-[10px]">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--text-muted)]">
              {t('generateContextSectionTitle')}
            </span>
            {generatingContext && (
              <span className="text-[10px] italic text-[var(--text-muted)]">
                {t('contextGeneratingProgress')}
              </span>
            )}
          </div>
          {localContextHasGlobal ? (
            <div className="flex items-center justify-between gap-2">
              {workspace.context?.generatedAt && (
                <span className="text-[10px] text-[var(--text-muted)]">
                  {t('contextGeneratedAt', {
                    date: new Date(workspace.context.generatedAt).toLocaleDateString(),
                  })}
                </span>
              )}
              <button
                onClick={handleGenerateContext}
                disabled={generatingContext}
                className={clsx(
                  'ml-auto shrink-0 rounded-lg border border-[var(--line)] bg-[var(--bg-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--text)]',
                  generatingContext && 'cursor-default opacity-50',
                )}
              >
                {t('regenerateContextButtonLabel')}
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="m-0 text-[11px] text-[var(--text-muted)]">{t('contextNotGenerated')}</p>
              <button
                onClick={handleGenerateContext}
                disabled={generatingContext || !hasRepos}
                className={clsx(
                  'w-full rounded-lg border border-[var(--primary)] bg-[var(--primary)] px-3 py-1.5 text-[12px] font-semibold text-white',
                  (generatingContext || !hasRepos) && 'cursor-default opacity-50',
                )}
              >
                {generatingContext ? t('contextGeneratingProgress') : t('generateContextButtonLabel')}
              </button>
            </div>
          )}
        </div>

        {/* Documents */}
        <div className="flex shrink-0 items-center justify-between px-[14px] pb-0 pt-[10px]">
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                {t('documents')}
              </span>
              {totalContextTokens && (
                <span className="rounded bg-[var(--bg-soft)] px-1 py-px text-[9px] text-[var(--text-muted)]">
                  ~{totalContextTokens} tokens
                </span>
              )}
            </div>
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
              {globalDocs.length === 0 && globalDecisionDocs.length === 0 && globalMissingNames.length === 0 ? (
                <EmptyGlobalSection onGenerate={() => onOpenChat?.()} />
              ) : (
                <>
                  {globalDocs.map((doc) => (
                    <DocRow
                      key={doc.absolutePath}
                      doc={doc}
                      isSelected={selectedDoc?.absolutePath === doc.absolutePath}
                      onSelect={() => selectDoc(doc)}
                      onRegenerate={() => onOpenChat?.()}
                    />
                  ))}
                  {globalMissingNames.map((name) => (
                    <MissingDocRow key={name} name={name} onGenerate={() => onOpenChat?.()} />
                  ))}
                  {globalDecisionDocs.length > 0 && (
                    <div>
                      <div className="px-[14px] pb-0.5 pt-[5px] pl-6 font-mono text-[10px] text-[var(--text-muted)]">
                        {t('decisionsFolder')}
                      </div>
                      {globalDecisionDocs.map((doc) => (
                        <DocRow
                          key={doc.absolutePath}
                          doc={doc}
                          isSelected={selectedDoc?.absolutePath === doc.absolutePath}
                          onSelect={() => selectDoc(doc)}
                          onRegenerate={() => onOpenChat?.()}
                          indent
                        />
                      ))}
                    </div>
                  )}
                </>
              )}

              {scanResult.repos.map((repo) => {
                const isRemoteRepo = repo.docs.every((d) => d.isRemote);
                const rootDocs = repo.docs.filter((d) => !d.relativePath.startsWith('_nakiros/'));
                const nakirosDocs = repo.docs.filter((d) => d.relativePath.startsWith('_nakiros/'));
                const nakirosDocNames = new Set(nakirosDocs.map((d) => d.name));
                const missingNakiros = isRemoteRepo ? [] : NAKIROS_EXPECTED_NAMES.filter((n) => !nakirosDocNames.has(n));

                return (
                  <div key={repo.repoPath}>
                    <SectionHeader label={`${repo.repoName.toUpperCase()}${isRemoteRepo ? ' ☁' : ''}`} />
                    {rootDocs.map((doc) => (
                      <DocRow
                        key={doc.absolutePath}
                        doc={doc}
                        isSelected={selectedDoc?.absolutePath === doc.absolutePath}
                        onSelect={() => selectDoc(doc)}
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
                            repoName={repo.repoName}
                            isSelected={selectedDoc?.absolutePath === doc.absolutePath}
                            onSelect={() => selectDoc(doc)}
                            onRegenerate={handleScopedRegenerate}
                            indent
                          />
                        ))}
                        {missingNakiros.map((name) => (
                          <MissingDocRow key={name} name={name} onGenerate={() => onOpenChat?.()} indent />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* AI actions */}
        <div className="shrink-0 border-t border-[var(--line)] p-[10px_12px]">
          <p className="mb-2 mt-0 text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--text-muted)]">
            {t('aiActions')}
          </p>
          <div className="flex flex-col gap-[5px]">
            <ActionButton label={t('prdAssistant')} description="/nak-agent-brainstorming" recommended onClick={() => setShowPrdAssistant(true)} />
            <ActionButton label={t('generateContext')} description="/nak-workflow-generate-context" onClick={() => onOpenChat?.()} />
            <ActionButton
              label={t('productContext')}
              description="/nak-workflow-fetch-project-context"
              badge={projectContextWorkflow?.status === 'beta' ? t('betaBadge') : undefined}
              onClick={() => onOpenChat?.()}
            />
            <ActionButton label={t('openChat')} description={t('openChatDescription')} onClick={() => onOpenChat?.()} />
            {projectContextWorkflow?.status === 'beta' && (
              <p className="mb-0 mt-1 text-[11px] text-[var(--text-muted)]">{t('projectContextWorkflowBetaFallback')}</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Content area: split view (editor | chat) ── */}
      {selectedDoc && docContent !== null && showChat && isEditableDoc ? (
        // FeatureSpecView-style 50/50 grid when chat is open
        <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_430px]">
          <div className="min-w-0 overflow-hidden">{editorPanel}</div>
          <div className="min-w-0 overflow-hidden">
            <DocEditorChat
              doc={selectedDoc}
              workspace={workspace}
              mode={agentMode}
              onModeChange={setAgentMode}
              onClose={() => setShowChat(false)}
              onArtifactChangeProposal={onArtifactChangeProposal}
            />
          </div>
        </div>
      ) : (
        // Single editor panel (no chat, or read-only doc)
        <div className="min-w-0 flex-1 overflow-hidden">{editorPanel}</div>
      )}

      {showPrdAssistant && (
        <PrdAssistant
          onClose={() => setShowPrdAssistant(false)}
          onSubmit={async () => { setShowPrdAssistant(false); onOpenChat?.(); }}
        />
      )}
    </div>
  );
}
