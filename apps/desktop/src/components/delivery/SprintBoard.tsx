import { useTranslation } from 'react-i18next';
import SprintStoryCard from './SprintStoryCard';

interface Column {
  id: string;
  labelKey: string;
}

const COLUMNS: Column[] = [
  { id: 'todo', labelKey: 'columnTodo' },
  { id: 'in_progress', labelKey: 'columnInProgress' },
  { id: 'in_review', labelKey: 'columnInReview' },
  { id: 'done', labelKey: 'columnDone' },
];

interface Props {
  stories: BacklogStory[];
  isLoading: boolean;
  onSelectStory: (story: BacklogStory) => void;
  selectedStoryId?: string;
}

function SkeletonCard() {
  return <div className="h-20 animate-pulse rounded-lg bg-[var(--line)]" />;
}

export default function SprintBoard({ stories, isLoading, onSelectStory, selectedStoryId }: Props) {
  const { t } = useTranslation('delivery');

  return (
    <div className="flex h-full gap-3 overflow-x-auto p-4">
      {COLUMNS.map((col) => {
        const colStories = stories
          .filter((s) => s.status === col.id)
          .sort((a, b) => a.rank - b.rank);

        return (
          <div key={col.id} className="flex w-64 shrink-0 flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-[var(--text)]">{t(col.labelKey as Parameters<typeof t>[0])}</span>
              <span className="rounded bg-[var(--bg-muted)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--text-muted)]">
                {isLoading ? '—' : colStories.length}
              </span>
            </div>
            <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
              {isLoading
                ? [1, 2, 3].map((i) => <SkeletonCard key={i} />)
                : colStories.map((story) => (
                    <SprintStoryCard
                      key={story.id}
                      story={story}
                      onClick={() => onSelectStory(story)}
                      isSelected={story.id === selectedStoryId}
                    />
                  ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
