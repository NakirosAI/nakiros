import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '../ui';

type SelectedIssueRef =
  | { type: 'epic'; id: string }
  | { type: 'story'; id: string }
  | null;

interface BacklogIssueSectionProps {
  title: string;
  badge?: string;
  subtitle?: string;
  belowHeader?: ReactNode;
  stories: BacklogStory[];
  epicsById: Map<string, BacklogEpic>;
  selectedIssue: SelectedIssueRef;
  selectedStoryIds: Set<string>;
  onSelectEpic: (epic: BacklogEpic) => void;
  onSelectStory: (story: BacklogStory) => void;
  onToggleStorySelection: (storyId: string) => void;
  emptyLabel: string;
  action?: ReactNode;
  creationRow?: ReactNode;
}

function IssueTypeBadge({ type }: { type: 'epic' | 'story' }) {
  const config = type === 'epic'
    ? {
        label: 'EPIC',
        classes: 'bg-[var(--primary-soft)] text-[var(--primary)]',
      }
    : {
        label: 'STORY',
        classes: 'bg-[var(--bg-soft)] text-[var(--success)]',
      };

  return (
    <span className={`inline-flex min-w-[52px] items-center justify-center rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${config.classes}`}>
      {config.label}
    </span>
  );
}

function StatusBadge({ value, label }: { value: string; label: string }) {
  const className = value === 'done'
    ? 'bg-[var(--bg-soft)] text-[var(--success)]'
    : value === 'in_progress' || value === 'in_review'
      ? 'bg-[var(--bg-soft)] text-[var(--warning)]'
      : 'bg-[var(--bg-soft)] text-[var(--text-muted)]';

  return (
    <span className={`inline-flex rounded-md px-2 py-1 text-[11px] font-semibold ${className}`}>
      {label}
    </span>
  );
}

function PriorityBadge({ value, label }: { value: BacklogStory['priority']; label: string }) {
  const className = value === 'high'
    ? 'text-[var(--danger)]'
    : value === 'medium'
      ? 'text-[var(--warning)]'
      : 'text-[var(--primary)]';

  return (
    <span className={`inline-flex items-center gap-2 text-xs font-semibold ${className}`}>
      <span className="h-2 w-2 rounded-full bg-current" />
      {label}
    </span>
  );
}

function groupStoriesByEpic(stories: BacklogStory[], epicsById: Map<string, BacklogEpic>) {
  const groups = new Map<string | null, BacklogStory[]>();
  for (const story of stories) {
    const key = story.epicId ?? null;
    const current = groups.get(key) ?? [];
    current.push(story);
    groups.set(key, current);
  }

  return [...groups.entries()].sort(([leftId], [rightId]) => {
    if (leftId === null) return 1;
    if (rightId === null) return -1;
    const left = epicsById.get(leftId);
    const right = epicsById.get(rightId);
    return (left?.rank ?? 0) - (right?.rank ?? 0);
  });
}

export default function BacklogIssueSection({
  title,
  badge,
  subtitle,
  belowHeader,
  stories,
  epicsById,
  selectedIssue,
  selectedStoryIds,
  onSelectEpic,
  onSelectStory,
  onToggleStorySelection,
  emptyLabel,
  action,
  creationRow,
}: BacklogIssueSectionProps) {
  const { t } = useTranslation('backlog');
  const groups = groupStoriesByEpic(stories, epicsById);

  function getPriorityLabel(priority: BacklogStory['priority']) {
    if (priority === 'high') return t('priorityHigh');
    if (priority === 'medium') return t('priorityMedium');
    return t('priorityLow');
  }

  function getStatusLabel(status: string) {
    if (status === 'backlog') return t('storyStatusBacklog');
    if (status === 'todo') return t('storyStatusTodo');
    if (status === 'in_progress') return t('storyStatusInProgress');
    if (status === 'in_review') return t('storyStatusInReview');
    if (status === 'done') return t('storyStatusDone');
    if (status === 'planning') return t('sprintStatusPlanning');
    if (status === 'active') return t('sprintStatusActive');
    if (status === 'completed') return t('sprintStatusCompleted');
    return status;
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--bg-card)]">
      <div className="flex items-center justify-between gap-4 border-b border-[var(--line)] bg-[var(--bg-soft)] px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <h3 className="truncate text-sm font-semibold text-[var(--text)]">{title}</h3>
          {badge && <Badge variant="info">{badge}</Badge>}
          {subtitle && <span className="truncate text-xs text-[var(--text-muted)]">{subtitle}</span>}
        </div>
        {action}
      </div>

      {belowHeader}

      <div className="overflow-x-auto">
        <div className="grid min-w-[980px] grid-cols-[44px_86px_minmax(0,1fr)_160px_72px_120px_120px_88px] border-b border-[var(--line)] bg-[var(--bg-soft)] px-4 py-2 text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
          <span />
          <span>{t('columnType')}</span>
          <span>{t('columnSummary')}</span>
          <span>{t('columnEpic')}</span>
          <span>{t('columnPoints')}</span>
          <span>{t('filterPriority')}</span>
          <span>{t('columnStatus')}</span>
          <span>{t('assigneeLabel')}</span>
        </div>

        {creationRow}

        {stories.length === 0 && !creationRow && (
          <div className="px-4 py-6 text-sm text-[var(--text-muted)]">{emptyLabel}</div>
        )}

        {groups.map(([epicId, epicStories]) => {
          const epic = epicId ? (epicsById.get(epicId) ?? null) : null;
          const isEpicSelected = epic ? selectedIssue?.type === 'epic' && selectedIssue.id === epic.id : false;
          const storyCountLabel = t('sectionIssuesCount', { count: epicStories.length });

          return (
            <div key={epicId ?? '__unassigned__'} className="border-b border-[var(--line)] last:border-b-0">
              <div
                className={`grid min-w-[980px] grid-cols-[44px_86px_minmax(0,1fr)_160px_72px_120px_120px_88px] px-4 py-3 text-sm transition-colors ${isEpicSelected ? 'bg-[var(--primary-soft)]' : 'bg-[var(--bg-soft)]'}`}
              >
                <span />
                <div className="pt-0.5">
                  <IssueTypeBadge type="epic" />
                </div>
                <button
                  type="button"
                  className="min-w-0 text-left"
                  onClick={() => {
                    if (epic) onSelectEpic(epic);
                  }}
                  disabled={!epic}
                >
                  <div className="truncate font-semibold text-[var(--text)]">
                    {epic?.name ?? t('unassigned')}
                  </div>
                  <div className="truncate text-xs text-[var(--text-muted)]">
                    {epic?.description?.trim() || storyCountLabel}
                  </div>
                </button>
                <div className="truncate text-xs text-[var(--text-muted)]">{epic ? storyCountLabel : t('noEpicGroup')}</div>
                <div className="text-xs text-[var(--text-muted)]">-</div>
                <div className="text-xs text-[var(--text-muted)]">-</div>
                <div>
                  {epic ? <StatusBadge value={epic.status} label={getStatusLabel(epic.status)} /> : <span className="text-xs text-[var(--text-muted)]">-</span>}
                </div>
                <div className="text-xs text-[var(--text-muted)]">-</div>
              </div>

              {epicStories.map((story) => {
                const isSelected = selectedIssue?.type === 'story' && selectedIssue.id === story.id;

                return (
                  <div
                    key={story.id}
                    className={`grid min-w-[980px] cursor-pointer grid-cols-[44px_86px_minmax(0,1fr)_160px_72px_120px_120px_88px] border-t border-[var(--line)] px-4 py-3 text-sm transition-colors hover:bg-[var(--bg-soft)] ${isSelected ? 'bg-[var(--primary-soft)]' : 'bg-transparent'}`}
                    onClick={() => onSelectStory(story)}
                  >
                    <div className="flex items-center">
                      {story.sprintId === null ? (
                        <input
                          type="checkbox"
                          checked={selectedStoryIds.has(story.id)}
                          onChange={() => onToggleStorySelection(story.id)}
                          onClick={(event) => event.stopPropagation()}
                          className="h-4 w-4 cursor-pointer accent-[var(--primary)]"
                        />
                      ) : null}
                    </div>
                    <div className="pt-0.5">
                      <IssueTypeBadge type="story" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-medium text-[var(--text)]">{story.title}</div>
                      <div className="truncate text-xs text-[var(--text-muted)]">
                        {story.description?.trim() || t('noDescription')}
                      </div>
                    </div>
                    <div className="truncate text-xs text-[var(--text-muted)]">{epic?.name ?? t('unassigned')}</div>
                    <div className="text-xs text-[var(--text-muted)]">{story.storyPoints ?? '-'}</div>
                    <div><PriorityBadge value={story.priority} label={getPriorityLabel(story.priority)} /></div>
                    <div><StatusBadge value={story.status} label={getStatusLabel(story.status)} /></div>
                    <div className="text-xs text-[var(--text-muted)]">{story.assignee ?? '-'}</div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </section>
  );
}
