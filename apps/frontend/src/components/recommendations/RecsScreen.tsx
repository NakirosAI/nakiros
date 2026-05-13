import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RecommendationPattern } from '@nakiros/shared';
import { PatternList } from './PatternList';
import { PatternDetail } from './PatternDetail';

interface Props {
  projectId: string;
  /** Called when the user applies a reco card — opens the downstream run tab. */
  onRunOpen(runId: string): void;
  /** Called when the user clicks Analyser — opens the recommendation-analyze run tab. */
  onAnalyzeRunOpen(runId: string): void;
}

/**
 * 2-column screen: pattern list (left) + selected pattern detail (right).
 * Loads patterns on mount; Refresh re-runs the daemon-side clustering.
 */
export function RecsScreen({ projectId, onRunOpen, onAnalyzeRunOpen }: Props) {
  const { t } = useTranslation('recommendations');
  const [patterns, setPatterns] = useState<RecommendationPattern[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const list = await window.nakiros.listRecommendationPatterns(projectId);
    setPatterns(list);
    if (list.length > 0 && !selectedId) setSelectedId(list[0].id);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const handleRefresh = async () => {
    setLoading(true);
    await window.nakiros.refreshRecommendations(projectId);
    await load();
  };

  const selected = patterns.find((p) => p.id === selectedId) ?? null;

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between px-6 py-3 border-b border-n-border-subtle">
        <h1 className="text-lg font-n-sans text-n-fg">{t('title')}</h1>
        <button
          type="button"
          onClick={() => void handleRefresh()}
          disabled={loading}
          className="text-sm px-3 py-1.5 rounded border border-n-border-subtle hover:bg-n-raised disabled:opacity-50"
        >
          {t('refresh')}
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-80 border-r border-n-border-subtle overflow-auto">
          <PatternList
            patterns={patterns}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </aside>
        <main className="flex-1 overflow-hidden">
          {selected ? (
            <PatternDetail
              projectId={projectId}
              pattern={selected}
              onRunOpen={onRunOpen}
              onAnalyzeRunOpen={onAnalyzeRunOpen}
              onPatternsRefresh={() => void load()}
            />
          ) : (
            <div className="p-6 text-sm text-n-muted">{t('emptyState')}</div>
          )}
        </main>
      </div>
    </div>
  );
}
