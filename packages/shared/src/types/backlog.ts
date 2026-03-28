export type BacklogPriority = 'low' | 'medium' | 'high';
export type BacklogStoryStatus = 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done';
export type BacklogEpicStatus = 'backlog' | 'in_progress' | 'done';
export type BacklogTaskType = 'backend' | 'frontend' | 'test' | 'other';
export type BacklogTaskStatus = 'todo' | 'in_progress' | 'done';
export type BacklogExternalSource = 'jira' | 'linear' | 'github' | 'gitlab' | null;

export interface CreateStoryPayload {
  title: string;
  epicId?: string;
  sprintId?: string;
  description?: string;
  acceptanceCriteria?: string[];
  status?: BacklogStoryStatus;
  priority?: BacklogPriority;
  assignee?: string;
  storyPoints?: number;
  rank?: number;
}

export interface UpdateStoryPayload {
  title?: string;
  epicId?: string | null;
  sprintId?: string | null;
  description?: string | null;
  acceptanceCriteria?: string[] | null;
  status?: BacklogStoryStatus;
  priority?: BacklogPriority;
  assignee?: string | null;
  storyPoints?: number | null;
  rank?: number;
}

export interface BacklogStory {
  id: string;
  workspaceId: string;
  epicId: string | null;
  sprintId: string | null;
  title: string;
  description: string | null;
  acceptanceCriteria: string[] | null;
  status: BacklogStoryStatus;
  priority: BacklogPriority;
  assignee: string | null;
  storyPoints: number | null;
  rank: number;
  externalId: string | null;
  externalSource: BacklogExternalSource;
  lastSyncedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface CreateEpicPayload {
  name: string;
  description?: string;
  color?: string;
  rank?: number;
}

export interface UpdateEpicPayload {
  name?: string;
  description?: string | null;
  color?: string | null;
  status?: BacklogEpicStatus;
  rank?: number;
}

export interface BacklogEpic {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  color: string | null;
  status: BacklogEpicStatus;
  rank: number;
  externalId: string | null;
  externalSource: BacklogExternalSource;
  createdAt: number;
  updatedAt: number;
}

export interface BacklogSprint {
  id: string;
  workspaceId: string;
  name: string;
  goal: string | null;
  startDate: number | null;
  endDate: number | null;
  status: 'planning' | 'active' | 'completed';
  createdAt: number;
  updatedAt: number;
}

export interface CreateSprintPayload {
  name: string;
  goal?: string;
  startDate?: number;
  endDate?: number;
}

export interface UpdateSprintPayload {
  name?: string;
  goal?: string | null;
  startDate?: number | null;
  endDate?: number | null;
  status?: BacklogSprint['status'];
}

export interface CreateTaskPayload {
  title: string;
  description?: string;
  type?: BacklogTaskType;
  assignee?: string;
  rank?: number;
}

export interface UpdateTaskPayload {
  title?: string;
  description?: string | null;
  type?: BacklogTaskType;
  status?: BacklogTaskStatus;
  assignee?: string | null;
  rank?: number;
}

export interface BacklogTask {
  id: string;
  storyId: string;
  title: string;
  description: string | null;
  type: BacklogTaskType;
  status: BacklogTaskStatus;
  assignee: string | null;
  rank: number;
  createdAt: number;
  updatedAt: number;
}
