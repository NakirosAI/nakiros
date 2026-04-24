import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { Proposal } from '@nakiros/shared';

import SkillDiffView, {
  type SkillDiffFileContent,
  type SkillDiffFileEntry,
  type SkillDiffLabels,
} from '../diff/SkillDiffView';

interface Props {
  proposal: Proposal;
}

// ---------------------------------------------------------------------------
// ProposalDiffView — side-by-side SKILL.md diff for a proposal, reusing the
// SkillDiffView that fix/create already relies on. For `patch` proposals,
// original = snapshot of the existing skill at generation time; modified =
// the drafted replacement. For `new` proposals, only the modified side has
// content (the file is "added").
//
// The proposal draft is already in memory (we loaded it to render the card),
// so `fetchDiff` is a pure synchronous resolve rather than an IPC round-trip.
// ---------------------------------------------------------------------------

export function ProposalDiffView({ proposal }: Props) {
  const { t } = useTranslation('recommendations');

  const isPatch = proposal.type === 'patch';

  const files: SkillDiffFileEntry[] = useMemo(
    () => [
      {
        relativePath: 'SKILL.md',
        inOriginal: isPatch && typeof proposal.draft.originalContent === 'string',
        inModified: true,
      },
    ],
    [isPatch, proposal.draft.originalContent],
  );

  const fetchDiff = useCallback(
    async (_relativePath: string): Promise<SkillDiffFileContent> => ({
      originalContent: proposal.draft.originalContent ?? null,
      modifiedContent: proposal.draft.content,
      isBinary: false,
    }),
    [proposal.draft.originalContent, proposal.draft.content],
  );

  const labels: SkillDiffLabels = useMemo(
    () => ({
      filesPanelTitle: t('diff.filesPanelTitle'),
      originalColumn: t('diff.originalColumn'),
      modifiedColumn: t('diff.modifiedColumn'),
      missingFile: t('diff.missingFile'),
      binaryNotice: t('diff.binaryNotice'),
      identicalNotice: t('diff.identicalNotice'),
      loading: t('diff.loading'),
      errorTemplate: (message: string) => t('diff.errorTemplate', { message }),
      emptyState: t('diff.emptyState'),
      sideOriginalOnly: t('diff.sideOriginalOnly'),
      sideModifiedOnly: t('diff.sideModifiedOnly'),
      sideBoth: t('diff.sideBoth'),
      addedLinesLabel: (count: number) => `+${count}`,
      removedLinesLabel: (count: number) => `-${count}`,
    }),
    [t],
  );

  return (
    <div className="h-[480px] overflow-hidden rounded-md border border-[var(--line)]">
      <SkillDiffView
        files={files}
        fetchDiff={fetchDiff}
        labels={labels}
        cacheScope={`proposal-${proposal.id}-${proposal.updatedAt}`}
      />
    </div>
  );
}
