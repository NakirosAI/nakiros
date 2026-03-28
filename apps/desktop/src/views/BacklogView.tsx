import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, FolderKanban, Plus, Sparkles } from 'lucide-react';
import type { ArtifactChangeProposal, StoredWorkspace } from '@nakiros/shared';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Input, Select } from '../components/ui';
import BacklogDetailPanel, { type BacklogSelectedIssue } from '../components/backlog/BacklogDetailPanel';
import BacklogIssueSection from '../components/backlog/BacklogIssueSection';
import EpicEditorModal from '../components/backlog/EpicEditorModal';
import MultiSelectActionBar from '../components/backlog/MultiSelectActionBar';
import SprintCompleteModal from '../components/backlog/SprintCompleteModal';
import SprintCreationModal from '../components/backlog/SprintCreationModal';
import ArtifactEditorChat from '../components/review/ArtifactEditorChat';
import FeatureSpecView from './FeatureSpecView';
import type { ArtifactReviewMutation } from '../hooks/useArtifactReview';

interface Props {
  workspace: StoredWorkspace;
  onArtifactChangeProposal?: (event: {
    proposal: ArtifactChangeProposal;
    conversationId?: string | null;
    triggerMessageId?: string | null;
    baselineContentOverride?: string | null;
    alreadyApplied?: boolean;
  }) => void | Promise<void>;
  lastArtifactReviewMutation?: ArtifactReviewMutation | null;
}

type SelectedIssueRef =
  | { type: 'epic'; id: string }
  | { type: 'story'; id: string }
  | null;

const UNASSIGNED_EPIC = '__unassigned__';

const PRIORITY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'high', label: 'HIGH' },
  { value: 'medium', label: 'MED' },
  { value: 'low', label: 'LOW' },
];

function formatDate(ms: number | null): string {
  if (ms == null) return '';
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function StoryCreationRow({
  epics,
  defaultEpicId,
  onCancel,
  onConfirm,
}: {
  epics: BacklogEpic[];
  defaultEpicId: string;
  onCancel: () => void;
  onConfirm: (epicId: string | null, payload: CreateStoryPayload) => void;
}) {
  const { t } = useTranslation('backlog');
  const titleRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<BacklogStory['priority']>('medium');
  const [storyPoints, setStoryPoints] = useState('');
  const [epicId, setEpicId] = useState(defaultEpicId);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const epicOptions = useMemo(
    () => [{ value: UNASSIGNED_EPIC, label: t('unassigned') }, ...epics.map((epic) => ({ value: epic.id, label: epic.name }))],
    [epics, t],
  );

  function submit() {
    if (!title.trim()) return;
    onConfirm(epicId === UNASSIGNED_EPIC ? null : epicId, {
      title: title.trim(),
      priority,
      ...(storyPoints !== '' ? { storyPoints: Number(storyPoints) } : {}),
      ...(epicId !== UNASSIGNED_EPIC ? { epicId } : {}),
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      submit();
    }
    if (event.key === 'Escape') onCancel();
  }

  return (
    <div className="grid min-w-[980px] grid-cols-[44px_86px_minmax(0,1fr)_160px_72px_120px_120px_88px] border-b border-[var(--line)] bg-[var(--bg-soft)] px-4 py-3">
      <div />
      <div className="pt-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--success)]">
        STORY
      </div>
      <div className="min-w-0">
        <Input
          ref={titleRef}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('addStoryPlaceholder')}
        />
      </div>
      <div>
        <Select value={epicId} options={epicOptions} onChange={(event) => setEpicId(event.target.value)} />
      </div>
      <div>
        <Input
          type="number"
          min={0}
          value={storyPoints}
          onChange={(event) => setStoryPoints(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="0"
        />
      </div>
      <div>
        <Select value={priority} options={PRIORITY_OPTIONS} onChange={(event) => setPriority(event.target.value as BacklogStory['priority'])} />
      </div>
      <div className="flex items-center text-xs text-[var(--text-muted)]">{t('storyStatusBacklog')}</div>
      <div className="flex items-center justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onCancel}>
          {t('cancelCreate')}
        </Button>
        <Button size="sm" onClick={submit} disabled={!title.trim()}>
          {t('confirmCreate')}
        </Button>
      </div>
    </div>
  );
}

function BacklogLoadingState() {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-h-0 overflow-y-auto p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="h-6 w-24 animate-pulse rounded-full bg-[var(--bg-soft)]" />
          <div className="h-6 w-32 animate-pulse rounded-full bg-[var(--bg-soft)]" />
          <div className="h-6 w-28 animate-pulse rounded-full bg-[var(--bg-soft)]" />
        </div>

        <div className="flex flex-col gap-4">
          {[0, 1].map((section) => (
            <div
              key={section}
              className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--bg-card)]"
            >
              <div className="flex items-center justify-between border-b border-[var(--line)] bg-[var(--bg-soft)] px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="h-4 w-32 animate-pulse rounded bg-[var(--line-strong)]" />
                  <div className="h-5 w-16 animate-pulse rounded-full bg-[var(--line-strong)]" />
                </div>
                <div className="h-8 w-28 animate-pulse rounded-md bg-[var(--line-strong)]" />
              </div>

              <div className="p-4">
                <div className="grid gap-2">
                  {[0, 1, 2, 3].map((row) => (
                    <div
                      key={row}
                      className="grid min-h-[56px] grid-cols-[86px_minmax(0,1fr)_140px_72px_100px_120px_80px] gap-3 rounded-xl border border-[var(--line)] bg-[var(--bg-soft)] px-4 py-3"
                    >
                      <div className="h-8 w-14 animate-pulse rounded bg-[var(--line-strong)]" />
                      <div className="space-y-2">
                        <div className="h-3 w-3/4 animate-pulse rounded bg-[var(--line-strong)]" />
                        <div className="h-3 w-1/2 animate-pulse rounded bg-[var(--line)]" />
                      </div>
                      <div className="h-3 w-20 animate-pulse rounded bg-[var(--line)]" />
                      <div className="h-3 w-8 animate-pulse rounded bg-[var(--line)]" />
                      <div className="h-3 w-16 animate-pulse rounded bg-[var(--line)]" />
                      <div className="h-8 w-20 animate-pulse rounded bg-[var(--line)]" />
                      <div className="h-3 w-10 animate-pulse rounded bg-[var(--line)]" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-[var(--line)] bg-[var(--bg-soft)] p-5 xl:border-l xl:border-t-0">
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--bg-card)] p-5">
          <div className="h-4 w-28 animate-pulse rounded bg-[var(--line-strong)]" />
          <div className="mt-4 h-10 w-3/4 animate-pulse rounded bg-[var(--line)]" />
          <div className="mt-3 h-24 w-full animate-pulse rounded-xl bg-[var(--bg-soft)]" />
          <div className="mt-3 h-24 w-full animate-pulse rounded-xl bg-[var(--bg-soft)]" />
        </div>
      </div>
    </div>
  );
}

export default function BacklogView({
  workspace,
  onArtifactChangeProposal,
  lastArtifactReviewMutation,
}: Props) {
  const { t } = useTranslation('backlog');

  async function reloadBacklog() {
    const [fetchedStories, fetchedEpics, fetchedSprints] = await Promise.all([
      window.nakiros.backlogGetStories(workspace.id),
      window.nakiros.backlogGetEpics(workspace.id),
      window.nakiros.backlogGetSprints(workspace.id),
    ]);
    setStories(fetchedStories);
    setEpics(fetchedEpics);
    setSprints(fetchedSprints);
  }

  function getPriorityLabel(priority: BacklogStory['priority']) {
    if (priority === 'high') return t('priorityHigh');
    if (priority === 'medium') return t('priorityMedium');
    return t('priorityLow');
  }

  const [stories, setStories] = useState<BacklogStory[]>([]);
  const [epics, setEpics] = useState<BacklogEpic[]>([]);
  const [sprints, setSprints] = useState<BacklogSprint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSprintModalOpen, setIsSprintModalOpen] = useState(false);
  const [isEpicModalOpen, setIsEpicModalOpen] = useState(false);
  const [selectedStoryIds, setSelectedStoryIds] = useState<Set<string>>(new Set());
  const [selectedIssue, setSelectedIssue] = useState<SelectedIssueRef>(null);
  const [storyCreationEpicId, setStoryCreationEpicId] = useState<string | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [completingSprint, setCompletingSprint] = useState<{ sprint: BacklogSprint; doneCount: number; incompleteCount: number } | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);
  const [showFeatureCreation, setShowFeatureCreation] = useState(false);
  const [search, setSearch] = useState('');
  const [epicFilter, setEpicFilter] = useState<string[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<string[]>([]);
  const [editingSprintId, setEditingSprintId] = useState<string | null>(null);
  const [sprintAgentMode, setSprintAgentMode] = useState<'diff' | 'yolo'>('diff');
  const toastTimerRef = useRef<number | null>(null);
  const hasInitializedSelectionRef = useRef(false);
  const headerStats = useMemo(() => {
    const activeSprint = sprints.find((sprint) => sprint.status === 'active') ?? null;
    return {
      activeSprint,
      storiesInSprint: activeSprint ? stories.filter((story) => story.sprintId === activeSprint.id).length : 0,
    };
  }, [sprints, stories]);

  useEffect(() => {
    setIsLoading(true);
    void reloadBacklog()
      .finally(() => setIsLoading(false));
  }, [workspace.id]);

  useEffect(() => {
    if (!lastArtifactReviewMutation) return;
    if (lastArtifactReviewMutation.target.kind === 'workspace_doc') return;
    if (lastArtifactReviewMutation.target.workspaceId !== workspace.id) return;
    void reloadBacklog();
  }, [lastArtifactReviewMutation, workspace.id]);

  useEffect(() => {
    if (!editingSprintId) return;
    if (!sprints.some((sprint) => sprint.id === editingSprintId)) {
      setEditingSprintId(null);
      setSprintAgentMode('diff');
    }
  }, [editingSprintId, sprints]);

  const epicsById = useMemo(() => {
    const map = new Map<string, BacklogEpic>();
    for (const epic of epics) map.set(epic.id, epic);
    return map;
  }, [epics]);

  function showError(message: string) {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setErrorToast(message);
    toastTimerRef.current = window.setTimeout(() => setErrorToast(null), 4000);
  }

  async function handleCreateEpic(payload: CreateEpicPayload) {
    try {
      const created = await window.nakiros.backlogCreateEpic(workspace.id, { ...payload, rank: epics.length });
      setEpics((current) => [...current, created]);
      setSelectedIssue({ type: 'epic', id: created.id });
    } catch {
      showError(t('saveError'));
      throw new Error('epic_create_failed');
    }
  }

  async function handleUpdateEpic(epicId: string, patch: UpdateEpicPayload) {
    const snapshot = epics.find((epic) => epic.id === epicId);
    setEpics((current) => current.map((epic) => (epic.id === epicId ? { ...epic, ...patch } : epic)));

    try {
      const updated = await window.nakiros.backlogUpdateEpic(workspace.id, epicId, patch);
      setEpics((current) => current.map((epic) => (epic.id === epicId ? updated : epic)));
    } catch {
      if (snapshot) {
        setEpics((current) => current.map((epic) => (epic.id === epicId ? snapshot : epic)));
      }
      showError(t('saveError'));
    }
  }

  async function handleCreateStory(epicId: string | null, payload: CreateStoryPayload) {
    const tempId = `temp-${Date.now()}`;
    const optimisticStory: BacklogStory = {
      id: tempId,
      workspaceId: workspace.id,
      epicId,
      sprintId: null,
      title: payload.title,
      description: null,
      acceptanceCriteria: null,
      status: 'backlog',
      priority: payload.priority ?? 'medium',
      assignee: null,
      storyPoints: payload.storyPoints ?? null,
      rank: 0,
      externalId: null,
      externalSource: null,
      lastSyncedAt: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    setStories((current) => [...current, optimisticStory]);
    setStoryCreationEpicId(null);
    setSelectedIssue({ type: 'story', id: tempId });

    try {
      const created = await window.nakiros.backlogCreateStory(workspace.id, payload);
      setStories((current) => current.map((story) => (story.id === tempId ? created : story)));
      setSelectedIssue({ type: 'story', id: created.id });
    } catch {
      setStories((current) => current.filter((story) => story.id !== tempId));
      setSelectedIssue(null);
      showError(t('saveError'));
    }
  }

  async function handleUpdateStory(storyId: string, patch: UpdateStoryPayload) {
    const snapshot = stories.find((story) => story.id === storyId);
    setStories((current) => current.map((story) => (story.id === storyId ? { ...story, ...patch } : story)));

    try {
      const updated = await window.nakiros.backlogUpdateStory(workspace.id, storyId, patch);
      setStories((current) => current.map((story) => (story.id === storyId ? updated : story)));
    } catch {
      if (snapshot) {
        setStories((current) => current.map((story) => (story.id === storyId ? snapshot : story)));
      }
      showError(t('saveError'));
    }
  }

  async function handleCreateSprint(payload: CreateSprintPayload) {
    try {
      const created = await window.nakiros.backlogCreateSprint(workspace.id, payload);
      setSprints((current) => [...current, created]);
      setIsSprintModalOpen(false);
    } catch {
      showError(t('saveError'));
    }
  }

  async function handleStartSprint(sprintId: string) {
    try {
      const updated = await window.nakiros.backlogUpdateSprint(workspace.id, sprintId, { status: 'active' });
      setSprints((current) => current.map((sprint) => (sprint.id === sprintId ? updated : sprint)));
    } catch (error: unknown) {
      const code = (error as { code?: string } | undefined)?.code;
      showError(code === 'SPRINT_ALREADY_ACTIVE' ? t('startSprintAlreadyActive') : t('startSprintError'));
    }
  }

  async function handleAssignToSprint(sprintId: string) {
    const ids = [...selectedStoryIds];
    setStories((current) => current.map((story) => (ids.includes(story.id) ? { ...story, sprintId } : story)));
    setSelectedStoryIds(new Set());

    try {
      await Promise.all(ids.map((id) => window.nakiros.backlogUpdateStory(workspace.id, id, { sprintId })));
    } catch {
      const restored = await window.nakiros.backlogGetStories(workspace.id);
      setStories(restored);
      showError(t('assignError'));
    }
  }

  async function handleOpenCompleteSprint(sprint: BacklogSprint) {
    const sprintStories = stories.filter((story) => story.sprintId === sprint.id);
    setCompletingSprint({
      sprint,
      doneCount: sprintStories.filter((story) => story.status === 'done').length,
      incompleteCount: sprintStories.filter((story) => story.status !== 'done').length,
    });
  }

  async function handleConfirmComplete() {
    if (!completingSprint) return;
    const incompleteStories = stories.filter((story) => story.sprintId === completingSprint.sprint.id && story.status !== 'done');

    setIsCompleting(true);
    try {
      await window.nakiros.backlogUpdateSprint(workspace.id, completingSprint.sprint.id, { status: 'completed' });
      await Promise.all(incompleteStories.map((story) => window.nakiros.backlogUpdateStory(workspace.id, story.id, { sprintId: null })));
      const [updatedStories, updatedSprints] = await Promise.all([
        window.nakiros.backlogGetStories(workspace.id),
        window.nakiros.backlogGetSprints(workspace.id),
      ]);
      setStories(updatedStories);
      setSprints(updatedSprints);
      setCompletingSprint(null);
    } catch {
      const [updatedStories, updatedSprints] = await Promise.all([
        window.nakiros.backlogGetStories(workspace.id),
        window.nakiros.backlogGetSprints(workspace.id),
      ]);
      setStories(updatedStories);
      setSprints(updatedSprints);
      showError(t('completeSprintError'));
    } finally {
      setIsCompleting(false);
    }
  }

  function toggleStorySelection(storyId: string) {
    setSelectedStoryIds((current) => {
      const next = new Set(current);
      if (next.has(storyId)) next.delete(storyId);
      else next.add(storyId);
      return next;
    });
  }

  const filteredStories = useMemo(() => {
    return stories.filter((story) => {
      const haystack = `${story.title} ${story.description ?? ''} ${story.assignee ?? ''}`.toLowerCase();
      if (search && !haystack.includes(search.toLowerCase())) return false;
      if (epicFilter.length > 0 && !epicFilter.includes(story.epicId ?? '')) return false;
      if (priorityFilter.length > 0 && !priorityFilter.includes(story.priority)) return false;
      return true;
    });
  }, [stories, search, epicFilter, priorityFilter]);

  const sprintSections = useMemo(() => {
    return [...sprints]
      .filter((sprint) => sprint.status !== 'completed')
      .sort((left, right) => {
        if (left.status === right.status) return left.createdAt - right.createdAt;
        if (left.status === 'active') return -1;
        if (right.status === 'active') return 1;
        return 0;
      })
      .map((sprint) => ({
        sprint,
        stories: filteredStories.filter((story) => story.sprintId === sprint.id),
      }));
  }, [filteredStories, sprints]);

  const backlogStories = useMemo(
    () => filteredStories.filter((story) => story.sprintId === null),
    [filteredStories],
  );

  const selectedDetailIssue = useMemo<BacklogSelectedIssue | null>(() => {
    if (!selectedIssue) return null;
    if (selectedIssue.type === 'story') {
      const story = stories.find((item) => item.id === selectedIssue.id);
      if (!story) return null;
      return {
        type: 'story',
        story,
        epic: story.epicId ? (epicsById.get(story.epicId) ?? null) : null,
        sprint: story.sprintId ? (sprints.find((item) => item.id === story.sprintId) ?? null) : null,
      };
    }

    const epic = epics.find((item) => item.id === selectedIssue.id);
    if (!epic) return null;
    return {
      type: 'epic',
      epic,
      stories: stories.filter((story) => story.epicId === epic.id),
    };
  }, [epics, epicsById, selectedIssue, sprints, stories]);

  useEffect(() => {
    if (hasInitializedSelectionRef.current) return;
    if (isLoading) return;

    if (stories.length > 0) {
      setSelectedIssue({ type: 'story', id: stories[0]!.id });
      hasInitializedSelectionRef.current = true;
      return;
    }

    if (epics.length > 0) {
      setSelectedIssue({ type: 'epic', id: epics[0]!.id });
      hasInitializedSelectionRef.current = true;
    }
  }, [epics, isLoading, stories]);

  const totalBacklogPoints = backlogStories.reduce((sum, story) => sum + (story.storyPoints ?? 0), 0);
  const activeSprint = headerStats.activeSprint;
  const hasActiveFilters = search.trim().length > 0 || epicFilter.length > 0 || priorityFilter.length > 0;

  function handleOpenStoryCreation() {
    if (selectedIssue?.type === 'epic') {
      setStoryCreationEpicId(selectedIssue.id);
      return;
    }

    if (selectedIssue?.type === 'story' && selectedDetailIssue?.type === 'story' && selectedDetailIssue.epic) {
      setStoryCreationEpicId(selectedDetailIssue.epic.id);
      return;
    }

    setStoryCreationEpicId(epics[0]?.id ?? UNASSIGNED_EPIC);
  }

  function renderSprintAction(sprint: BacklogSprint, sprintStories: BacklogStory[]): ReactNode {
    const pointCount = sprintStories.reduce((sum, story) => sum + (story.storyPoints ?? 0), 0);
    const dateRange = sprint.startDate || sprint.endDate
      ? `${formatDate(sprint.startDate)}${sprint.startDate || sprint.endDate ? ' -> ' : ''}${formatDate(sprint.endDate)}`
      : null;

    return (
      <div className="flex items-center gap-2">
        <Badge variant="warning">{pointCount} pts</Badge>
        {dateRange && <span className="text-xs text-[var(--text-muted)]">{dateRange}</span>}
        <Button
          size="sm"
          variant={editingSprintId === sprint.id ? 'default' : 'outline'}
          onClick={() => {
            setEditingSprintId((current) => current === sprint.id ? null : sprint.id);
            setSprintAgentMode('diff');
          }}
        >
          <Sparkles data-icon="inline-start" />
          {editingSprintId === sprint.id ? t('closeAiEditor') : t('openAiEditor')}
        </Button>
        {sprint.status === 'planning' && (
          <Button size="sm" onClick={() => void handleStartSprint(sprint.id)} disabled={sprintStories.length === 0}>
            {t('startSprintButton')}
          </Button>
        )}
        {sprint.status === 'active' && (
          <Button size="sm" variant="outline" onClick={() => void handleOpenCompleteSprint(sprint)}>
            {t('completeSprintButton')}
          </Button>
        )}
      </div>
    );
  }

  const isEmpty = !isLoading && stories.length === 0 && epics.length === 0 && sprints.length === 0;

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-[var(--bg)]">
      {/* Header — adapts to mode */}
      <div className="flex items-center justify-between gap-4 border-b border-[var(--line)] bg-[var(--bg-soft)] px-5 py-4">
        {showFeatureCreation ? (
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => setShowFeatureCreation(false)}>
              <ArrowLeft data-icon="inline-start" />
              {t('backToBacklog')}
            </Button>
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">{workspace.name}</div>
              <h1 className="mt-0.5 text-lg font-semibold text-[var(--text)]">{t('newFeatureTitle')}</h1>
            </div>
          </div>
        ) : (
          <div className="flex min-w-0 flex-1 items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">{workspace.name}</div>
              <h1 className="mt-1 text-lg font-semibold text-[var(--text)]">{t('title')}</h1>
              <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
                {t('headerDescription')}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button variant="outline" onClick={() => setShowFeatureCreation(true)}>
                <Sparkles data-icon="inline-start" />
                {t('newFeatureButton')}
              </Button>
              <Button variant="outline" onClick={() => setIsSprintModalOpen(true)}>
                {t('newSprintButton')}
              </Button>
              <Button variant="outline" onClick={() => setIsEpicModalOpen(true)}>
                {t('newEpicButton')}
              </Button>
              <Button onClick={handleOpenStoryCreation}>
                <Plus data-icon="inline-start" />
                {t('addStory')}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Content area — feature creation or backlog */}
      {showFeatureCreation ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          <FeatureSpecView workspace={workspace} />
        </div>
      ) : (
        <>
          <div className="border-b border-[var(--line)] bg-[var(--bg-card)] px-5 py-4">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
              <Card className="shadow-none">
                <CardHeader className="pb-4">
                  <CardTitle className="text-base">{t('filtersTitle')}</CardTitle>
                  <CardDescription>{t('filtersDescription')}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder={t('searchIssues')}
                      className="h-9 min-w-[240px] max-w-[360px]"
                    />
                    <Badge variant="muted">{t('groupByEpic')}</Badge>
                    {hasActiveFilters ? <Badge variant="warning">{t('filtersActive')}</Badge> : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="shrink-0 text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">{t('filterPriority')}</span>
                    {(['high', 'medium', 'low'] as const).map((priority) => (
                      <Button
                        key={priority}
                        size="sm"
                        variant={priorityFilter.includes(priority) ? 'default' : 'outline'}
                        onClick={() => setPriorityFilter((current) => current.includes(priority) ? current.filter((value) => value !== priority) : [...current, priority])}
                      >
                        {getPriorityLabel(priority)}
                      </Button>
                    ))}
                    {hasActiveFilters && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSearch('');
                          setEpicFilter([]);
                          setPriorityFilter([]);
                        }}
                      >
                        {t('clearFilters')}
                      </Button>
                    )}
                  </div>

                  {epics.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="shrink-0 text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">{t('filterEpic')}</span>
                      <Button size="sm" variant={epicFilter.length === 0 ? 'default' : 'outline'} onClick={() => setEpicFilter([])}>
                        {t('allEpics')}
                      </Button>
                      {epics.map((epic) => (
                        <Button
                          key={epic.id}
                          size="sm"
                          variant={epicFilter.includes(epic.id) ? 'default' : 'outline'}
                          onClick={() => setEpicFilter((current) => current.includes(epic.id) ? current.filter((id) => id !== epic.id) : [...current, epic.id])}
                        >
                          {epic.name}
                        </Button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="shadow-none">
                <CardHeader className="pb-4">
                  <CardTitle className="text-base">{t('overviewTitle')}</CardTitle>
                  <CardDescription>{t('overviewDescription')}</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-[var(--line)] bg-[var(--bg-soft)] p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{t('epicCount', { count: epics.length })}</div>
                    <div className="mt-2 text-2xl font-semibold text-[var(--text)]">{epics.length}</div>
                  </div>
                  <div className="rounded-lg border border-[var(--line)] bg-[var(--bg-soft)] p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{t('backlogSectionTitle')}</div>
                    <div className="mt-2 text-2xl font-semibold text-[var(--text)]">{backlogStories.length}</div>
                  </div>
                  <div className="rounded-lg border border-[var(--line)] bg-[var(--bg-soft)] p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{t('overviewBacklogPoints')}</div>
                    <div className="mt-2 text-2xl font-semibold text-[var(--text)]">{totalBacklogPoints}</div>
                  </div>
                  <div className="rounded-lg border border-[var(--line)] bg-[var(--bg-soft)] p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{t('overviewActiveSprint')}</div>
                    <div className="mt-2 truncate text-sm font-semibold text-[var(--text)]">
                      {activeSprint ? activeSprint.name : t('overviewNoActiveSprint')}
                    </div>
                    {activeSprint ? (
                      <div className="mt-1 text-xs text-[var(--text-muted)]">
                        {t('overviewStoriesInSprint', { count: headerStats.storiesInSprint })}
                      </div>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {isLoading ? (
            <BacklogLoadingState />
          ) : isEmpty ? (
            <div className="flex flex-1 items-center justify-center p-8">
              <EmptyState
                icon={<FolderKanban size={20} />}
                title={t('emptyState')}
                subtitle={t('jiraLikeEmptySubtitle')}
                action={{ label: t('newEpicButton'), onClick: () => setIsEpicModalOpen(true) }}
              />
            </div>
          ) : (
            <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden xl:grid-cols-[minmax(0,1fr)_380px]">
              <div className="min-h-0 overflow-y-auto p-5">
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <Badge variant="info">{t('epicCount', { count: epics.length })}</Badge>
                  <Badge variant="warning">{t('backlogIssuesCount', { count: backlogStories.length })}</Badge>
                  <Badge variant="muted">{t('overviewBacklogPointsInline', { count: totalBacklogPoints })}</Badge>
                  {activeSprint && <Badge variant="success">{activeSprint.name}</Badge>}
                </div>

                <div className="flex flex-col gap-4">
                  {sprintSections.map(({ sprint, stories: sprintStories }) => (
                    <BacklogIssueSection
                      key={sprint.id}
                      title={sprint.name}
                      badge={t(`sprintStatus${sprint.status.charAt(0).toUpperCase()}${sprint.status.slice(1)}` as 'sprintStatusPlanning' | 'sprintStatusActive' | 'sprintStatusCompleted')}
                      subtitle={sprint.goal ?? undefined}
                      stories={sprintStories}
                      epicsById={epicsById}
                      selectedIssue={selectedIssue}
                      selectedStoryIds={selectedStoryIds}
                      onSelectEpic={(epic) => setSelectedIssue({ type: 'epic', id: epic.id })}
                      onSelectStory={(story) => setSelectedIssue({ type: 'story', id: story.id })}
                    onToggleStorySelection={toggleStorySelection}
                    emptyLabel={t('sprintPlanningEmpty')}
                    action={renderSprintAction(sprint, sprintStories)}
                    belowHeader={editingSprintId === sprint.id ? (
                      <div className="h-[520px] border-b border-[var(--line)]">
                        <ArtifactEditorChat
                          workspace={workspace}
                          artifactContext={{
                            target: { kind: 'backlog_sprint', workspaceId: workspace.id, id: sprint.id },
                            mode: sprintAgentMode,
                            sourceSurface: 'backlog',
                            title: sprint.name,
                          }}
                          title={sprint.name}
                          subtitle={t('sprintSectionTitle')}
                          mode={sprintAgentMode}
                          onModeChange={setSprintAgentMode}
                          onClose={() => setEditingSprintId(null)}
                          onArtifactChangeProposal={onArtifactChangeProposal}
                        />
                      </div>
                    ) : null}
                  />
                ))}

                  <BacklogIssueSection
                    title={t('backlogSectionTitle')}
                    badge={`${backlogStories.length}`}
                    subtitle={t('backlogSectionSubtitle')}
                    stories={backlogStories}
                    epicsById={epicsById}
                    selectedIssue={selectedIssue}
                    selectedStoryIds={selectedStoryIds}
                    onSelectEpic={(epic) => setSelectedIssue({ type: 'epic', id: epic.id })}
                    onSelectStory={(story) => setSelectedIssue({ type: 'story', id: story.id })}
                    onToggleStorySelection={toggleStorySelection}
                    emptyLabel={t('emptyStateFiltered')}
                    action={
                      <div className="flex items-center gap-2">
                        <Badge variant="muted">{totalBacklogPoints} pts</Badge>
                        <Button size="sm" onClick={handleOpenStoryCreation}>
                          <Plus data-icon="inline-start" />
                          {t('addStory')}
                        </Button>
                      </div>
                    }
                    creationRow={storyCreationEpicId ? (
                      <StoryCreationRow
                        epics={epics}
                        defaultEpicId={storyCreationEpicId}
                        onCancel={() => setStoryCreationEpicId(null)}
                        onConfirm={handleCreateStory}
                      />
                    ) : null}
                  />
                </div>
              </div>

              <div className="min-h-0 border-t border-[var(--line)] xl:border-l xl:border-t-0">
                <BacklogDetailPanel
                  workspace={workspace}
                  workspaceId={workspace.id}
                  issue={selectedDetailIssue}
                  epics={epics}
                  sprints={sprints}
                  onClose={() => setSelectedIssue(null)}
                  onOpenStory={(storyId) => setSelectedIssue({ type: 'story', id: storyId })}
                  onUpdateEpic={handleUpdateEpic}
                  onUpdateStory={handleUpdateStory}
                  onArtifactChangeProposal={onArtifactChangeProposal}
                  lastArtifactReviewMutation={lastArtifactReviewMutation}
                />
              </div>
            </div>
          )}
        </>
      )}

      {/* Modals — always mounted */}
      <SprintCreationModal
        isOpen={isSprintModalOpen}
        onClose={() => setIsSprintModalOpen(false)}
        onConfirm={handleCreateSprint}
      />
      <EpicEditorModal
        epic={null}
        isOpen={isEpicModalOpen}
        onClose={() => setIsEpicModalOpen(false)}
        onConfirm={handleCreateEpic}
      />
      <MultiSelectActionBar
        selectedCount={selectedStoryIds.size}
        sprints={sprints}
        onAssign={handleAssignToSprint}
        onClearSelection={() => setSelectedStoryIds(new Set())}
      />
      {completingSprint && (
        <SprintCompleteModal
          sprint={completingSprint.sprint}
          doneCount={completingSprint.doneCount}
          incompleteCount={completingSprint.incompleteCount}
          isLoading={isCompleting}
          onConfirm={() => void handleConfirmComplete()}
          onClose={() => setCompletingSprint(null)}
        />
      )}
      {errorToast && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-lg bg-destructive px-4 py-2 text-sm text-destructive-foreground shadow-lg">
          {errorToast}
        </div>
      )}
    </div>
  );
}
