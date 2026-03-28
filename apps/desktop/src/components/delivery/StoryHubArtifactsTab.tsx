import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileX } from 'lucide-react';
import type { StoredWorkspace } from '@nakiros/shared';
import { Button } from '@/components/ui/button';

type ArtifactType = 'context' | 'dev-notes';

interface ArtifactCandidate {
  path: string;
  type: ArtifactType;
  repoName: string;
}

interface ExistingArtifact extends ArtifactCandidate {
  filename: string;
}

interface Props {
  story: BacklogStory;
  workspace: StoredWorkspace;
}

export default function StoryHubArtifactsTab({ story, workspace }: Props) {
  const { t } = useTranslation('delivery');
  const [artifacts, setArtifacts] = useState<ExistingArtifact[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storyId = story.externalId ?? story.id.slice(0, 8);

    const candidates: ArtifactCandidate[] = workspace.repos.flatMap((repo) => [
      {
        path: `${repo.localPath}/_nakiros/tickets/${storyId}.md`,
        type: 'context' as const,
        repoName: repo.name,
      },
      {
        path: `${repo.localPath}/_nakiros/dev-notes/${storyId}.md`,
        type: 'dev-notes' as const,
        repoName: repo.name,
      },
    ]);

    const check = async () => {
      const results = await Promise.allSettled(
        candidates.map(async (candidate) => {
          await window.nakiros.readDoc(candidate.path);
          return {
            ...candidate,
            filename: candidate.path.split('/').pop() ?? candidate.path,
          };
        })
      );
      const existing = results
        .filter((r): r is PromiseFulfilledResult<ExistingArtifact> => r.status === 'fulfilled')
        .map((r) => r.value);
      setArtifacts(existing);
    };

    check().finally(() => setIsLoading(false));
  }, [story.id, story.externalId, workspace.repos]);

  const TYPE_LABELS: Record<ArtifactType, string> = {
    context: t('artifacts.typeContext'),
    'dev-notes': t('artifacts.typeDevNotes'),
  };

  if (isLoading) {
    return (
      <div className="h-12 rounded-md bg-[var(--bg-muted)] animate-pulse mx-4 mt-4" />
    );
  }

  if (artifacts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
        <FileX size={24} className="text-[var(--text-muted)]" />
        <p className="text-sm font-medium text-[var(--text)]">{t('artifacts.emptyTitle')}</p>
        <p className="text-xs text-[var(--text-muted)]">{t('artifacts.emptyDesc')}</p>
      </div>
    );
  }

  return (
    <div className="p-4 overflow-y-auto h-full flex flex-col gap-2">
      {artifacts.map((artifact) => (
        <div
          key={artifact.path}
          className="flex items-center justify-between px-4 py-3 rounded-lg border border-[var(--line)] bg-[var(--bg-card)]"
        >
          <div className="flex flex-col min-w-0">
            <p className="text-sm font-medium text-[var(--text)] truncate">{artifact.filename}</p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              {TYPE_LABELS[artifact.type]}
              {workspace.repos.length > 1 && ` · ${artifact.repoName}`}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void window.nakiros.openPath(artifact.path)}
          >
            {t('artifacts.openButton')}
          </Button>
        </div>
      ))}
    </div>
  );
}
