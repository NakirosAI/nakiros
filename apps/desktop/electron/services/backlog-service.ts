import type {
  BacklogEpic,
  BacklogSprint,
  BacklogStory,
  BacklogTask,
  CreateEpicPayload,
  CreateSprintPayload,
  CreateStoryPayload,
  CreateTaskPayload,
  UpdateEpicPayload,
  UpdateSprintPayload,
  UpdateStoryPayload,
  UpdateTaskPayload,
} from '@nakiros/shared';
import { ensureValidAccessToken } from './auth.js';

const WORKER_API = process.env['NAKIROS_API_URL'] ?? 'https://api.nakiros.com';

export async function getBacklogStories(workspaceId: string): Promise<BacklogStory[]> {
  const resolved = await ensureValidAccessToken();
  if (!resolved.token) return [];

  const response = await fetch(`${WORKER_API}/ws/${workspaceId}/stories`, {
    headers: { Authorization: `Bearer ${resolved.token}` },
  });

  if (!response.ok) return [];
  return (await response.json().catch(() => [])) as BacklogStory[];
}

export async function createBacklogEpic(workspaceId: string, body: CreateEpicPayload): Promise<BacklogEpic> {
  const resolved = await ensureValidAccessToken();
  if (!resolved.token) throw new Error('Not authenticated');

  const response = await fetch(`${WORKER_API}/ws/${workspaceId}/epics`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resolved.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) throw new Error(`Failed to create epic: ${response.status}`);
  return (await response.json()) as BacklogEpic;
}

export async function updateBacklogEpic(workspaceId: string, epicId: string, body: UpdateEpicPayload): Promise<BacklogEpic> {
  const resolved = await ensureValidAccessToken();
  if (!resolved.token) throw new Error('Not authenticated');

  const response = await fetch(`${WORKER_API}/ws/${workspaceId}/epics/${epicId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${resolved.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) throw new Error(`Failed to update epic: ${response.status}`);
  return (await response.json()) as BacklogEpic;
}

export async function createBacklogStory(workspaceId: string, body: CreateStoryPayload): Promise<BacklogStory> {
  const resolved = await ensureValidAccessToken();
  if (!resolved.token) throw new Error('Not authenticated');

  const response = await fetch(`${WORKER_API}/ws/${workspaceId}/stories`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resolved.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) throw new Error(`Failed to create story: ${response.status}`);
  return (await response.json()) as BacklogStory;
}

export async function updateBacklogStory(workspaceId: string, storyId: string, body: UpdateStoryPayload): Promise<BacklogStory> {
  const resolved = await ensureValidAccessToken();
  if (!resolved.token) throw new Error('Not authenticated');

  const response = await fetch(`${WORKER_API}/ws/${workspaceId}/stories/${storyId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${resolved.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) throw new Error(`Failed to update story: ${response.status}`);
  return (await response.json()) as BacklogStory;
}

export async function getBacklogEpics(workspaceId: string): Promise<BacklogEpic[]> {
  const resolved = await ensureValidAccessToken();
  if (!resolved.token) return [];

  const response = await fetch(`${WORKER_API}/ws/${workspaceId}/epics`, {
    headers: { Authorization: `Bearer ${resolved.token}` },
  });

  if (!response.ok) return [];
  return (await response.json().catch(() => [])) as BacklogEpic[];
}

export async function getBacklogTasks(workspaceId: string, storyId: string): Promise<BacklogTask[]> {
  const resolved = await ensureValidAccessToken();
  if (!resolved.token) return [];

  const response = await fetch(`${WORKER_API}/ws/${workspaceId}/stories/${storyId}/tasks`, {
    headers: { Authorization: `Bearer ${resolved.token}` },
  });

  if (!response.ok) return [];
  return (await response.json().catch(() => [])) as BacklogTask[];
}

export async function createBacklogTask(workspaceId: string, storyId: string, body: CreateTaskPayload): Promise<BacklogTask> {
  const resolved = await ensureValidAccessToken();
  if (!resolved.token) throw new Error('Not authenticated');

  const response = await fetch(`${WORKER_API}/ws/${workspaceId}/stories/${storyId}/tasks`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resolved.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) throw new Error(`Failed to create task: ${response.status}`);
  return (await response.json()) as BacklogTask;
}

export async function updateBacklogTask(
  workspaceId: string,
  storyId: string,
  taskId: string,
  body: UpdateTaskPayload,
): Promise<BacklogTask> {
  const resolved = await ensureValidAccessToken();
  if (!resolved.token) throw new Error('Not authenticated');

  const response = await fetch(`${WORKER_API}/ws/${workspaceId}/stories/${storyId}/tasks/${taskId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${resolved.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) throw new Error(`Failed to update task: ${response.status}`);
  return (await response.json()) as BacklogTask;
}

export async function getBacklogSprints(workspaceId: string): Promise<BacklogSprint[]> {
  const resolved = await ensureValidAccessToken();
  if (!resolved.token) return [];

  const response = await fetch(`${WORKER_API}/ws/${workspaceId}/sprints`, {
    headers: { Authorization: `Bearer ${resolved.token}` },
  });

  if (!response.ok) return [];
  return (await response.json().catch(() => [])) as BacklogSprint[];
}

export async function createBacklogSprint(workspaceId: string, body: CreateSprintPayload): Promise<BacklogSprint> {
  const resolved = await ensureValidAccessToken();
  if (!resolved.token) throw new Error('Not authenticated');

  const response = await fetch(`${WORKER_API}/ws/${workspaceId}/sprints`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resolved.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) throw new Error(`Failed to create sprint: ${response.status}`);
  return (await response.json()) as BacklogSprint;
}

export async function updateBacklogSprint(workspaceId: string, sprintId: string, body: UpdateSprintPayload): Promise<BacklogSprint> {
  const resolved = await ensureValidAccessToken();
  if (!resolved.token) throw new Error('Not authenticated');

  const response = await fetch(`${WORKER_API}/ws/${workspaceId}/sprints/${sprintId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${resolved.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({})) as { error?: string; code?: string };
    const err = new Error(errorBody.error ?? `Failed to update sprint: ${response.status}`) as Error & { code?: string };
    err.code = errorBody.code;
    throw err;
  }
  return (await response.json()) as BacklogSprint;
}
