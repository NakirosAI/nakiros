import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import type { SkillDiffEntry, SkillDiffFilePayload } from '@nakiros/shared';
import SkillDiffView, {
  invalidateSkillDiffCache,
  type SkillDiffFileContent,
  type SkillDiffLabels,
} from '../diff/SkillDiffView';

interface Props {
  runId: string;
  mode: 'fix' | 'create';
  /** Changing this invalidates the diff cache so the panel re-fetches (e.g. after a new agent turn). */
  refreshKey: string;
}

export default function FixReviewPanel({ runId, mode, refreshKey }: Props) {
  const { t } = useTranslation('fix');
  const [files, setFiles] = useState<SkillDiffEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cacheScope = useMemo(() => `${mode}:${runId}:${refreshKey}`, [mode, runId, refreshKey]);

  useEffect(() => {
    let cancelled = false;
    invalidateSkillDiffCache(cacheScope);
    setFiles(null);
    setError(null);
    const load = mode === 'create' ? window.nakiros.listCreateDiff : window.nakiros.listFixDiff;
    load(runId)
      .then((entries) => {
        if (!cancelled) setFiles(entries);
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [cacheScope, mode, runId]);

  const fetchDiff = useCallback(
    async (relativePath: string): Promise<SkillDiffFileContent> => {
      const read = mode === 'create' ? window.nakiros.readCreateDiffFile : window.nakiros.readFixDiffFile;
      const payload: SkillDiffFilePayload = await read(runId, relativePath);
      return {
        originalContent: payload.originalContent,
        modifiedContent: payload.modifiedContent,
        isBinary: payload.isBinary,
      };
    },
    [mode, runId],
  );

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 text-xs text-red-400">
        {t('review.listFailed', { message: error })}
      </div>
    );
  }

  if (files == null) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-xs text-[var(--text-muted)]">
        <Loader2 size={12} className="animate-spin" />
        {t('review.loading')}
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 text-xs text-[var(--text-muted)]">
        {mode === 'create' ? t('review.emptyCreate') : t('review.emptyFix')}
      </div>
    );
  }

  const labels: SkillDiffLabels = {
    filesPanelTitle: t('review.filesPanelTitle'),
    originalColumn: t('review.originalColumn'),
    modifiedColumn: t('review.modifiedColumn'),
    missingFile: t('review.missingFile'),
    binaryNotice: t('review.binaryNotice'),
    identicalNotice: t('review.identicalNotice'),
    loading: t('review.diffLoading'),
    errorTemplate: (message) => t('review.diffFailed', { message }),
    emptyState: t('review.pickFile'),
    sideOriginalOnly: t('review.sideRemoved'),
    sideModifiedOnly: t('review.sideAdded'),
    sideBoth: t('review.sideModified'),
    addedLinesLabel: (count) => t('review.addedLines', { count }),
    removedLinesLabel: (count) => t('review.removedLines', { count }),
  };

  return (
    <div className="flex flex-1 overflow-hidden">
      <SkillDiffView cacheScope={cacheScope} files={files} fetchDiff={fetchDiff} labels={labels} />
    </div>
  );
}
