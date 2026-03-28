import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Sparkles, X } from 'lucide-react';
import type {
  ArtifactChangeMode,
  ArtifactChangeProposal,
  StoredWorkspace,
} from '@nakiros/shared';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Select, Textarea } from '../ui';
import ArtifactEditorChat from '../review/ArtifactEditorChat';
import StoryTasksPanel from './StoryTasksPanel';
import type { ArtifactReviewMutation } from '../../hooks/useArtifactReview';

export type BacklogSelectedIssue =
  | {
      type: 'epic';
      epic: BacklogEpic;
      stories: BacklogStory[];
    }
  | {
      type: 'story';
      story: BacklogStory;
      epic: BacklogEpic | null;
      sprint: BacklogSprint | null;
    };

interface BacklogDetailPanelProps {
  workspace: StoredWorkspace;
  workspaceId: string;
  issue: BacklogSelectedIssue | null;
  epics: BacklogEpic[];
  sprints: BacklogSprint[];
  onClose: () => void;
  onOpenStory: (storyId: string) => void;
  onUpdateEpic: (epicId: string, patch: UpdateEpicPayload) => Promise<void>;
  onUpdateStory: (storyId: string, patch: UpdateStoryPayload) => Promise<void>;
  onArtifactChangeProposal?: (event: {
    proposal: ArtifactChangeProposal;
    conversationId?: string | null;
    triggerMessageId?: string | null;
    baselineContentOverride?: string | null;
    alreadyApplied?: boolean;
  }) => void | Promise<void>;
  lastArtifactReviewMutation?: ArtifactReviewMutation | null;
}

const PRIORITY_OPTIONS = [
  { value: 'high', label: 'HIGH' },
  { value: 'medium', label: 'MED' },
  { value: 'low', label: 'LOW' },
];

export default function BacklogDetailPanel({
  workspace,
  workspaceId,
  issue,
  epics,
  sprints,
  onClose,
  onOpenStory,
  onUpdateEpic,
  onUpdateStory,
  onArtifactChangeProposal,
  lastArtifactReviewMutation,
}: BacklogDetailPanelProps) {
  const { t } = useTranslation('backlog');
  const { t: tContext } = useTranslation('context');

  function getStatusLabel(status: string) {
    if (status === 'backlog') return t('storyStatusBacklog');
    if (status === 'todo') return t('storyStatusTodo');
    if (status === 'in_progress') return t('storyStatusInProgress');
    if (status === 'in_review') return t('storyStatusInReview');
    if (status === 'done') return t('storyStatusDone');
    return status;
  }

  const storyStatusOptions = useMemo(
    () => [
      { value: 'backlog', label: t('storyStatusBacklog') },
      { value: 'todo', label: t('storyStatusTodo') },
      { value: 'in_progress', label: t('storyStatusInProgress') },
      { value: 'in_review', label: t('storyStatusInReview') },
      { value: 'done', label: t('storyStatusDone') },
    ],
    [t],
  );

  const epicStatusOptions = useMemo(
    () => [
      { value: 'backlog', label: t('epicStatusBacklog') },
      { value: 'in_progress', label: t('epicStatusInProgress') },
      { value: 'done', label: t('epicStatusDone') },
    ],
    [t],
  );

  const epicOptions = useMemo(
    () => [{ value: 'unassigned', label: t('unassigned') }, ...epics.map((epic) => ({ value: epic.id, label: epic.name }))],
    [epics, t],
  );

  const sprintOptions = useMemo(
    () => [{ value: 'backlog', label: t('storyBacklogPlacement') }, ...sprints.map((sprint) => ({ value: sprint.id, label: sprint.name }))],
    [sprints, t],
  );

  const [epicName, setEpicName] = useState('');
  const [epicDescription, setEpicDescription] = useState('');
  const [epicStatus, setEpicStatus] = useState<BacklogEpic['status']>('backlog');

  const [storyTitle, setStoryTitle] = useState('');
  const [storyDescription, setStoryDescription] = useState('');
  const [storyCriteria, setStoryCriteria] = useState<string[]>([]);
  const [storyPriority, setStoryPriority] = useState<BacklogStory['priority']>('medium');
  const [storyStatus, setStoryStatus] = useState<BacklogStory['status']>('backlog');
  const [storyAssignee, setStoryAssignee] = useState('');
  const [storyPoints, setStoryPoints] = useState('');
  const [storyEpicId, setStoryEpicId] = useState('unassigned');
  const [storySprintId, setStorySprintId] = useState('backlog');
  const [showAiEditor, setShowAiEditor] = useState(false);
  const [agentMode, setAgentMode] = useState<ArtifactChangeMode>('diff');

  useEffect(() => {
    if (!issue) return;
    setShowAiEditor(false);
    setAgentMode('diff');
    if (issue.type === 'epic') {
      setEpicName(issue.epic.name);
      setEpicDescription(issue.epic.description ?? '');
      setEpicStatus(issue.epic.status);
      return;
    }

    setStoryTitle(issue.story.title);
    setStoryDescription(issue.story.description ?? '');
    setStoryCriteria(issue.story.acceptanceCriteria ?? []);
    setStoryPriority(issue.story.priority);
    setStoryStatus(issue.story.status);
    setStoryAssignee(issue.story.assignee ?? '');
    setStoryPoints(issue.story.storyPoints != null ? String(issue.story.storyPoints) : '');
    setStoryEpicId(issue.story.epicId ?? 'unassigned');
    setStorySprintId(issue.story.sprintId ?? 'backlog');
  }, [issue]);

  function handleStoryCriterionChange(index: number, value: string) {
    setStoryCriteria((current) => current.map((criterion, currentIndex) => (currentIndex === index ? value : criterion)));
  }

  const artifactContext = useMemo(() => {
    if (!issue) return null;
    if (issue.type === 'epic') {
      return {
        target: {
          kind: 'backlog_epic' as const,
          workspaceId,
          id: issue.epic.id,
        },
        mode: agentMode,
        sourceSurface: 'backlog' as const,
        title: issue.epic.name,
      };
    }

    return {
      target: {
        kind: 'backlog_story' as const,
        workspaceId,
        id: issue.story.id,
      },
      mode: agentMode,
      sourceSurface: 'backlog' as const,
      title: issue.story.title,
    };
  }, [agentMode, issue, workspaceId]);

  const aiModeLabel = agentMode === 'diff' ? tContext('docEditorModeReview') : tContext('docEditorModeYolo');

  function persistStoryCriteria(criteria: string[]) {
    if (!issue || issue.type !== 'story') return;
    const cleaned = criteria.map((criterion) => criterion.trim()).filter(Boolean);
    void onUpdateStory(issue.story.id, { acceptanceCriteria: cleaned });
  }

  if (!issue) {
    return (
      <aside className="flex min-h-full flex-col bg-[var(--bg-soft)] p-5">
        <div className="rounded-2xl border border-dashed border-[var(--line-strong)] bg-[var(--bg-card)] p-5">
          <p className="text-sm font-semibold text-[var(--text)]">{t('detailEmptyTitle')}</p>
          <p className="mt-2 text-sm text-[var(--text-muted)]">{t('detailEmptySubtitle')}</p>
        </div>
      </aside>
    );
  }

  if (issue.type === 'epic') {
    return (
      <aside className="flex min-h-full flex-col bg-[var(--bg-soft)]">
        <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
          <div>
            <div className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">{t('detailPanelEpic')}</div>
            <h3 className="mt-1 text-base font-semibold text-[var(--text)]">{issue.epic.name}</h3>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose}>
            <X size={14} />
          </Button>
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="info">{tContext('docEditorChatTitle')}</Badge>
                    <Badge variant="muted">{aiModeLabel}</Badge>
                  </div>
                  <CardTitle className="mt-3 text-base">{t('aiAssistantTitle')}</CardTitle>
                  <CardDescription className="mt-1">{t('aiEpicAssistantBody')}</CardDescription>
                </div>
                <Button size="sm" variant={showAiEditor ? 'default' : 'outline'} onClick={() => setShowAiEditor((current) => !current)}>
                  <Sparkles data-icon="inline-start" />
                  {showAiEditor ? tContext('artifactReviewClose') : tContext('docEditorOpenChat')}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex gap-2 pt-0">
              <Button size="sm" variant={agentMode === 'diff' ? 'default' : 'outline'} onClick={() => setAgentMode('diff')}>
                {tContext('docEditorModeReview')}
              </Button>
              <Button size="sm" variant={agentMode === 'yolo' ? 'default' : 'outline'} onClick={() => setAgentMode('yolo')}>
                {tContext('docEditorModeYolo')}
              </Button>
            </CardContent>
          </Card>

          <div className="rounded-2xl border border-[var(--line)] bg-[var(--bg-card)] p-4">
            <div className="mb-3 flex items-center justify-between">
              <Badge variant="info">{t('issueTypeEpic')}</Badge>
              <span className="text-xs text-[var(--text-muted)]">{t('storiesCount', { count: issue.stories.length })}</span>
            </div>

            <Input
              label={t('epicNameLabel')}
              value={epicName}
              onChange={(event) => setEpicName(event.target.value)}
              onBlur={() => void onUpdateEpic(issue.epic.id, { name: epicName.trim() || issue.epic.name })}
            />

            <Select
              label={t('epicStatusLabel')}
              value={epicStatus}
              options={epicStatusOptions}
              onChange={(event) => {
                const next = event.target.value as BacklogEpic['status'];
                setEpicStatus(next);
                void onUpdateEpic(issue.epic.id, { status: next });
              }}
              containerClassName="mt-3"
            />

            <Textarea
              label={t('epicDescriptionLabel')}
              value={epicDescription}
              rows={4}
              onChange={(event) => setEpicDescription(event.target.value)}
              onBlur={() => void onUpdateEpic(issue.epic.id, { description: epicDescription.trim() || null })}
              containerClassName="mt-3"
            />
          </div>

          <div className="rounded-2xl border border-[var(--line)] bg-[var(--bg-card)] p-4">
            <div className="mb-3 text-sm font-semibold text-[var(--text)]">{t('linkedStoriesTitle')}</div>
            <div className="flex flex-col gap-2">
              {issue.stories.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">{t('linkedStoriesEmpty')}</p>
              ) : (
                issue.stories.map((story) => (
                  <button
                    key={story.id}
                    type="button"
                    className="rounded-xl border border-[var(--line)] bg-[var(--bg-soft)] px-3 py-2 text-left text-sm text-[var(--text)] transition-colors hover:border-[var(--primary)]"
                    onClick={() => onOpenStory(story.id)}
                  >
                    <div className="font-medium">{story.title}</div>
                    <div className="mt-1 text-xs text-[var(--text-muted)]">
                      {story.storyPoints != null ? `${story.storyPoints} pts` : t('storyNoPoints')} · {getStatusLabel(story.status)}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {showAiEditor && artifactContext && (
            <div className="h-[520px] overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--bg-card)]">
              <ArtifactEditorChat
                workspace={workspace}
                artifactContext={artifactContext}
                title={issue.epic.name}
                subtitle={t('detailPanelEpic')}
                mode={agentMode}
                onModeChange={setAgentMode}
                onClose={() => setShowAiEditor(false)}
                onArtifactChangeProposal={onArtifactChangeProposal}
              />
            </div>
          )}
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex min-h-full flex-col bg-[var(--bg-soft)]">
      <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
        <div>
          <div className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">{t('detailPanelStory')}</div>
          <h3 className="mt-1 text-base font-semibold text-[var(--text)]">{issue.story.title}</h3>
        </div>
        <Button size="sm" variant="ghost" onClick={onClose}>
          <X size={14} />
        </Button>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="info">{tContext('docEditorChatTitle')}</Badge>
                  <Badge variant="muted">{aiModeLabel}</Badge>
                </div>
                <CardTitle className="mt-3 text-base">{t('aiAssistantTitle')}</CardTitle>
                <CardDescription className="mt-1">{t('aiStoryAssistantBody')}</CardDescription>
              </div>
              <Button size="sm" variant={showAiEditor ? 'default' : 'outline'} onClick={() => setShowAiEditor((current) => !current)}>
                <Sparkles data-icon="inline-start" />
                {showAiEditor ? tContext('artifactReviewClose') : tContext('docEditorOpenChat')}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex gap-2 pt-0">
            <Button size="sm" variant={agentMode === 'diff' ? 'default' : 'outline'} onClick={() => setAgentMode('diff')}>
              {tContext('docEditorModeReview')}
            </Button>
            <Button size="sm" variant={agentMode === 'yolo' ? 'default' : 'outline'} onClick={() => setAgentMode('yolo')}>
              {tContext('docEditorModeYolo')}
            </Button>
          </CardContent>
        </Card>

        <div className="rounded-2xl border border-[var(--line)] bg-[var(--bg-card)] p-4">
          <div className="mb-3 flex items-center gap-2">
            <Badge variant="success">{t('issueTypeStory')}</Badge>
            {issue.epic && <Badge variant="info">{issue.epic.name}</Badge>}
            {issue.sprint && <Badge variant="warning">{issue.sprint.name}</Badge>}
          </div>

          <Input
            label={t('titleLabel')}
            value={storyTitle}
            onChange={(event) => setStoryTitle(event.target.value)}
            onBlur={() => void onUpdateStory(issue.story.id, { title: storyTitle.trim() || issue.story.title })}
          />

          <div className="mt-3 grid grid-cols-2 gap-3">
            <Select
              label={t('filterEpic')}
              value={storyEpicId}
              options={epicOptions}
              onChange={(event) => {
                const next = event.target.value;
                setStoryEpicId(next);
                void onUpdateStory(issue.story.id, { epicId: next === 'unassigned' ? null : next });
              }}
            />
            <Select
              label={t('sprintSectionTitle')}
              value={storySprintId}
              options={sprintOptions}
              onChange={(event) => {
                const next = event.target.value;
                setStorySprintId(next);
                void onUpdateStory(issue.story.id, { sprintId: next === 'backlog' ? null : next });
              }}
            />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <Select
              label={t('filterPriority')}
              value={storyPriority}
              options={PRIORITY_OPTIONS}
              onChange={(event) => {
                const next = event.target.value as BacklogStory['priority'];
                setStoryPriority(next);
                void onUpdateStory(issue.story.id, { priority: next });
              }}
            />
            <Select
              label={t('storyStatusLabel')}
              value={storyStatus}
              options={storyStatusOptions}
              onChange={(event) => {
                const next = event.target.value as BacklogStory['status'];
                setStoryStatus(next);
                void onUpdateStory(issue.story.id, { status: next });
              }}
            />
          </div>

          <div className="mt-3 grid grid-cols-[1fr_96px] gap-3">
            <Input
              label={t('assigneeLabel')}
              value={storyAssignee}
              onChange={(event) => setStoryAssignee(event.target.value)}
              onBlur={() => void onUpdateStory(issue.story.id, { assignee: storyAssignee.trim() || null })}
            />
            <Input
              label={t('storyPointsLabel')}
              type="number"
              min={0}
              value={storyPoints}
              onChange={(event) => setStoryPoints(event.target.value)}
              onBlur={() => void onUpdateStory(issue.story.id, { storyPoints: storyPoints !== '' ? Number(storyPoints) : null })}
            />
          </div>

          <Textarea
            label={t('descriptionLabel')}
            value={storyDescription}
            rows={4}
            onChange={(event) => setStoryDescription(event.target.value)}
            onBlur={() => void onUpdateStory(issue.story.id, { description: storyDescription.trim() || null })}
            containerClassName="mt-3"
          />
        </div>

        <div className="rounded-2xl border border-[var(--line)] bg-[var(--bg-card)] p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold text-[var(--text)]">{t('acceptanceCriteriaLabel')}</div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setStoryCriteria((current) => [...current, ''])}
            >
              <Plus size={12} />
              {t('addCriterion')}
            </Button>
          </div>

          <div className="flex flex-col gap-2">
            {storyCriteria.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">{t('acceptanceCriteriaEmpty')}</p>
            ) : (
              storyCriteria.map((criterion, index) => (
                <div key={`${issue.story.id}-criterion-${index}`} className="flex items-center gap-2">
                  <Input
                    value={criterion}
                    onChange={(event) => handleStoryCriterionChange(index, event.target.value)}
                    onBlur={() => persistStoryCriteria(storyCriteria)}
                    className="flex-1"
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      const updated = storyCriteria.filter((_, currentIndex) => currentIndex !== index);
                      setStoryCriteria(updated);
                      persistStoryCriteria(updated);
                    }}
                  >
                    <X size={12} />
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>

        <StoryTasksPanel
          workspace={workspace}
          workspaceId={workspaceId}
          storyId={issue.story.id}
          refreshNonce={
            lastArtifactReviewMutation?.target.kind === 'backlog_task'
            && lastArtifactReviewMutation.target.workspaceId === workspaceId
            ? lastArtifactReviewMutation.nonce
            : undefined
          }
          onArtifactChangeProposal={onArtifactChangeProposal}
        />

        {showAiEditor && artifactContext && (
          <div className="h-[520px] overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--bg-card)]">
            <ArtifactEditorChat
              workspace={workspace}
              artifactContext={artifactContext}
              title={issue.story.title}
              subtitle={t('detailPanelStory')}
              mode={agentMode}
              onModeChange={setAgentMode}
              onClose={() => setShowAiEditor(false)}
              onArtifactChangeProposal={onArtifactChangeProposal}
            />
          </div>
        )}
      </div>
    </aside>
  );
}
