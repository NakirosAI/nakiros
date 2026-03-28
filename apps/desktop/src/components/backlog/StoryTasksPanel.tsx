import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Sparkles } from 'lucide-react';
import type {
  ArtifactChangeMode,
  ArtifactChangeProposal,
  StoredWorkspace,
} from '@nakiros/shared';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Select } from '../ui';
import ArtifactEditorChat from '../review/ArtifactEditorChat';

interface StoryTasksPanelProps {
  workspace?: StoredWorkspace;
  workspaceId: string;
  storyId: string;
  refreshNonce?: number;
  onArtifactChangeProposal?: (event: {
    proposal: ArtifactChangeProposal;
    conversationId?: string | null;
    triggerMessageId?: string | null;
    baselineContentOverride?: string | null;
    alreadyApplied?: boolean;
  }) => void | Promise<void>;
}

interface TaskRowProps {
  workspace?: StoredWorkspace;
  workspaceId: string;
  storyId: string;
  task: BacklogTask;
  taskStatusOptions: Array<{ value: string; label: string }>;
  taskTypeOptions: Array<{ value: string; label: string }>;
  assigneePlaceholder: string;
  onPersist: (taskId: string, patch: UpdateTaskPayload) => Promise<void>;
  showAiEditor: boolean;
  agentMode: ArtifactChangeMode;
  onModeChange(mode: ArtifactChangeMode): void;
  onToggleAiEditor(): void;
  onArtifactChangeProposal?: (event: {
    proposal: ArtifactChangeProposal;
    conversationId?: string | null;
    triggerMessageId?: string | null;
    baselineContentOverride?: string | null;
    alreadyApplied?: boolean;
  }) => void | Promise<void>;
}

function TaskRow({
  workspace,
  workspaceId,
  storyId,
  task,
  taskStatusOptions,
  taskTypeOptions,
  assigneePlaceholder,
  onPersist,
  showAiEditor,
  agentMode,
  onModeChange,
  onToggleAiEditor,
  onArtifactChangeProposal,
}: TaskRowProps) {
  const { t } = useTranslation('context');
  const [title, setTitle] = useState(task.title);
  const [assignee, setAssignee] = useState(task.assignee ?? '');
  const [status, setStatus] = useState(task.status);
  const [type, setType] = useState(task.type);

  useEffect(() => {
    setTitle(task.title);
    setAssignee(task.assignee ?? '');
    setStatus(task.status);
    setType(task.type);
  }, [task.assignee, task.id, task.status, task.title, task.type, task.updatedAt]);

  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--bg-soft)]">
      <div className="grid gap-2 p-3 md:grid-cols-[minmax(0,1fr)_120px_120px_150px_auto]">
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={() => {
            if (title.trim() && title !== task.title) {
              void onPersist(task.id, { title: title.trim() });
            } else if (!title.trim()) {
              setTitle(task.title);
            }
          }}
        />
        <Select
          value={status}
          options={taskStatusOptions}
          onChange={(event) => {
            const nextStatus = event.target.value as BacklogTask['status'];
            setStatus(nextStatus);
            void onPersist(task.id, { status: nextStatus });
          }}
        />
        <Select
          value={type}
          options={taskTypeOptions}
          onChange={(event) => {
            const nextType = event.target.value as BacklogTask['type'];
            setType(nextType);
            void onPersist(task.id, { type: nextType });
          }}
        />
        <Input
          value={assignee}
          placeholder={assigneePlaceholder}
          onChange={(event) => setAssignee(event.target.value)}
          onBlur={() => {
            if (assignee !== (task.assignee ?? '')) {
              void onPersist(task.id, { assignee: assignee.trim() || null });
            }
          }}
        />
        {workspace ? (
          <Button size="sm" variant={showAiEditor ? 'default' : 'outline'} onClick={onToggleAiEditor}>
            <Sparkles data-icon="inline-start" />
            {showAiEditor ? t('artifactReviewClose') : t('docEditorOpenChat')}
          </Button>
        ) : null}
      </div>

      {showAiEditor && workspace ? (
        <div className="h-[460px] border-t border-[var(--line)]">
          <ArtifactEditorChat
            workspace={workspace}
            artifactContext={{
              target: { kind: 'backlog_task', workspaceId, id: task.id },
              mode: agentMode,
              sourceSurface: 'backlog',
              title: task.title,
            }}
            title={task.title}
            subtitle={`Task · ${storyId}`}
            mode={agentMode}
            onModeChange={onModeChange}
            onClose={onToggleAiEditor}
            onArtifactChangeProposal={onArtifactChangeProposal}
          />
        </div>
      ) : null}
    </div>
  );
}

export default function StoryTasksPanel({
  workspace,
  workspaceId,
  storyId,
  refreshNonce,
  onArtifactChangeProposal,
}: StoryTasksPanelProps) {
  const { t } = useTranslation('backlog');
  const { t: tContext } = useTranslation('context');
  const [tasks, setTasks] = useState<BacklogTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftType, setDraftType] = useState<BacklogTask['type']>('other');
  const [draftAssignee, setDraftAssignee] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskAgentMode, setTaskAgentMode] = useState<ArtifactChangeMode>('diff');

  const taskStatusOptions = useMemo(
    () => [
      { value: 'todo', label: t('taskStatusTodo') },
      { value: 'in_progress', label: t('taskStatusInProgress') },
      { value: 'done', label: t('taskStatusDone') },
    ],
    [t],
  );

  const taskTypeOptions = useMemo(
    () => [
      { value: 'frontend', label: t('taskTypeFrontend') },
      { value: 'backend', label: t('taskTypeBackend') },
      { value: 'test', label: t('taskTypeTest') },
      { value: 'other', label: t('taskTypeOther') },
    ],
    [t],
  );

  async function loadTasks() {
    setIsLoading(true);
    setError(null);

    try {
      const fetchedTasks = await window.nakiros.backlogGetTasks(workspaceId, storyId);
      setTasks(fetchedTasks.sort((a, b) => a.rank - b.rank || a.createdAt - b.createdAt));
    } catch {
      setError(t('taskLoadError'));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadTasks();
  }, [refreshNonce, storyId, workspaceId]);

  useEffect(() => {
    setEditingTaskId(null);
    setTaskAgentMode('diff');
  }, [storyId]);

  async function handleCreateTask() {
    if (!draftTitle.trim() || isCreating) return;
    setIsCreating(true);
    setError(null);

    try {
      const created = await window.nakiros.backlogCreateTask(workspaceId, storyId, {
        title: draftTitle.trim(),
        type: draftType,
        assignee: draftAssignee.trim() || undefined,
        rank: tasks.length,
      });
      setTasks((prev) => [...prev, created]);
      setDraftTitle('');
      setDraftType('other');
      setDraftAssignee('');
    } catch {
      setError(t('taskSaveError'));
    } finally {
      setIsCreating(false);
    }
  }

  async function handlePersistTask(taskId: string, patch: UpdateTaskPayload) {
    try {
      const updated = await window.nakiros.backlogUpdateTask(workspaceId, storyId, taskId, patch);
      setTasks((prev) => prev.map((task) => (task.id === taskId ? updated : task)));
      setError(null);
    } catch {
      setError(t('taskSaveError'));
      void loadTasks();
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[var(--line)] bg-[var(--bg-card)] p-4">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          {t('taskSectionTitle')}
        </span>
        <span className="rounded-full bg-[var(--bg-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text-muted)]">
          {t('taskCount', { count: tasks.length })}
        </span>
      </div>

      {workspace ? (
        <Card className="border-dashed shadow-none">
          <CardHeader className="pb-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="info">{tContext('docEditorChatTitle')}</Badge>
                  <Badge variant="muted">{taskAgentMode === 'diff' ? tContext('docEditorModeReview') : tContext('docEditorModeYolo')}</Badge>
                </div>
                <CardTitle className="mt-3 text-base">{t('taskAiAssistantTitle')}</CardTitle>
                <CardDescription className="mt-1">{t('taskAiAssistantBody')}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex gap-2 pt-0">
            <Button size="sm" variant={taskAgentMode === 'diff' ? 'default' : 'outline'} onClick={() => setTaskAgentMode('diff')}>
              {tContext('docEditorModeReview')}
            </Button>
            <Button size="sm" variant={taskAgentMode === 'yolo' ? 'default' : 'outline'} onClick={() => setTaskAgentMode('yolo')}>
              {tContext('docEditorModeYolo')}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {isLoading ? (
        <p className="text-xs text-[var(--text-muted)]">{t('taskLoading')}</p>
      ) : tasks.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">{t('noTasksEmpty')}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              workspace={workspace}
              workspaceId={workspaceId}
              storyId={storyId}
              task={task}
              taskStatusOptions={taskStatusOptions}
              taskTypeOptions={taskTypeOptions}
              assigneePlaceholder={t('assigneeLabel')}
              onPersist={handlePersistTask}
              showAiEditor={editingTaskId === task.id}
              agentMode={taskAgentMode}
              onModeChange={setTaskAgentMode}
              onToggleAiEditor={() => {
                setEditingTaskId((current) => current === task.id ? null : task.id);
                setTaskAgentMode('diff');
              }}
              onArtifactChangeProposal={onArtifactChangeProposal}
            />
          ))}
        </div>
      )}

      <div className="grid gap-2 rounded-lg border border-dashed border-[var(--line-strong)] bg-[var(--bg-soft)] p-3 md:grid-cols-[minmax(0,1fr)_120px_150px_auto]">
        <Input
          value={draftTitle}
          onChange={(event) => setDraftTitle(event.target.value)}
          placeholder={t('addTaskPlaceholder')}
        />
        <Select
          value={draftType}
          options={taskTypeOptions}
          onChange={(event) => setDraftType(event.target.value as BacklogTask['type'])}
        />
        <Input
          value={draftAssignee}
          onChange={(event) => setDraftAssignee(event.target.value)}
          placeholder={t('taskAssigneePlaceholder')}
        />
        <Button onClick={() => void handleCreateTask()} disabled={!draftTitle.trim() || isCreating}>
          <Plus size={12} />
          {t('addTask')}
        </Button>
      </div>

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}
