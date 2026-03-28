import type { StoryRow } from './types.js';
import {
  buildJiraAuthHeader,
  mapJiraStatus,
  mapJiraPriority,
  extractAdfText,
} from './jira-import.js';

export interface SyncResult {
  synced: number;
  conflicts: number;
  errors: number;
}

export interface JiraStoryState {
  title: string;
  description: string | null;
  status: StoryRow['status'];
  priority: StoryRow['priority'];
  jiraUpdatedMs: number; // Jira `updated` field as Unix ms
}

export interface ConflictDiffField {
  nakiros: string | null;
  jira: string | null;
}

export interface ConflictDiff {
  storyId: string;
  provider: string;
  fields: Record<string, ConflictDiffField>;
}

export async function fetchJiraStoryState(
  story: StoryRow,
  baseUrl: string,
  authHeader: string,
): Promise<JiraStoryState> {
  const url = `${baseUrl}/rest/api/3/issue/${story.externalId}?fields=summary,description,status,priority,updated`;
  const res = await fetch(url, { headers: { Authorization: authHeader, Accept: 'application/json' } });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Jira API error ${res.status}: ${errText}`);
  }
  const data = (await res.json()) as {
    fields: {
      summary: string;
      description: unknown;
      status: { name: string };
      priority?: { name: string };
      updated: string; // ISO 8601
    };
  };
  return {
    title: data.fields.summary,
    description: extractAdfText(data.fields.description),
    status: mapJiraStatus(data.fields.status.name),
    priority: mapJiraPriority(data.fields.priority?.name),
    jiraUpdatedMs: new Date(data.fields.updated).getTime(),
  };
}

export function detectConflict(story: StoryRow, jira: JiraStoryState): ConflictDiff | null {
  const fields: Record<string, ConflictDiffField> = {};

  if (story.title !== jira.title) {
    fields['title'] = { nakiros: story.title, jira: jira.title };
  }
  if (story.status !== jira.status) {
    fields['status'] = { nakiros: story.status, jira: jira.status };
  }
  if (story.priority !== jira.priority) {
    fields['priority'] = { nakiros: story.priority, jira: jira.priority };
  }
  const nakDesc = story.description?.trim() ?? null;
  const jiraDesc = jira.description?.trim() ?? null;
  if (nakDesc !== jiraDesc) {
    fields['description'] = { nakiros: nakDesc, jira: jiraDesc };
  }

  if (Object.keys(fields).length === 0) return null;
  return { storyId: story.id, provider: story.externalSource ?? 'jira', fields };
}

// Re-export buildJiraAuthHeader for convenience in index.ts sync routes
export { buildJiraAuthHeader };
