import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { StoredConversation, StoredWorkspace } from '@nakiros/shared';
import { EmptyPanel } from '../context/ContextPanelParts';
import { PlayCircle } from 'lucide-react';

interface Props {
  story: BacklogStory;
  workspace: StoredWorkspace;
}

function getRunStatus(run: StoredConversation): 'running' | 'failed' | 'completed' {
  if (run.participants.length === 0) return 'completed';
  if (run.participants.some((p) => p.status === 'running' || p.status === 'waiting')) {
    return 'running';
  }
  if (run.participants.some((p) => p.status === 'error')) {
    return 'failed';
  }
  return 'completed';
}

function formatDuration(createdAt: string, lastUsedAt: string): string {
  const durationMs = new Date(lastUsedAt).getTime() - new Date(createdAt).getTime();
  const totalSeconds = Math.round(durationMs / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}min ${seconds}s` : `${minutes}min`;
}

export default function StoryHubExecutionTab({ story, workspace }: Props) {
  const { t, i18n } = useTranslation('delivery');
  const [conversations, setConversations] = useState<StoredConversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    void window.nakiros
      .getConversations(workspace.id)
      .then(setConversations)
      .catch(() => setConversations([]))
      .finally(() => setIsLoading(false));
  }, [workspace.id]);

  const storyLabel = story.externalId ?? story.id.slice(0, 8);
  const storyRuns = conversations
    .filter((c) => c.title === storyLabel)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const locale = i18n.language === 'fr' ? fr : undefined;

  if (isLoading) {
    return (
      <div>
        <div className="h-12 rounded-md bg-[var(--bg-muted)] animate-pulse mx-4 mt-4" />
      </div>
    );
  }

  if (storyRuns.length === 0) {
    return (
      <div className="p-4 h-full">
        <EmptyPanel
          icon={<PlayCircle size={24} />}
          title={t('execution.emptyTitle')}
          subtitle={t('execution.emptyDesc')}
        />
      </div>
    );
  }

  return (
    <div className="overflow-y-auto h-full">
      {storyRuns.map((run) => {
        const status = getRunStatus(run);
        const agentName =
          run.agents[0] ?? run.participants[0]?.agentId ?? t('execution.unknownAgent');
        const startTime = formatDistanceToNow(new Date(run.createdAt), {
          addSuffix: true,
          locale,
        });
        const duration = formatDuration(run.createdAt, run.lastUsedAt);

        return (
          <div
            key={run.id}
            className="flex items-center justify-between px-4 py-3 border-b border-[var(--line)] last:border-0"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[var(--text)] truncate">{agentName}</p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                {startTime} · {duration}
              </p>
            </div>
            <div className="ml-2 shrink-0">
              {status === 'running' && (
                <span className="flex items-center gap-1 text-xs text-teal-500">
                  <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
                  {t('execution.statusRunning')}
                </span>
              )}
              {status === 'failed' && (
                <span className="text-xs font-medium text-red-500">
                  {t('execution.statusFailed')}
                </span>
              )}
              {status === 'completed' && (
                <span className="text-xs font-medium text-green-600">
                  {t('execution.statusCompleted')}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
