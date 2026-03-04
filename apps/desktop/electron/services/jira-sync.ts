import type { StoredWorkspace } from '@nakiros/shared';
import { getValidAccessToken, loadTokens } from './jira-token-store.js';
import {
  fetchAllIssues,
  jiraIssueToLocalTicket,
  jiraIssueToLocalEpic,
  separateIssues,
} from './jira-connector.js';
import { bulkSaveTickets, bulkSaveEpics, toWorkspaceSlug } from './ticket-storage.js';

export interface JiraSyncResult {
  imported: number;
  updated: number;
  epicsImported: number;
  error?: string;
}

export async function syncJiraTickets(
  wsId: string,
  workspace: StoredWorkspace,
): Promise<JiraSyncResult> {
  const { projectKey } = workspace;
  // jiraCloudId may not be on the workspace object for draft workspaces —
  // fall back to the token store which always has it after OAuth
  const jiraCloudId = workspace.jiraCloudId ?? loadTokens(wsId)?.cloudId;

  if (!projectKey) {
    return { imported: 0, updated: 0, epicsImported: 0, error: 'No project key configured' };
  }
  if (!jiraCloudId) {
    return { imported: 0, updated: 0, epicsImported: 0, error: 'Not connected to Jira' };
  }

  let accessToken: string;
  try {
    accessToken = await getValidAccessToken(wsId);
  } catch (err) {
    return { imported: 0, updated: 0, epicsImported: 0, error: String(err) };
  }

  let allIssues;
  try {
    allIssues = await fetchAllIssues(
      accessToken,
      jiraCloudId,
      projectKey,
      workspace.syncFilter ?? 'all',
      workspace.boardType ?? 'unknown',
    );
  } catch (err) {
    return { imported: 0, updated: 0, epicsImported: 0, error: String(err) };
  }

  const { epics, tickets } = separateIssues(allIssues);

  const localTickets = tickets.map(jiraIssueToLocalTicket);
  const localEpics = epics.map(jiraIssueToLocalEpic);

  const slug = toWorkspaceSlug(workspace.name);
  const ticketResult = bulkSaveTickets(slug, localTickets);
  const epicResult = bulkSaveEpics(slug, localEpics);

  return {
    imported: ticketResult.created,
    updated: ticketResult.updated,
    epicsImported: epicResult.created + epicResult.updated,
  };
}
