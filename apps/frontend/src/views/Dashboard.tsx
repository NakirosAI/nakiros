import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Languages } from 'lucide-react';
import type { LanguagePreference } from '@nakiros/shared';
import appIcon from '../assets/icon.svg';
import DashboardErrorBoundary from '../components/dashboard/DashboardErrorBoundary';
import { DashboardRouter } from '../components/dashboard/DashboardRouter';
import Sidebar, { type SidebarTab } from '../components/Sidebar';
import VersionIndicator from '../components/VersionIndicator';
import { useProject } from '../hooks/useProject';
import { usePreferences } from '../hooks/usePreferences';
import { useProposalCount } from '../hooks/useProposalCount';

interface Props {
  onGoHome(): void;
}

export default function Dashboard({ onGoHome }: Props) {
  const { t } = useTranslation('dashboard');
  const { t: tSidebar } = useTranslation('sidebar');
  const { t: tSettings } = useTranslation('settings');
  const {
    project,
    openProjects,
    activeProjectId,
    allProjects,
    openProjectTab,
    closeProjectTab,
  } = useProject();
  const { preferences, updatePreferences } = usePreferences();
  const proposalCount = useProposalCount(activeProjectId);

  const [activeTab, setActiveTab] = useState<SidebarTab>('dashboard');
  const [isProjectMenuOpen, setIsProjectMenuOpen] = useState(false);
  const [projectMenuSide, setProjectMenuSide] = useState<'left' | 'right'>('right');
  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false);
  const projectMenuRef = useRef<HTMLDivElement>(null);
  const projectMenuButtonRef = useRef<HTMLButtonElement>(null);

  const languageOptions: { value: LanguagePreference; label: string }[] = [
    { value: 'system', label: tSettings('languageSystem') },
    { value: 'fr', label: tSettings('languageFrench') },
    { value: 'en', label: tSettings('languageEnglish') },
  ];
  const currentLanguage = preferences.language ?? 'system';

  async function handleLanguageChange(next: LanguagePreference) {
    setIsLangMenuOpen(false);
    if (next === currentLanguage) return;
    await updatePreferences({ ...preferences, language: next });
  }

  const unopenedProjects = allProjects.filter(
    (candidate) => !openProjects.some((op) => op.id === candidate.id),
  );
  const menuPositionClass = projectMenuSide === 'right' ? 'left-0' : 'right-0';

  function toggleProjectMenu() {
    const rect = projectMenuButtonRef.current?.getBoundingClientRect();
    if (rect) {
      const buttonCenter = rect.left + rect.width / 2;
      setProjectMenuSide(buttonCenter <= window.innerWidth / 2 ? 'right' : 'left');
    }
    setIsProjectMenuOpen((prev) => !prev);
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* ─── Topbar ─────────────────────────────────────────────────────────── */}
      <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--bg-soft)] px-[18px]">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <button
            onClick={onGoHome}
            title={t('home')}
            aria-label={t('home')}
            className="grid h-7 w-7 place-items-center rounded-lg border-none bg-transparent p-0"
          >
            <img src={appIcon} alt="Logo Nakiros" width={32} height={32} className="block" />
          </button>

          <div className="flex min-w-0 items-center gap-1.5">
            <div aria-label="Project tabs" className="flex min-w-0 max-w-[min(62vw,760px)] items-center gap-1.5 overflow-x-auto">
              {openProjects.map((openedProject) => {
                const isActive = openedProject.id === activeProjectId;
                return (
                  <div
                    key={openedProject.id}
                    className={clsx(
                      'flex min-w-0 items-center rounded-[10px] border',
                      isActive
                        ? 'border-[var(--line-strong)] bg-[var(--bg-card)]'
                        : 'border-[var(--line)] bg-[var(--bg-soft)]',
                    )}
                  >
                    <button
                      onClick={() => openProjectTab(openedProject.id)}
                      title={openedProject.name}
                      className="flex max-w-[220px] min-w-0 items-center gap-1.5 border-none bg-transparent px-[10px] py-1.5 text-[13px] font-semibold text-[var(--text)]"
                    >
                      <span className="truncate">{openedProject.name}</span>
                    </button>
                    <button
                      onClick={() => closeProjectTab(openedProject.id)}
                      title={`Close ${openedProject.name}`}
                      className="h-[26px] w-[26px] shrink-0 border-0 border-l border-solid border-l-[var(--line)] bg-transparent p-0 text-sm leading-none text-[var(--text-muted)]"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Project menu */}
            <div ref={projectMenuRef} className="relative shrink-0">
              <button
                ref={projectMenuButtonRef}
                onClick={toggleProjectMenu}
                title="Open project"
                className="h-7 w-7 rounded-lg border border-[var(--line)] bg-[var(--bg-soft)] p-0 text-lg leading-none text-[var(--text)]"
              >
                +
              </button>
              {isProjectMenuOpen && (
                <div
                  className={clsx(
                    'absolute top-[34px] z-[200] max-h-[280px] w-[260px] max-w-[calc(100vw-24px)] overflow-y-auto rounded-xl border border-[var(--line)] bg-[var(--bg-card)] p-1.5',
                    menuPositionClass,
                  )}
                >
                  {unopenedProjects.length > 0 ? (
                    unopenedProjects.map((candidate) => (
                      <button
                        key={candidate.id}
                        onClick={() => {
                          openProjectTab(candidate.id);
                          setIsProjectMenuOpen(false);
                        }}
                        className="w-full rounded-lg border-none bg-transparent px-[10px] py-2 text-left text-[13px] text-[var(--text)]"
                      >
                        {candidate.name}
                      </button>
                    ))
                  ) : (
                    <div className="px-[10px] py-2 text-xs text-[var(--text-muted)]">
                      No other projects
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="relative flex shrink-0 items-center gap-2">
          <VersionIndicator />
          <button
            onClick={() => setIsLangMenuOpen((prev) => !prev)}
            title={tSettings('languageTitle')}
            aria-label={tSettings('languageTitle')}
            className={clsx(
              'grid h-7 w-7 place-items-center rounded-lg p-0',
              isLangMenuOpen
                ? 'border border-[var(--primary)] bg-[var(--bg-muted)]'
                : 'border border-[var(--line)] bg-transparent',
            )}
          >
            <Languages size={14} color={isLangMenuOpen ? 'var(--primary)' : 'var(--text-muted)'} />
          </button>
          {isLangMenuOpen && (
            <div className="absolute right-0 top-[34px] z-[200] w-[180px] rounded-xl border border-[var(--line)] bg-[var(--bg-card)] p-1.5">
              {languageOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => void handleLanguageChange(option.value)}
                  className={clsx(
                    'w-full rounded-lg border-none bg-transparent px-[10px] py-2 text-left text-[13px]',
                    option.value === currentLanguage
                      ? 'font-semibold text-[var(--primary)]'
                      : 'text-[var(--text)]',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ─── Main content ───────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          active={activeTab}
          onChange={setActiveTab}
          labels={{
            dashboard: tSidebar('dashboard', 'Dashboard'),
            skills: tSidebar('skills', 'Skills'),
            conversations: tSidebar('conversations', 'Conv.'),
            recommendations: tSidebar('recommendations', 'Insights'),
            settings: tSidebar('settings', 'Settings'),
          }}
          badges={{ recommendations: proposalCount }}
        />
        <DashboardErrorBoundary resetKey={`${activeProjectId ?? 'none'}:${activeTab}`}>
          <div className="flex min-w-0 flex-1 overflow-hidden">
            <DashboardRouter activeTab={activeTab} project={project} />
          </div>
        </DashboardErrorBoundary>
      </div>
    </div>
  );
}
