import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { OnboardingChatLaunchRequest } from '@nakiros/shared';
import { Badge } from '../ui';

const PRIORITY_VARIANT: Record<string, 'danger' | 'warning' | 'muted'> = {
  high: 'danger',
  medium: 'warning',
  low: 'muted',
};

interface Props {
  story: BacklogStory;
  onLaunchChat: (request: OnboardingChatLaunchRequest) => void;
  hasTasks?: boolean;
}

export default function StoryHubDefinitionTab({ story, onLaunchChat, hasTasks = false }: Props) {
  const { t } = useTranslation('delivery');
  const [showDecomposePlaceholder, setShowDecomposePlaceholder] = useState(false);

  const initials = story.assignee
    ? story.assignee
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : null;

  function handleLaunchDevStory() {
    const storyLabel = story.externalId ?? story.id.slice(0, 8);
    const command = '/nak-workflow-dev-story';
    const initialMessage = [
      command,
      '',
      `Story: ${storyLabel}`,
      `Title: ${story.title}`,
      `Priority: ${story.priority}`,
      ...(story.description ? [`Description: ${story.description}`, ''] : []),
      `Acceptance Criteria:`,
      ...((story.acceptanceCriteria && story.acceptanceCriteria.length > 0)
        ? story.acceptanceCriteria.map((ac) => `- ${ac}`)
        : [`- (to complete)`]),
    ].join('\n');
    onLaunchChat({
      requestId: crypto.randomUUID(),
      title: storyLabel,
      agentId: 'dev-story',
      command,
      initialMessage,
    });
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Title */}
      <h2 className="text-base font-semibold text-[var(--text)]">{story.title}</h2>

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={PRIORITY_VARIANT[story.priority] ?? 'muted'}>{story.priority.toUpperCase()}</Badge>
        <Badge variant="muted">{t(`definition.status_${story.status}` as Parameters<typeof t>[0])}</Badge>
        {story.storyPoints != null && (
          <span className="text-xs text-[var(--text-muted)]">{t('definition.storyPoints', { count: story.storyPoints })}</span>
        )}
        <div className="ml-auto">
          {initials ? (
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--primary)] text-[10px] font-bold text-white">
              {initials}
            </span>
          ) : (
            <span className="text-sm text-[var(--text-muted)]">{t('definition.unassigned')}</span>
          )}
        </div>
      </div>

      {/* Description */}
      <div>
        {story.description ? (
          <div className="prose prose-sm max-w-none text-[var(--text)]">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{story.description}</ReactMarkdown>
          </div>
        ) : (
          <p className="text-sm text-[var(--text-muted)]">{t('definition.noDescription')}</p>
        )}
      </div>

      {/* Decompose CTA — TODO: Epic 8 — open task decomposition panel */}
      {!hasTasks && (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => setShowDecomposePlaceholder(true)}
            className="w-full rounded-[10px] border border-[var(--line)] bg-transparent px-3 py-2 text-xs font-medium text-[var(--text-muted)] hover:border-[var(--primary)] hover:text-[var(--text)]"
          >
            {t('definition.decomposeTasks')}
          </button>
          {showDecomposePlaceholder && (
            <p className="text-xs text-[var(--text-muted)]">{t('definition.decomposePlaceholder')}</p>
          )}
        </div>
      )}

      {/* Acceptance criteria */}
      <div>
        {story.acceptanceCriteria && story.acceptanceCriteria.length > 0 ? (
          <ol className="list-decimal space-y-1 pl-4 text-sm text-[var(--text)]">
            {story.acceptanceCriteria.map((ac, i) => (
              <li key={i}>{ac}</li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-[var(--text-muted)]">{t('definition.noAcceptanceCriteria')}</p>
        )}
      </div>

      {/* Launch Dev Story CTA */}
      <button
        type="button"
        onClick={handleLaunchDevStory}
        className="w-full rounded-[10px] border-none bg-[var(--primary)] px-3 py-2 text-xs font-bold text-white"
      >
        {t('definition.launchDevStory')}
      </button>
    </div>
  );
}
