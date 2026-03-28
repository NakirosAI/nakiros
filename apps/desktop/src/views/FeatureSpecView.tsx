import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import type { OnboardingChatLaunchRequest, StoredWorkspace } from '@nakiros/shared';
import { MarkdownViewer } from '../components/ui/MarkdownViewer';
import AgentPanel from '../components/AgentPanel';
import { Badge } from '../components/ui';

// ── Types ─────────────────────────────────────────────────────────────────────

type SpecState = 'idle' | 'in-progress' | 'validated';

interface Props {
  workspace: StoredWorkspace;
}

// ── View ──────────────────────────────────────────────────────────────────────

export default function FeatureSpecView({ workspace }: Props) {
  const { t } = useTranslation('spec');

  const [specContent, setSpecContent] = useState('');
  const [specTitle, setSpecTitle] = useState('');
  const [specState, setSpecState] = useState<SpecState>('idle');
  const [userEdited, setUserEdited] = useState(false);
  const [activeTab, setActiveTab] = useState<'spec' | 'chat'>('chat');
  const [isNarrow, setIsNarrow] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  // Pending spec context injected into next agent turn (wired in story 12-4)
  const pendingSpecContextRef = useRef<string | null>(null);

  // Auto-launch the PM feature workflow once on mount — stable ref so it never re-fires
  const featureLaunchRequest = useMemo<OnboardingChatLaunchRequest>(() => ({
    requestId: `feature-spec-${workspace.id}`,
    title: t('view.chatTitle'),
    agentId: 'pm',
    command: '/nak-workflow-pm-feature',
  }), [workspace.id, t]);

  const attachContainer = useCallback((el: HTMLDivElement | null) => {
    if (observerRef.current) observerRef.current.disconnect();
    containerRef.current = el;
    if (!el) return;
    observerRef.current = new ResizeObserver(([entry]) => {
      setIsNarrow((entry?.contentRect.width ?? 900) < 900);
    });
    observerRef.current.observe(el);
  }, []);

  const handleSpecUpdate = useCallback((markdown: string) => {
    setSpecContent(markdown);
    setUserEdited(false);
    if (specState === 'idle') setSpecState('in-progress');
    const firstHeading = markdown.match(/^#\s+(.+)$/m);
    if (firstHeading && !specTitle) setSpecTitle(firstHeading[1] ?? '');
  }, [specState, specTitle]);

  const handleSpecChange = useCallback((markdown: string) => {
    setSpecContent(markdown);
    setUserEdited(true);
    pendingSpecContextRef.current = `[SPEC ACTUEL]\n${markdown}\n[/SPEC ACTUEL]`;
  }, []);

  const handleValidate = useCallback(() => {
    setSpecState('validated');
    setUserEdited(false);
  }, []);

  const statusLabel: string = {
    idle: t('view.statusIdle'),
    'in-progress': t('view.statusInProgress'),
    validated: t('view.statusValidated'),
  }[specState];

  const statusVariant: 'default' | 'success' | 'muted' =
    specState === 'validated' ? 'success' : specState === 'in-progress' ? 'default' : 'muted';

  // ── Panels ────────────────────────────────────────────────────────────────

  const specPanel = (
    <div className="flex h-full flex-col border-r border-[var(--line)] bg-[var(--bg)]">
      <div className="flex items-center gap-2 border-b border-[var(--line)] bg-[var(--bg-soft)] px-4 py-3">
        <input
          type="text"
          value={specTitle}
          onChange={(e) => setSpecTitle(e.target.value)}
          placeholder={t('view.titlePlaceholder')}
          disabled={specState === 'validated'}
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none disabled:cursor-default"
        />
        <div className="flex shrink-0 items-center gap-2">
          {userEdited && (
            <span className="text-xs text-[var(--text-muted)]">{t('view.badgeModified')}</span>
          )}
          <Badge variant={statusVariant}>{statusLabel}</Badge>
          <button
            type="button"
            disabled={specState === 'idle' || specState === 'validated'}
            onClick={handleValidate}
            className={clsx(
              'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              specState === 'idle' || specState === 'validated'
                ? 'cursor-not-allowed bg-[var(--bg-muted)] text-[var(--text-muted)]'
                : 'bg-[var(--primary)] text-white hover:opacity-90',
            )}
          >
            {t('view.validateButton')}
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <MarkdownViewer
          content={specContent}
          className="h-full"
        />
      </div>
    </div>
  );

  const chatPanel = (
    <AgentPanel
      workspaceId={workspace.id}
      workspaceName={workspace.name}
      repos={workspace.repos}
      workspacePath={workspace.workspacePath}
      isVisible
      hideTabs
      launchChatRequest={featureLaunchRequest}
      onSpecUpdate={handleSpecUpdate}
    />
  );

  // ── Narrow layout (<900px) ────────────────────────────────────────────────

  if (isNarrow) {
    return (
      <div ref={attachContainer} className="flex h-full flex-col bg-[var(--bg)]">
        <div className="flex border-b border-[var(--line)] bg-[var(--bg-soft)]">
          {(['chat', 'spec'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={clsx(
                'px-4 py-2 text-sm font-medium transition-colors',
                activeTab === tab
                  ? 'border-b-2 border-[var(--primary)] text-[var(--primary)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)]',
              )}
            >
              {tab === 'spec' ? t('view.tabSpec') : t('view.tabChat')}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-hidden">
          {activeTab === 'spec' ? specPanel : chatPanel}
        </div>
      </div>
    );
  }

  // ── Wide layout (50/50 split) ─────────────────────────────────────────────

  return (
    <div
      ref={attachContainer}
      className="grid h-full bg-[var(--bg)]"
      style={{ gridTemplateColumns: '1fr 1fr' }}
    >
      <div className="min-w-0 overflow-hidden">{specPanel}</div>
      <div className="min-w-0 overflow-hidden">{chatPanel}</div>
    </div>
  );
}
