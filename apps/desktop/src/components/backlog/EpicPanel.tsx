import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Layers, Pencil, Plus, Rows3 } from 'lucide-react';
import { Badge, Button } from '../ui';

interface EpicPanelProps {
  epics: BacklogEpic[];
  stories: BacklogStory[];
  onCreateClick: () => void;
  onEditClick: (epic: BacklogEpic) => void;
  onAddStoryClick: (epicId: string) => void;
}

const STATUS_VARIANT: Record<BacklogEpic['status'], 'muted' | 'warning' | 'success'> = {
  backlog: 'muted',
  in_progress: 'warning',
  done: 'success',
};

const STATUS_LABEL_KEY: Record<BacklogEpic['status'], 'epicStatusBacklog' | 'epicStatusInProgress' | 'epicStatusDone'> = {
  backlog: 'epicStatusBacklog',
  in_progress: 'epicStatusInProgress',
  done: 'epicStatusDone',
};

export default function EpicPanel({ epics, stories, onCreateClick, onEditClick, onAddStoryClick }: EpicPanelProps) {
  const { t } = useTranslation('backlog');

  const sortedEpics = useMemo(
    () => [...epics].sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name)),
    [epics],
  );

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-[var(--text)]">{t('epicSectionTitle')}</span>
        <Badge variant="info">{t('epicCount', { count: epics.length })}</Badge>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-6 px-2 text-xs"
          onClick={onCreateClick}
        >
          <Plus size={12} />
          {t('newEpicButton')}
        </Button>
      </div>

      {sortedEpics.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--line-strong)] bg-[var(--bg-soft)] p-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)]">
              <Layers size={16} />
            </span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-[var(--text)]">{t('noEpicsEmpty')}</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">{t('noEpicsHint')}</p>
            </div>
            <Button size="sm" onClick={onCreateClick}>
              {t('newEpicButton')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {sortedEpics.map((epic) => {
            const epicStories = stories.filter((story) => story.epicId === epic.id);
            const backlogCount = epicStories.filter((story) => story.sprintId === null).length;
            const inSprintCount = epicStories.length - backlogCount;

            return (
              <div
                key={epic.id}
                role="button"
                tabIndex={0}
                className="group flex flex-col gap-3 rounded-xl border border-[var(--line)] bg-[var(--bg-card)] p-4 text-left transition-colors hover:border-[var(--primary)]"
                onClick={() => onEditClick(epic)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onEditClick(epic);
                  }
                }}
              >
                <div className="flex items-start gap-3">
                  <span
                    className="mt-1 h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: epic.color ?? 'var(--line-strong)' }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-[var(--text)]">{epic.name}</span>
                      <Badge variant={STATUS_VARIANT[epic.status]} className="shrink-0">
                        {t(STATUS_LABEL_KEY[epic.status])}
                      </Badge>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-[var(--text-muted)]">
                      {epic.description?.trim() || t('epicDescriptionEmpty')}
                    </p>
                  </div>
                  <span className="text-[var(--text-muted)] transition-colors group-hover:text-[var(--primary)]">
                    <Pencil size={14} />
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg bg-[var(--bg-soft)] px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{t('storiesLabel')}</div>
                    <div className="mt-1 text-sm font-semibold text-[var(--text)]">{epicStories.length}</div>
                  </div>
                  <div className="rounded-lg bg-[var(--bg-soft)] px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{t('backlogLabel')}</div>
                    <div className="mt-1 text-sm font-semibold text-[var(--text)]">{backlogCount}</div>
                  </div>
                  <div className="rounded-lg bg-[var(--bg-soft)] px-3 py-2">
                    <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                      <Rows3 size={10} />
                      {t('inSprintLabel')}
                    </div>
                    <div className="mt-1 text-sm font-semibold text-[var(--text)]">{inSprintCount}</div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={(event) => {
                      event.stopPropagation();
                      onAddStoryClick(epic.id);
                    }}
                  >
                    <Plus size={12} />
                    {t('addStory')}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
