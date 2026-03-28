import { Badge } from '../ui';

const PRIORITY_VARIANT: Record<string, 'danger' | 'warning' | 'muted'> = {
  high: 'danger',
  medium: 'warning',
  low: 'muted',
};

interface Props {
  story: BacklogStory;
  onClick: () => void;
  isSelected: boolean;
}

export default function SprintStoryCard({ story, onClick, isSelected }: Props) {
  const displayId = story.externalId ?? story.id.slice(0, 8);
  const initials = story.assignee
    ? story.assignee.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
      className={`flex cursor-pointer flex-col gap-2 rounded-lg border bg-[var(--bg-card)] p-3 text-left transition-colors hover:border-[var(--primary)] ${isSelected ? 'border-[var(--primary)]' : 'border-[var(--line)]'}`}
    >
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-[10px] font-mono text-[var(--text-muted)]">{displayId}</span>
        <Badge variant={PRIORITY_VARIANT[story.priority] ?? 'muted'}>{story.priority.toUpperCase()}</Badge>
        {initials && (
          <span className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[9px] font-bold text-[var(--primary)]">
            {initials}
          </span>
        )}
      </div>
      <p className="line-clamp-2 text-sm text-[var(--text)]">{story.title}</p>
      <div className="flex items-center gap-2">
        {/* TODO: Epic 8 — fetch task count per story */}
        <span className="text-[11px] text-[var(--text-muted)]">0 tasks</span>
        {/* TODO: Epic 8 — pulsing teal dot if agent running on task */}
      </div>
    </div>
  );
}
