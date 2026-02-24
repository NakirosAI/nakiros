import type { StoredWorkspace } from '@tiqora/shared';
import { getValidAccessToken } from './jira-token-store.js';
import {
  fetchAllIssues,
  jiraIssueToLocalTicket,
  jiraIssueToLocalEpic,
  separateIssues,
} from './jira-connector.js';
import { bulkSaveTickets, bulkSaveEpics } from './ticket-storage.js';

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
  const { projectKey, jiraCloudId } = workspace;

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
    allIssues = await fetchAllIssues(accessToken, jiraCloudId, projectKey);
  } catch (err) {
    return { imported: 0, updated: 0, epicsImported: 0, error: String(err) };
  }

  const { epics, tickets } = separateIssues(allIssues);

  const localTickets = tickets.map(jiraIssueToLocalTicket);
  const localEpics = epics.map(jiraIssueToLocalEpic);

  const ticketResult = bulkSaveTickets(wsId, localTickets);
  const epicResult = bulkSaveEpics(wsId, localEpics);

  return {
    imported: ticketResult.created,
    updated: ticketResult.updated,
    epicsImported: epicResult.created + epicResult.updated,
  };
}
