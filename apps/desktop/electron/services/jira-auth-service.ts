import { app, safeStorage } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type {
  JiraAuthCompletePayload,
  JiraBoardSelection,
  JiraProject,
  JiraStatus,
  JiraSyncFilter,
  JiraSyncResult,
  JiraTicketCount,
  StoredWorkspace,
} from '@nakiros/shared';
import {
  exchangeCodeForTokens,
  getAccessibleResources,
  getJiraUserInfo,
  refreshAccessToken,
} from './jira-oauth.js';
import { countIssues, fetchProjectBoardType, fetchProjects } from './jira-connector.js';
import { selectAccessibleResource, isSecureStorageBackendSupported } from './jira-auth-utils.js';
import { saveCanonicalWorkspace } from './workspace-remote.js';
import { getAll, save } from './workspace.js';
import { syncJiraTickets } from './jira-sync.js';

interface StoredJiraTokenEntry {
  accessToken: string;
  refreshToken: string;
  cloudId: string;
  cloudUrl: string;
  displayName: string;
  expiresAt: number;
}

type JiraTokenStore = Record<string, StoredJiraTokenEntry>;
type JiraBoardType = JiraBoardSelection['boardType'];

const TOKEN_STORE_PATH = join(app.getPath('userData'), 'jira-tokens.json');
const TOKEN_REFRESH_SAFETY_WINDOW_MS = 5 * 60 * 1000;

function getSecureStorageBackend(): string | undefined {
  if (!('getSelectedStorageBackend' in safeStorage)) return undefined;
  const getter = safeStorage.getSelectedStorageBackend;
  if (typeof getter !== 'function') return undefined;
  return getter.call(safeStorage);
}

function assertSecureStorageAvailable(): void {
  const encryptionAvailable = safeStorage.isEncryptionAvailable();
  const selectedBackend = getSecureStorageBackend();

  if (isSecureStorageBackendSupported({ encryptionAvailable, selectedBackend })) {
    return;
  }

  throw new Error('Secure storage is unavailable on this device. Jira requires OS-backed encryption.');
}

function readTokenStore(): JiraTokenStore {
  if (!existsSync(TOKEN_STORE_PATH)) return {};
  try {
    return JSON.parse(readFileSync(TOKEN_STORE_PATH, 'utf-8')) as JiraTokenStore;
  } catch {
    return {};
  }
}

function writeTokenStore(store: JiraTokenStore): void {
  writeFileSync(TOKEN_STORE_PATH, JSON.stringify(store, null, 2), 'utf-8');
}

function encryptSecret(value: string): string {
  assertSecureStorageAvailable();
  return safeStorage.encryptString(value).toString('base64');
}

function decryptSecret(value: string): string {
  assertSecureStorageAvailable();
  try {
    return safeStorage.decryptString(Buffer.from(value, 'base64'));
  } catch {
    throw new Error('Stored Jira credentials are no longer readable. Please reconnect Jira.');
  }
}

function findWorkspace(wsId: string): StoredWorkspace | undefined {
  return getAll().find((workspace) => workspace.id === wsId);
}

async function persistWorkspaceMetadata(workspace: StoredWorkspace): Promise<void> {
  try {
    await saveCanonicalWorkspace(workspace);
    return;
  } catch (error) {
    console.warn('[jira-auth] Falling back to local workspace cache:', error);
  }

  save(workspace);
}

function storeTokens(
  wsId: string,
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    cloudId: string;
    cloudUrl: string;
    displayName: string;
  },
): void {
  const store = readTokenStore();
  store[wsId] = {
    accessToken: encryptSecret(tokens.accessToken),
    refreshToken: encryptSecret(tokens.refreshToken),
    cloudId: tokens.cloudId,
    cloudUrl: tokens.cloudUrl,
    displayName: tokens.displayName,
    expiresAt: Date.now() + tokens.expiresIn * 1000,
  };
  writeTokenStore(store);
}

function getStoredTokenEntry(wsId: string): StoredJiraTokenEntry | null {
  return readTokenStore()[wsId] ?? null;
}

export function clearJiraTokens(wsId: string): void {
  const store = readTokenStore();
  delete store[wsId];
  writeTokenStore(store);
}

export function getJiraStatus(wsId: string): JiraStatus {
  const entry = getStoredTokenEntry(wsId);
  if (!entry) return { connected: false };
  return {
    connected: true,
    cloudId: entry.cloudId,
    cloudUrl: entry.cloudUrl,
    displayName: entry.displayName,
  };
}

function resolveCloudId(wsId: string, workspace?: StoredWorkspace): string {
  const resolvedWorkspace = workspace ?? findWorkspace(wsId);
  const cloudId = resolvedWorkspace?.jiraCloudId ?? getStoredTokenEntry(wsId)?.cloudId;
  if (!cloudId) {
    throw new Error('Jira is not connected for this workspace. Reconnect and try again.');
  }
  return cloudId;
}

export async function getValidJiraAccessToken(wsId: string): Promise<string> {
  const entry = getStoredTokenEntry(wsId);
  if (!entry) {
    throw new Error('Jira is not connected for this workspace. Reconnect and try again.');
  }

  if (Date.now() < entry.expiresAt - TOKEN_REFRESH_SAFETY_WINDOW_MS) {
    return decryptSecret(entry.accessToken);
  }

  const refreshed = await refreshAccessToken(decryptSecret(entry.refreshToken));
  const nextStore = readTokenStore();
  const currentEntry = nextStore[wsId];

  if (currentEntry) {
    currentEntry.accessToken = encryptSecret(refreshed.access_token);
    if (refreshed.refresh_token) {
      currentEntry.refreshToken = encryptSecret(refreshed.refresh_token);
    }
    currentEntry.expiresAt = Date.now() + refreshed.expires_in * 1000;
    writeTokenStore(nextStore);
  }

  return refreshed.access_token;
}

export async function completeJiraOAuth(
  wsId: string,
  code: string,
  codeVerifier: string,
  configuredJiraUrl?: string,
): Promise<JiraAuthCompletePayload> {
  const tokens = await exchangeCodeForTokens(code, codeVerifier);
  const resources = await getAccessibleResources(tokens.access_token);
  const workspace = findWorkspace(wsId);
  const resource = selectAccessibleResource(resources, workspace?.jiraUrl ?? configuredJiraUrl);

  if (!resource) {
    throw new Error('No accessible Jira sites were found for this account.');
  }

  const { displayName } = await getJiraUserInfo(tokens.access_token, resource.id);

  storeTokens(wsId, {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresIn: tokens.expires_in,
    cloudId: resource.id,
    cloudUrl: resource.url,
    displayName,
  });

  if (!workspace) {
    return { wsId, cloudUrl: resource.url, displayName };
  }

  const updatedWorkspace: StoredWorkspace = {
    ...workspace,
    jiraConnected: true,
    jiraCloudId: resource.id,
    jiraCloudUrl: resource.url,
    jiraUrl: workspace.jiraUrl ?? configuredJiraUrl ?? resource.url,
  };

  await persistWorkspaceMetadata(updatedWorkspace);

  return {
    wsId,
    cloudUrl: resource.url,
    displayName,
    workspace: updatedWorkspace,
  };
}

export async function disconnectJira(wsId: string): Promise<StoredWorkspace | null> {
  clearJiraTokens(wsId);

  const workspace = findWorkspace(wsId);
  if (!workspace) return null;

  const updatedWorkspace: StoredWorkspace = {
    ...workspace,
    jiraConnected: false,
    jiraCloudId: undefined,
    jiraCloudUrl: undefined,
  };

  await persistWorkspaceMetadata(updatedWorkspace);
  return updatedWorkspace;
}

export async function getJiraProjects(wsId: string): Promise<JiraProject[]> {
  const accessToken = await getValidJiraAccessToken(wsId);
  return fetchProjects(accessToken, resolveCloudId(wsId));
}

export async function countJiraTickets(
  wsId: string,
  projectKey: string,
  syncFilter: JiraSyncFilter,
  boardType: JiraBoardType,
): Promise<JiraTicketCount> {
  const accessToken = await getValidJiraAccessToken(wsId);
  return countIssues(accessToken, resolveCloudId(wsId), projectKey, syncFilter, boardType);
}

export async function getJiraBoardSelection(
  wsId: string,
  projectKey: string,
): Promise<JiraBoardSelection> {
  const accessToken = await getValidJiraAccessToken(wsId);
  return fetchProjectBoardType(accessToken, resolveCloudId(wsId), projectKey);
}

export async function syncWorkspaceJiraTickets(
  wsId: string,
  workspace: StoredWorkspace,
): Promise<JiraSyncResult> {
  const accessToken = await getValidJiraAccessToken(wsId);
  return syncJiraTickets({
    workspace,
    accessToken,
    cloudId: resolveCloudId(wsId, workspace),
  });
}
