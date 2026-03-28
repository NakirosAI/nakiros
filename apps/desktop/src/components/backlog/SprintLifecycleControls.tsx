import { useTranslation } from 'react-i18next';
import { Button } from '../ui';

interface SprintLifecycleControlsProps {
  sprint: BacklogSprint;
  storyCount: number;
  onStart(): void;
  onComplete(): void;
}

export default function SprintLifecycleControls({ sprint, storyCount, onStart, onComplete }: SprintLifecycleControlsProps) {
  const { t } = useTranslation('backlog');

  if (sprint.status === 'planning') {
    return (
      <Button
        size="sm"
        className="h-6 shrink-0 px-2 text-xs"
        onClick={(e) => { e.stopPropagation(); onStart(); }}
        disabled={storyCount === 0}
      >
        {t('startSprintButton')}
      </Button>
    );
  }

  if (sprint.status === 'active') {
    return (
      <Button
        size="sm"
        variant="outline"
        className="h-6 shrink-0 px-2 text-xs text-destructive hover:bg-destructive hover:text-destructive-foreground"
        onClick={(e) => { e.stopPropagation(); onComplete(); }}
      >
        {t('completeSprintButton')}
      </Button>
    );
  }

  return null;
}
