import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import type { OnboardingChatLaunchRequest, StoredWorkspace } from '@nakiros/shared';
import StoryHubDefinitionTab from './StoryHubDefinitionTab';
import StoryHubContextTab from './StoryHubContextTab';
import StoryHubExecutionTab from './StoryHubExecutionTab';
import StoryHubArtifactsTab from './StoryHubArtifactsTab';

type Tab = 'definition' | 'context' | 'execution' | 'artifacts';

interface Props {
  story: BacklogStory;
  onClose: () => void;
  onLaunchChat: (request: OnboardingChatLaunchRequest) => void;
  workspace: StoredWorkspace;
  onNavigateToProduct?: () => void;
}

export default function StoryHubPanel({ story, onClose, onLaunchChat, workspace, onNavigateToProduct }: Props) {
  const { t } = useTranslation('delivery');
  const [activeTab, setActiveTab] = useState<Tab>('definition');

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const TABS: Array<{ id: Tab; labelKey: string }> = [
    { id: 'definition', labelKey: 'tabDefinition' },
    { id: 'context', labelKey: 'tabContext' },
    { id: 'execution', labelKey: 'tabExecution' },
    { id: 'artifacts', labelKey: 'tabArtifacts' },
  ];

  return (
    <div className="flex w-80 shrink-0 flex-col border-l border-[var(--line)] bg-[var(--bg-card)]">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-[var(--line)] px-4 py-3">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--text)]">{story.title}</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="shrink-0 rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-muted)] hover:text-[var(--text)]"
        >
          <X size={14} />
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex shrink-0 border-b border-[var(--line)] px-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-2 text-[11px] font-medium transition-colors ${
              activeTab === tab.id
                ? 'border-b-2 border-[var(--primary)] text-[var(--primary)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            {t(tab.labelKey as Parameters<typeof t>[0])}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'definition' && (
          <StoryHubDefinitionTab story={story} onLaunchChat={onLaunchChat} />
        )}
        {activeTab === 'context' && (
          <StoryHubContextTab workspace={workspace} onNavigateToProduct={onNavigateToProduct} />
        )}
        {activeTab === 'execution' && (
          <StoryHubExecutionTab story={story} workspace={workspace} />
        )}
        {activeTab === 'artifacts' && (
          <StoryHubArtifactsTab story={story} workspace={workspace} />
        )}
      </div>
    </div>
  );
}
