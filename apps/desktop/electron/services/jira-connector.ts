import type { LocalTicket, LocalEpic, TicketStatus, TicketPriority } from '@nakiros/shared';

// ─── ADF (Atlassian Document Format) → plain text ─────────────────────────────

interface AdfNode {
  type: string;
  text?: string;
  content?: AdfNode[];
}

function adfToPlainText(adf: AdfNode | null | undefined): string {
  if (!adf) return '';
  const parts: string[] = [];
  function walk(node: AdfNode): void {
    if (node.type === 'text' && node.text) parts.push(node.text);
    if (node.type === 'hardBreak') parts.push('\n');
    if (node.content) for (const child of node.content) walk(child);
  }
  walk(adf);
  return parts.join('').trim();
}

// ─── Status / Priority mapping ────────────────────────────────────────────────

function mapStatus(statusCategoryKey: string): TicketStatus {
  switch (statusCategoryKey) {
    case 'indeterminate': return 'in_progress';
    case 'done':          return 'done';
    case 'new':           return 'todo';
    default:              return 'backlog';
  }
}

function mapPriority(priorityName: string | undefined): TicketPriority {
  if (!priorityName) return 'medium';
  const lower = priorityName.toLowerCase();
  if (lower === 'highest' || lower === 'high' || lower === 'critical') return 'high';
  if (lower === 'low' || lower === 'lowest') return 'low';
  return 'medium';
}

// ─── Jira API types ───────────────────────────────────────────────────────────

interface JiraIssueFields {
  summary: string;
  description: AdfNode | null;
  status: { name: string; statusCategory: { key: string } };
  priority: { name: string } | null;
  issuetype: { name: string };
  parent?: {
    key: string;
    fields: { issuetype: { name: string } };
  };
  created: string;
  updated: string;
  labels: string[];
}

export interface JiraIssue {
  id: string;
  key: string;
  fields: JiraIssueFields;
}

export interface JiraProject {
  id: string;
  key: string;
  name: string;
  projectTypeKey: string;
}


interface JiraSearchJqlResponse {
  issues: JiraIssue[];
  nextPageToken?: string;
}

interface JiraProjectSearchResponse {
  values: JiraProject[];
  total: number;
  isLast: boolean;
}

// ─── API client ───────────────────────────────────────────────────────────────

const JIRA_API_BASE = 'https://api.atlassian.com/ex/jira';
const ISSUE_FIELDS = ['summary', 'description', 'status', 'priority', 'issuetype', 'parent', 'created', 'updated', 'labels'];
const MAX_RESULTS = 100;

async function jiraGet<T>(accessToken: string, cloudId: string, path: string): Promise<T> {
  const response = await fetch(`${JIRA_API_BASE}/${cloudId}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Jira API ${response.status} on ${path}: ${body}`);
  }
  return response.json() as Promise<T>;
}

async function jiraPost<T>(accessToken: string, cloudId: string, path: string, body: unknown): Promise<T> {
  const response = await fetch(`${JIRA_API_BASE}/${cloudId}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Jira API ${response.status} on POST ${path}: ${text}`);
  }
  return response.json() as Promise<T>;
}

// ─── Projects ─────────────────────────────────────────────────────────────────

export async function fetchProjects(
  accessToken: string,
  cloudId: string,
): Promise<JiraProject[]> {
  const allProjects: JiraProject[] = [];
  let startAt = 0;
  while (true) {
    const data = await jiraGet<JiraProjectSearchResponse>(
      accessToken,
      cloudId,
      `/rest/api/3/project/search?maxResults=50&startAt=${startAt}&orderBy=name`,
    );
    allProjects.push(...data.values);
    if (data.isLast || data.values.length === 0) break;
    startAt += 50;
  }
  return allProjects;
}

// ─── Boards ───────────────────────────────────────────────────────────────────

interface JiraBoard {
  id: number;
  name: string;
  type: 'scrum' | 'kanban' | 'simple';
}

interface JiraBoardsResponse {
  values: JiraBoard[];
}

export async function fetchProjectBoardType(
  accessToken: string,
  cloudId: string,
  projectKey: string,
): Promise<{ boardType: 'scrum' | 'kanban' | 'unknown'; boardId: string | null }> {
  try {
    const data = await jiraGet<JiraBoardsResponse>(
      accessToken,
      cloudId,
      `/rest/agile/1.0/board?projectKeyOrId=${projectKey}&maxResults=10`,
    );
    const board = data.values[0];
    if (!board) return { boardType: 'unknown', boardId: null };
    const boardType = board.type === 'scrum' ? 'scrum' : board.type === 'kanban' ? 'kanban' : 'unknown';
    return { boardType, boardId: String(board.id) };
  } catch {
    return { boardType: 'unknown', boardId: null };
  }
}

// ─── Issues ───────────────────────────────────────────────────────────────────

type SyncFilter = 'sprint_active' | 'last_3_months' | 'all';
type BoardType = 'scrum' | 'kanban' | 'unknown';

function buildJql(projectKey: string, syncFilter: SyncFilter, boardType: BoardType): string {
  switch (syncFilter) {
    case 'sprint_active':
      if (boardType === 'scrum') {
        return `project = '${projectKey}' AND sprint in openSprints() ORDER BY created DESC`;
      }
      // kanban or unknown: tickets not done
      return `project = '${projectKey}' AND statusCategory != Done ORDER BY created DESC`;
    case 'last_3_months':
      return `project = '${projectKey}' AND updated >= -90d ORDER BY created DESC`;
    case 'all':
    default:
      return `project = '${projectKey}' ORDER BY created DESC`;
  }
}

const COUNT_SAMPLE = 200;

export async function countIssues(
  accessToken: string,
  cloudId: string,
  projectKey: string,
  syncFilter: SyncFilter = 'all',
  boardType: BoardType = 'unknown',
): Promise<{ count: number; hasMore: boolean }> {
  const jql = buildJql(projectKey, syncFilter, boardType);
  const data = await jiraPost<JiraSearchJqlResponse>(
    accessToken,
    cloudId,
    '/rest/api/3/search/jql',
    { jql, fields: ['id'], maxResults: COUNT_SAMPLE },
  );
  return { count: data.issues.length, hasMore: !!data.nextPageToken };
}

export async function fetchAllIssues(
  accessToken: string,
  cloudId: string,
  projectKey: string,
  syncFilter: SyncFilter = 'all',
  boardType: BoardType = 'unknown',
): Promise<JiraIssue[]> {
  const allIssues: JiraIssue[] = [];
  const jql = buildJql(projectKey, syncFilter, boardType);
  let nextPageToken: string | undefined;

  while (true) {
    const body: Record<string, unknown> = { jql, fields: ISSUE_FIELDS, maxResults: MAX_RESULTS };
    if (nextPageToken) body['nextPageToken'] = nextPageToken;

    const data = await jiraPost<JiraSearchJqlResponse>(
      accessToken,
      cloudId,
      '/rest/api/3/search/jql',
      body,
    );
    allIssues.push(...data.issues);

    if (!data.nextPageToken || data.issues.length < MAX_RESULTS) break;
    nextPageToken = data.nextPageToken;
  }

  return allIssues;
}

// ─── Converters ───────────────────────────────────────────────────────────────

export function jiraIssueToLocalTicket(issue: JiraIssue): LocalTicket {
  const now = new Date().toISOString();
  const parentIsEpic = issue.fields.parent?.fields.issuetype.name === 'Epic';
  return {
    id: issue.key,
    title: issue.fields.summary,
    description: adfToPlainText(issue.fields.description),
    acceptanceCriteria: [],
    status: mapStatus(issue.fields.status.statusCategory.key),
    priority: mapPriority(issue.fields.priority?.name),
    epicId: parentIsEpic ? issue.fields.parent!.key : undefined,
    blockedBy: [],
    createdAt: issue.fields.created ?? now,
    updatedAt: issue.fields.updated ?? now,
  };
}

const EPIC_COLORS = ['#7C3AED', '#2563EB', '#059669', '#D97706', '#DC2626', '#DB2777'];

export function jiraIssueToLocalEpic(issue: JiraIssue): LocalEpic {
  const colorIndex = issue.key.charCodeAt(issue.key.length - 1) % EPIC_COLORS.length;
  return {
    id: issue.key,
    name: issue.fields.summary,
    description: adfToPlainText(issue.fields.description),
    color: EPIC_COLORS[colorIndex]!,
  };
}

export function separateIssues(issues: JiraIssue[]): {
  epics: JiraIssue[];
  tickets: JiraIssue[];
} {
  return {
    epics: issues.filter((i) => i.fields.issuetype.name === 'Epic'),
    tickets: issues.filter((i) => i.fields.issuetype.name !== 'Epic'),
  };
}
