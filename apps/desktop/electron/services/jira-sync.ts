import type { JiraSyncResult, StoredWorkspace } from '@nakiros/shared';
import {
  fetchAllIssues,
  jiraIssueToLocalTicket,
  jiraIssueToLocalEpic,
  separateIssues,
} from './jira-connector.js';
import { bulkSaveTickets, bulkSaveEpics, toWorkspaceSlug } from './ticket-storage.js';

export async function syncJiraTickets(args: {
  workspace: StoredWorkspace;
  accessToken: string;
  cloudId: string;
}): Promise<JiraSyncResult> {
  const { workspace, accessToken, cloudId } = args;
  const { projectKey } = workspace;

  if (!projectKey) {
    return { imported: 0, updated: 0, epicsImported: 0, error: 'No project key configured' };
  }

  let allIssues;
  try {
    allIssues = await fetchAllIssues(
      accessToken,
      cloudId,
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
