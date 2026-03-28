import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { OnboardingChatLaunchRequest, StoredWorkspace } from '@nakiros/shared';
import SprintBoard from '../components/delivery/SprintBoard';
import StoryHubPanel from '../components/delivery/StoryHubPanel';

interface Props {
  workspace: StoredWorkspace;
  onLaunchChat: (request: OnboardingChatLaunchRequest) => void;
}

export default function DeliveryView({ workspace, onLaunchChat }: Props) {
  const { t } = useTranslation('delivery');

  const [sprints, setSprints] = useState<BacklogSprint[]>([]);
  const [stories, setStories] = useState<BacklogStory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedStory, setSelectedStory] = useState<BacklogStory | null>(null);

  function fetchData() {
    setIsLoading(true);
    setLoadError(null);

    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      if (!cancelled) setLoadError('timeout');
    }, 10_000);

    void Promise.all([
      window.nakiros.backlogGetSprints(workspace.id),
      window.nakiros.backlogGetStories(workspace.id),
    ])
      .then(([fetchedSprints, fetchedStories]) => {
        if (cancelled) return;
        setSprints(fetchedSprints);
        setStories(fetchedStories);
        setLoadError(null);
      })
      .catch(() => {
        if (!cancelled) setLoadError('fetch_failed');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
        window.clearTimeout(timeoutId);
      });

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }

  useEffect(() => {
    return fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.id]);

  const activeSprint = sprints.find((s) => s.status === 'active') ?? null;
  const boardStories = activeSprint
    ? stories.filter((s) => s.sprintId === activeSprint.id && s.status !== 'backlog')
    : [];

  return (
    <div className="flex min-w-0 flex-1 overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Error banner */}
        {loadError && (
          <div className="flex shrink-0 items-center gap-3 border-b border-[var(--line)] bg-[var(--bg-soft)] px-4 py-2">
            <span className="flex-1 text-sm text-[var(--text-muted)]">{t('errorLoadingBoard')}</span>
            <button
              type="button"
              onClick={fetchData}
              className="text-sm font-medium text-[var(--primary)] hover:underline"
            >
              {t('errorLoadingBoard')}
            </button>
          </div>
        )}

        {/* No active sprint */}
        {!isLoading && !activeSprint && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8">
            <p className="text-base font-semibold text-[var(--text)]">{t('noActiveSprint')}</p>
            <p className="text-sm text-[var(--text-muted)]">{t('noActiveSprintDesc')}</p>
          </div>
        )}

        {/* Board */}
        {(isLoading || activeSprint) && (
          <SprintBoard
            stories={boardStories}
            isLoading={isLoading}
            onSelectStory={setSelectedStory}
            selectedStoryId={selectedStory?.id}
          />
        )}
      </div>

      {/* Story Hub side panel */}
      {selectedStory && (
        <StoryHubPanel story={selectedStory} onClose={() => setSelectedStory(null)} onLaunchChat={onLaunchChat} workspace={workspace} />
      )}
    </div>
  );
}
