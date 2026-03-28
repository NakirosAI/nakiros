import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react';
import { Button, Input, Modal, Select, Textarea } from '../ui';
import StoryTasksPanel from './StoryTasksPanel';

interface Props {
  workspaceId: string;
  story: BacklogStory;
  epics: BacklogEpic[];
  sprints: BacklogSprint[];
  onUpdate: (partial: UpdateStoryPayload) => Promise<void>;
  onClose: () => void;
}

const PRIORITY_OPTIONS = [
  { value: 'high', label: 'HIGH' },
  { value: 'medium', label: 'MED' },
  { value: 'low', label: 'LOW' },
];

export default function StoryEditPopover({ workspaceId, story, epics, sprints, onUpdate, onClose }: Props) {
  const { t } = useTranslation('backlog');

  const [title, setTitle] = useState(story.title);
  const [description, setDescription] = useState(story.description ?? '');
  const [criteria, setCriteria] = useState<string[]>(story.acceptanceCriteria ?? []);
  const [storyPoints, setStoryPoints] = useState(story.storyPoints != null ? String(story.storyPoints) : '');
  const [priority, setPriority] = useState(story.priority);
  const [status, setStatus] = useState(story.status);
  const [assignee, setAssignee] = useState(story.assignee ?? '');
  const [epicId, setEpicId] = useState(story.epicId ?? 'unassigned');
  const [sprintId, setSprintId] = useState(story.sprintId ?? 'backlog');

  useEffect(() => {
    setTitle(story.title);
    setDescription(story.description ?? '');
    setCriteria(story.acceptanceCriteria ?? []);
    setStoryPoints(story.storyPoints != null ? String(story.storyPoints) : '');
    setPriority(story.priority);
    setStatus(story.status);
    setAssignee(story.assignee ?? '');
    setEpicId(story.epicId ?? 'unassigned');
    setSprintId(story.sprintId ?? 'backlog');
  }, [story]);

  const storyStatusOptions = [
    { value: 'backlog', label: t('storyStatusBacklog') },
    { value: 'todo', label: t('storyStatusTodo') },
    { value: 'in_progress', label: t('storyStatusInProgress') },
    { value: 'in_review', label: t('storyStatusInReview') },
    { value: 'done', label: t('storyStatusDone') },
  ];

  const epicOptions = [
    { value: 'unassigned', label: t('unassigned') },
    ...epics.map((epic) => ({ value: epic.id, label: epic.name })),
  ];

  const sprintOptions = [
    { value: 'backlog', label: t('storyBacklogPlacement') },
    ...sprints
      .filter((sprint) => sprint.status !== 'completed')
      .map((sprint) => ({ value: sprint.id, label: sprint.name })),
  ];

  function handleCriterionChange(index: number, value: string) {
    setCriteria((prev) => prev.map((c, i) => (i === index ? value : c)));
  }

  function handleCriterionBlur(updatedCriteria: string[]) {
    void onUpdate({ acceptanceCriteria: updatedCriteria });
  }

  function addCriterion() {
    setCriteria((prev) => [...prev, '']);
  }

  function removeCriterion(index: number) {
    const updated = criteria.filter((_, i) => i !== index);
    setCriteria(updated);
    void onUpdate({ acceptanceCriteria: updated });
  }

  return (
    <Modal isOpen onClose={onClose} title={t('editStory')} size="md">
      <div className="flex flex-col gap-4">
        {/* Title */}
        <Input
          label={t('titleLabel')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => void onUpdate({ title })}
        />

        {/* Priority + Points */}
        <div className="flex gap-3">
          <Select
            label={t('filterPriority')}
            value={priority}
            options={PRIORITY_OPTIONS}
            onChange={(e) => {
              const val = e.target.value as 'high' | 'medium' | 'low';
              setPriority(val);
              void onUpdate({ priority: val });
            }}
            containerClassName="flex-1"
          />
          <Select
            label={t('storyStatusLabel')}
            value={status}
            options={storyStatusOptions}
            onChange={(e) => {
              const value = e.target.value as BacklogStory['status'];
              setStatus(value);
              void onUpdate({ status: value });
            }}
            containerClassName="flex-1"
          />
          <Input
            label={t('storyPointsLabel')}
            type="number"
            min={0}
            value={storyPoints}
            onChange={(e) => setStoryPoints(e.target.value)}
            onBlur={() => void onUpdate({ storyPoints: storyPoints !== '' ? Number(storyPoints) : null })}
            containerClassName="w-20"
          />
        </div>

        <div className="flex gap-3">
          <Select
            label={t('filterEpic')}
            value={epicId}
            options={epicOptions}
            onChange={(event) => {
              const value = event.target.value;
              setEpicId(value);
              void onUpdate({ epicId: value === 'unassigned' ? null : value });
            }}
            containerClassName="flex-1"
          />
          <Select
            label={t('sprintSectionTitle')}
            value={sprintId}
            options={sprintOptions}
            onChange={(event) => {
              const value = event.target.value;
              setSprintId(value);
              void onUpdate({ sprintId: value === 'backlog' ? null : value });
            }}
            containerClassName="flex-1"
          />
        </div>

        {/* Assignee */}
        <Input
          label={t('assigneeLabel')}
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
          onBlur={() => void onUpdate({ assignee: assignee || null })}
        />

        {/* Description */}
        <Textarea
          label={t('descriptionLabel')}
          value={description}
          rows={3}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => void onUpdate({ description: description || null })}
        />

        {/* Acceptance Criteria */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            {t('acceptanceCriteriaLabel')}
          </span>
          <div className="flex flex-col gap-1">
            {criteria.map((criterion, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={criterion}
                  onChange={(e) => handleCriterionChange(i, e.target.value)}
                  onBlur={() => handleCriterionBlur(criteria)}
                  className="ui-form-control min-w-0 flex-1 rounded-md border border-[var(--line)] bg-[var(--bg-soft)] px-2.5 py-2 text-xs text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:outline-none"
                />
                <Button size="icon" variant="ghost" className="size-7 shrink-0" onClick={() => removeCriterion(i)}>
                  <X size={12} />
                </Button>
              </div>
            ))}
          </div>
          <Button size="sm" variant="ghost" className="self-start" onClick={addCriterion}>
            <Plus size={12} />
            {t('addCriterion')}
          </Button>
        </div>

        <StoryTasksPanel workspaceId={workspaceId} storyId={story.id} />
      </div>
    </Modal>
  );
}
