import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { ConversationAnalysis } from '@nakiros/shared';
import { X } from 'lucide-react';
import { DiagnosticTab } from './DiagnosticTab';

interface Props {
  analysis: ConversationAnalysis;
  onClose(): void;
}

type DrawerTab = 'diagnostic' | 'timeline' | 'transcript';

interface TabDef {
  id: DrawerTab;
  labelKey: string;
  /** True when the tab is shipped in this PR. Others render a "soon" hint. */
  enabled: boolean;
  comingIn?: string;
}

const TABS: TabDef[] = [
  { id: 'diagnostic', labelKey: 'drawer.tabs.diagnostic', enabled: true },
  { id: 'timeline', labelKey: 'drawer.tabs.timeline', enabled: false, comingIn: 'PR10b' },
  { id: 'transcript', labelKey: 'drawer.tabs.transcript', enabled: false, comingIn: 'PR10b' },
];

/**
 * Slide-in drawer over the {@link ConversationsScreen} list. Mirrors the
 * mockup `ConvDrawer` (`apps/Nakiros-new-design/screens-conversations.jsx`):
 * a compact header with a score chip + zone badge + session metadata + title,
 * then a tab nav. PR10a only ships the {@link DiagnosticTab}; Timeline and
 * Transcript tabs are visible but inert until PR10b.
 */
export function ConvDrawer({ analysis, onClose }: Props) {
  const { t } = useTranslation('conversations');
  const tone = toneFor(analysis.healthZone);

  // Esc closes the drawer.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const sessionShort = analysis.sessionId.slice(0, 8);
  const date = new Date(analysis.lastMessageAt).toLocaleDateString();

  return (
    <div className="fixed inset-0 z-40 flex" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label={t('drawer.close')}
        onClick={onClose}
        className="flex-1 bg-n-overlay backdrop-blur-[2px]"
      />
      <aside className="flex h-full w-[min(960px,92vw)] flex-col border-l border-n-border-default bg-n-canvas shadow-n-pop">
        {/* Header — compact: score chip · zone badge · session id · date · title · close */}
        <header className="border-b border-n-border-subtle px-5 py-3.5">
          <div className="flex items-center gap-3">
            <div
              className={
                'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-n-md font-n-mono text-[13px] font-medium ' +
                tone.chip
              }
              aria-label={`score ${analysis.score}`}
            >
              {analysis.score}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span
                  className={
                    'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-[0.4px] ' +
                    tone.badge
                  }
                >
                  <span className={'inline-block h-1.5 w-1.5 rounded-full ' + tone.dot} />
                  {t(`health.${analysis.healthZone}`)}
                </span>
                <span className="font-n-mono text-[11px] text-n-faint">session {sessionShort}</span>
                <span className="text-n-faint">·</span>
                <span className="font-n-mono text-[11px] text-n-faint">{date}</span>
                {analysis.gitBranch && (
                  <>
                    <span className="text-n-faint">·</span>
                    <span className="font-n-mono text-[11px] text-n-faint">{analysis.gitBranch}</span>
                  </>
                )}
              </div>
              <div className="mt-0.5 truncate text-[13.5px] text-n-fg">{analysis.summary}</div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('drawer.close')}
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-n-sm border-none bg-n-raised text-n-muted hover:bg-n-canvas hover:text-n-fg"
            >
              <X size={13} />
            </button>
          </div>
        </header>

        {/* Tab nav */}
        <nav className="flex gap-5 border-b border-n-border-subtle px-5 pt-3" aria-label="Drawer tabs">
          {TABS.map((tab) => {
            const active = tab.id === 'diagnostic';
            return (
              <button
                key={tab.id}
                type="button"
                disabled={!tab.enabled}
                aria-current={active ? 'page' : undefined}
                title={
                  tab.enabled
                    ? undefined
                    : `${t(tab.labelKey, { defaultValue: tab.id })} · ${tab.comingIn}`
                }
                className={
                  '-mb-px border-b-2 pb-2 text-[12.5px] font-medium capitalize transition-colors ' +
                  (active
                    ? 'border-n-accent text-n-fg'
                    : tab.enabled
                      ? 'border-transparent text-n-muted hover:text-n-fg'
                      : 'cursor-not-allowed border-transparent text-n-faint opacity-60')
                }
              >
                {t(tab.labelKey, { defaultValue: tab.id })}
              </button>
            );
          })}
        </nav>

        <div className="flex-1 overflow-y-auto">
          <DiagnosticTab analysis={analysis} />
        </div>
      </aside>
    </div>
  );
}

function toneFor(zone: ConversationAnalysis['healthZone']): {
  chip: string;
  badge: string;
  dot: string;
} {
  if (zone === 'degraded') {
    return {
      chip: 'bg-n-critical-soft text-n-critical',
      badge: 'bg-n-critical-soft text-n-critical',
      dot: 'bg-n-critical',
    };
  }
  if (zone === 'watch') {
    return {
      chip: 'bg-n-watch-soft text-n-watch',
      badge: 'bg-n-watch-soft text-n-watch',
      dot: 'bg-n-watch',
    };
  }
  return {
    chip: 'bg-n-healthy-soft text-n-healthy',
    badge: 'bg-n-healthy-soft text-n-healthy',
    dot: 'bg-n-healthy',
  };
}
