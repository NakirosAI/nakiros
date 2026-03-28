import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { Badge, Button } from '../ui';
import SprintLifecycleControls from './SprintLifecycleControls';

interface SprintPanelProps {
  sprints: BacklogSprint[];
  stories: BacklogStory[];
  onCreateClick(): void;
  onRemoveStory(storyId: string): Promise<void>;
  onStartSprint(sprintId: string): void;
  onCompleteSprint(sprint: BacklogSprint): void;
}

const STATUS_CLASSES: Record<BacklogSprint['status'], string> = {
  planning: 'bg-blue-100 text-blue-700',
  active: 'bg-green-100 text-green-700',
  completed: 'bg-gray-100 text-gray-500',
};

function formatDate(ms: number | null): string {
  if (ms == null) return '';
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function SprintCard({
  sprint,
  stories,
  onRemoveStory,
  onStartSprint,
  onCompleteSprint,
}: {
  sprint: BacklogSprint;
  stories: BacklogStory[];
  onRemoveStory(storyId: string): Promise<void>;
  onStartSprint(sprintId: string): void;
  onCompleteSprint(sprint: BacklogSprint): void;
}) {
  const { t } = useTranslation('backlog');
  const [expanded, setExpanded] = useState(false);

  const sprintStories = stories.filter((s) => s.sprintId === sprint.id);
  const dateRange =
    sprint.startDate || sprint.endDate
      ? [formatDate(sprint.startDate), formatDate(sprint.endDate)].filter(Boolean).join(' → ')
      : null;

  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--bg-card)]">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? <ChevronDown size={14} className="shrink-0 text-[var(--text-muted)]" /> : <ChevronRight size={14} className="shrink-0 text-[var(--text-muted)]" />}
        <span className="flex-1 truncate text-sm font-semibold text-[var(--text)]">{sprint.name}</span>
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_CLASSES[sprint.status]}`}>
          {t(`sprintStatus${sprint.status.charAt(0).toUpperCase()}${sprint.status.slice(1)}` as 'sprintStatusPlanning' | 'sprintStatusActive' | 'sprintStatusCompleted')}
        </span>
        {dateRange && (
          <span className="shrink-0 text-[11px] text-[var(--text-muted)]">{dateRange}</span>
        )}
        <span className="shrink-0 text-[11px] text-[var(--text-muted)]">
          {t('storiesCount', { count: sprintStories.length })}
        </span>
        <SprintLifecycleControls
          sprint={sprint}
          storyCount={sprintStories.length}
          onStart={() => onStartSprint(sprint.id)}
          onComplete={() => onCompleteSprint(sprint)}
        />
      </button>

      {expanded && (
        <div className="flex flex-col gap-1 border-t border-[var(--line)] px-3 py-2">
          {sprint.goal && (
            <p className="mb-1 text-xs text-[var(--text-muted)]">{sprint.goal}</p>
          )}
          {sprintStories.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">{t('noSprintStories')}</p>
          ) : (
            sprintStories.map((story) => (
              <div key={story.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-[var(--bg-soft)]">
                <span className="min-w-0 flex-1 truncate text-sm text-[var(--text)]">{story.title}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 shrink-0 px-2 text-[10px] text-[var(--text-muted)]"
                  onClick={() => void onRemoveStory(story.id)}
                >
                  {t('removeFromSprint')}
                </Button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function SprintPanel({ sprints, stories, onCreateClick, onRemoveStory, onStartSprint, onCompleteSprint }: SprintPanelProps) {
  const { t } = useTranslation('backlog');

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-[var(--text)]">{t('sprintSectionTitle')}</span>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-6 px-2 text-xs"
          onClick={onCreateClick}
        >
          <Plus size={12} />
          {t('newSprintButton')}
        </Button>
      </div>

      {sprints.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">{t('noSprintsEmpty')}</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {sprints.map((sprint) => (
            <SprintCard
              key={sprint.id}
              sprint={sprint}
              stories={stories}
              onRemoveStory={onRemoveStory}
              onStartSprint={onStartSprint}
              onCompleteSprint={onCompleteSprint}
            />
          ))}
        </div>
      )}
    </div>
  );
}
