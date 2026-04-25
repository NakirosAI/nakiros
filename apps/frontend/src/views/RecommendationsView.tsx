import { useTranslation } from 'react-i18next';
import { Lightbulb } from 'lucide-react';
import type { Project } from '@nakiros/shared';

interface Props {
  /** Project displayed in the placeholder body copy. */
  project: Project;
}

/**
 * Placeholder dashboard tab for the upcoming "Insights" / proposal-engine
 * surface (friction → skill recommendations). Currently renders only a header
 * and a "coming soon" notice for the active project; reached via
 * `DashboardRouter` → "recommendations" route.
 */
export default function RecommendationsView({ project }: Props) {
  const { t } = useTranslation('recommendations');
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
      <div className="rounded-full bg-[var(--bg-muted)] p-4">
        <Lightbulb size={32} className="text-[var(--text-muted)]" />
      </div>
      <h2 className="text-lg font-bold text-[var(--text-primary)]">{t('title')}</h2>
      <p className="max-w-md text-center text-sm text-[var(--text-muted)]">
        {t('bodyPrefix')}<strong>{project.name}</strong>{t('bodySuffix')}
      </p>
      <div className="mt-4 rounded-lg border border-dashed border-[var(--line-strong)] px-4 py-3 text-xs text-[var(--text-muted)]">
        {t('comingSoon')}
      </div>
    </div>
  );
}
