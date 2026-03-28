import type {
  ArtifactChangeMode,
  ArtifactContext,
  ArtifactTarget,
  BacklogEpic,
  BacklogSprint,
  BacklogStory,
  BacklogTask,
  UpdateEpicPayload,
  UpdateSprintPayload,
  UpdateStoryPayload,
  UpdateTaskPayload,
} from '@nakiros/shared';

interface ArtifactSnapshot {
  content: string;
  title: string;
}

interface ParsedFrontmatter {
  meta: Record<string, string>;
  body: string;
}

interface BacklogTaskLookup {
  story: BacklogStory;
  task: BacklogTask;
}

function basename(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path;
}

function normalizeComparable(content: string): string {
  return content.replace(/\r\n/g, '\n').trim();
}

function nullishToString(value: string | number | null | undefined): string {
  return value == null ? '' : String(value);
}

function escapeFrontmatterValue(value: string | number | null | undefined): string {
  const normalized = nullishToString(value).replace(/\r?\n/g, ' ').trim();
  return normalized;
}

function parseFrontmatter(markdown: string): ParsedFrontmatter {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: markdown.trim() };

  const rawMeta = match[1] ?? '';
  const body = (match[2] ?? '').trim();
  const meta: Record<string, string> = {};
  for (const line of rawMeta.split('\n')) {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex < 0) continue;
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (!key) continue;
    meta[key] = value;
  }
  return { meta, body };
}

function sectionRegex(label: string): RegExp {
  return new RegExp(`(?:^|\\n)## ${label}\\n([\\s\\S]*?)(?=\\n## |$)`, 'i');
}

function extractSection(body: string, label: string): string {
  const match = body.match(sectionRegex(label));
  return (match?.[1] ?? '').trim();
}

function parseNullableString(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed ? trimmed : null;
}

function parseNullableNumber(value: string | undefined): number | null {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function serializeAcceptanceCriteria(criteria: string[] | null | undefined): string {
  const items = (criteria ?? []).map((item) => item.trim()).filter(Boolean);
  return items.length > 0 ? items.map((item) => `- ${item}`).join('\n') : '';
}

function parseAcceptanceCriteria(body: string): string[] | null {
  const section = extractSection(body, 'Acceptance Criteria');
  if (!section) return null;
  const items = section
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).trim())
    .filter(Boolean);
  return items.length > 0 ? items : [];
}

function serializeBacklogStory(story: BacklogStory): string {
  const description = story.description?.trim() ?? '';
  const criteria = serializeAcceptanceCriteria(story.acceptanceCriteria);
  return [
    '---',
    `kind: backlog_story`,
    `id: ${escapeFrontmatterValue(story.id)}`,
    `title: ${escapeFrontmatterValue(story.title)}`,
    `status: ${escapeFrontmatterValue(story.status)}`,
    `priority: ${escapeFrontmatterValue(story.priority)}`,
    `storyPoints: ${escapeFrontmatterValue(story.storyPoints)}`,
    `epicId: ${escapeFrontmatterValue(story.epicId)}`,
    `sprintId: ${escapeFrontmatterValue(story.sprintId)}`,
    `assignee: ${escapeFrontmatterValue(story.assignee)}`,
    '---',
    '',
    '## Description',
    description,
    '',
    '## Acceptance Criteria',
    criteria,
  ].join('\n').trim();
}

function parseStoryMarkdown(markdown: string): UpdateStoryPayload {
  const { meta, body } = parseFrontmatter(markdown);
  return {
    title: meta['title']?.trim() || 'Untitled story',
    status: (meta['status'] as BacklogStory['status'] | undefined) ?? 'backlog',
    priority: (meta['priority'] as BacklogStory['priority'] | undefined) ?? 'medium',
    storyPoints: parseNullableNumber(meta['storyPoints']),
    epicId: parseNullableString(meta['epicId']),
    sprintId: parseNullableString(meta['sprintId']),
    assignee: parseNullableString(meta['assignee']),
    description: parseNullableString(extractSection(body, 'Description')),
    acceptanceCriteria: parseAcceptanceCriteria(body),
  };
}

function serializeBacklogEpic(epic: BacklogEpic): string {
  return [
    '---',
    'kind: backlog_epic',
    `id: ${escapeFrontmatterValue(epic.id)}`,
    `name: ${escapeFrontmatterValue(epic.name)}`,
    `status: ${escapeFrontmatterValue(epic.status)}`,
    `color: ${escapeFrontmatterValue(epic.color)}`,
    '---',
    '',
    '## Description',
    epic.description?.trim() ?? '',
  ].join('\n').trim();
}

function parseEpicMarkdown(markdown: string): UpdateEpicPayload {
  const { meta, body } = parseFrontmatter(markdown);
  return {
    name: meta['name']?.trim() || 'Untitled epic',
    status: (meta['status'] as BacklogEpic['status'] | undefined) ?? 'backlog',
    color: parseNullableString(meta['color']),
    description: parseNullableString(extractSection(body, 'Description')),
  };
}

function serializeBacklogSprint(sprint: BacklogSprint): string {
  return [
    '---',
    'kind: backlog_sprint',
    `id: ${escapeFrontmatterValue(sprint.id)}`,
    `name: ${escapeFrontmatterValue(sprint.name)}`,
    `status: ${escapeFrontmatterValue(sprint.status)}`,
    `startDate: ${escapeFrontmatterValue(sprint.startDate)}`,
    `endDate: ${escapeFrontmatterValue(sprint.endDate)}`,
    '---',
    '',
    '## Goal',
    sprint.goal?.trim() ?? '',
  ].join('\n').trim();
}

function parseSprintMarkdown(markdown: string): UpdateSprintPayload {
  const { meta, body } = parseFrontmatter(markdown);
  return {
    name: meta['name']?.trim() || 'Untitled sprint',
    status: (meta['status'] as BacklogSprint['status'] | undefined) ?? 'planning',
    startDate: parseNullableNumber(meta['startDate']),
    endDate: parseNullableNumber(meta['endDate']),
    goal: parseNullableString(extractSection(body, 'Goal')),
  };
}

function serializeBacklogTask(task: BacklogTask): string {
  return [
    '---',
    'kind: backlog_task',
    `id: ${escapeFrontmatterValue(task.id)}`,
    `title: ${escapeFrontmatterValue(task.title)}`,
    `type: ${escapeFrontmatterValue(task.type)}`,
    `status: ${escapeFrontmatterValue(task.status)}`,
    `assignee: ${escapeFrontmatterValue(task.assignee)}`,
    '---',
    '',
    '## Description',
    task.description?.trim() ?? '',
  ].join('\n').trim();
}

function parseTaskMarkdown(markdown: string): UpdateTaskPayload {
  const { meta, body } = parseFrontmatter(markdown);
  return {
    title: meta['title']?.trim() || 'Untitled task',
    type: (meta['type'] as BacklogTask['type'] | undefined) ?? 'other',
    status: (meta['status'] as BacklogTask['status'] | undefined) ?? 'todo',
    assignee: parseNullableString(meta['assignee']),
    description: parseNullableString(extractSection(body, 'Description')),
  };
}

async function findBacklogStory(workspaceId: string, id: string): Promise<BacklogStory> {
  const stories = await window.nakiros.backlogGetStories(workspaceId);
  const story = stories.find((item) => item.id === id);
  if (!story) throw new Error(`Backlog story not found: ${id}`);
  return story;
}

async function findBacklogEpic(workspaceId: string, id: string): Promise<BacklogEpic> {
  const epics = await window.nakiros.backlogGetEpics(workspaceId);
  const epic = epics.find((item) => item.id === id);
  if (!epic) throw new Error(`Backlog epic not found: ${id}`);
  return epic;
}

async function findBacklogSprint(workspaceId: string, id: string): Promise<BacklogSprint> {
  const sprints = await window.nakiros.backlogGetSprints(workspaceId);
  const sprint = sprints.find((item) => item.id === id);
  if (!sprint) throw new Error(`Backlog sprint not found: ${id}`);
  return sprint;
}

async function findBacklogTask(workspaceId: string, id: string): Promise<BacklogTaskLookup> {
  const stories = await window.nakiros.backlogGetStories(workspaceId);
  for (const story of stories) {
    const tasks = await window.nakiros.backlogGetTasks(workspaceId, story.id);
    const task = tasks.find((item) => item.id === id);
    if (task) return { story, task };
  }
  throw new Error(`Backlog task not found: ${id}`);
}

function getDocTitle(path: string): string {
  return basename(path);
}

export function artifactTargetLabel(target: ArtifactTarget): string {
  if (target.kind === 'workspace_doc') return getDocTitle(target.absolutePath);
  if (target.kind === 'backlog_epic') return 'Backlog Epic';
  if (target.kind === 'backlog_story') return 'Backlog Story';
  if (target.kind === 'backlog_task') return 'Backlog Task';
  return 'Backlog Sprint';
}

export function buildArtifactContextRunMessage(
  artifactContext: ArtifactContext | null | undefined,
  userMessage: string,
): string {
  if (!artifactContext) return userMessage;

  const targetDescriptor = artifactContext.target.kind === 'workspace_doc'
    ? `{"kind":"workspace_doc","absolutePath":"${artifactContext.target.absolutePath.replace(/"/g, '\\"')}"}`
    : `{"kind":"${artifactContext.target.kind}","workspaceId":"${artifactContext.target.workspaceId.replace(/"/g, '\\"')}","id":"${artifactContext.target.id.replace(/"/g, '\\"')}"}`;

  return [
    'You are editing a specific artifact.',
    `Mode: ${artifactContext.mode}.`,
    'If you propose a modification, return exactly one artifact block using this envelope:',
    '<!-- nakiros-artifact-change {json metadata} -->',
    'FULL RESULTING CONTENT',
    '<!-- /nakiros-artifact-change -->',
    'Metadata must include the exact target below.',
    `Exact target: ${targetDescriptor}`,
    'The body must contain the full resulting artifact content, not a patch.',
    'Do not claim the artifact was written when mode is diff.',
    '',
    userMessage,
  ].join('\n');
}

export async function readArtifactSnapshot(target: ArtifactTarget): Promise<ArtifactSnapshot> {
  if (target.kind === 'workspace_doc') {
    return {
      content: await window.nakiros.readDoc(target.absolutePath),
      title: getDocTitle(target.absolutePath),
    };
  }

  if (target.kind === 'backlog_story') {
    const story = await findBacklogStory(target.workspaceId, target.id);
    return { content: serializeBacklogStory(story), title: story.title };
  }

  if (target.kind === 'backlog_epic') {
    const epic = await findBacklogEpic(target.workspaceId, target.id);
    return { content: serializeBacklogEpic(epic), title: epic.name };
  }

  if (target.kind === 'backlog_sprint') {
    const sprint = await findBacklogSprint(target.workspaceId, target.id);
    return { content: serializeBacklogSprint(sprint), title: sprint.name };
  }

  const { task } = await findBacklogTask(target.workspaceId, target.id);
  return { content: serializeBacklogTask(task), title: task.title };
}

export async function applyArtifactSnapshot(target: ArtifactTarget, proposedContent: string): Promise<void> {
  if (target.kind === 'workspace_doc') {
    await window.nakiros.writeDoc(target.absolutePath, proposedContent);
    return;
  }

  if (target.kind === 'backlog_story') {
    await window.nakiros.backlogUpdateStory(
      target.workspaceId,
      target.id,
      parseStoryMarkdown(proposedContent),
    );
    return;
  }

  if (target.kind === 'backlog_epic') {
    await window.nakiros.backlogUpdateEpic(
      target.workspaceId,
      target.id,
      parseEpicMarkdown(proposedContent),
    );
    return;
  }

  if (target.kind === 'backlog_sprint') {
    await window.nakiros.backlogUpdateSprint(
      target.workspaceId,
      target.id,
      parseSprintMarkdown(proposedContent),
    );
    return;
  }

  const { story } = await findBacklogTask(target.workspaceId, target.id);
  await window.nakiros.backlogUpdateTask(
    target.workspaceId,
    story.id,
    target.id,
    parseTaskMarkdown(proposedContent),
  );
}

export async function rollbackArtifactSnapshot(target: ArtifactTarget, baselineContent: string): Promise<void> {
  await applyArtifactSnapshot(target, baselineContent);
}

export async function hasArtifactBaselineConflict(target: ArtifactTarget, baselineContent: string): Promise<boolean> {
  const current = await readArtifactSnapshot(target);
  return normalizeComparable(current.content) !== normalizeComparable(baselineContent);
}

export function resolveArtifactMode(
  explicitMode: ArtifactChangeMode | null | undefined,
  fallbackMode: ArtifactChangeMode | null | undefined,
): ArtifactChangeMode {
  return explicitMode ?? fallbackMode ?? 'diff';
}
