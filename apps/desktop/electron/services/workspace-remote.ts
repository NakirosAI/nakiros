import type { StoredWorkspace } from '@nakiros/shared';
import { ensureValidAccessToken } from './auth.js';
import { getAll as getLocalWorkspaces, replaceAll as replaceLocalWorkspaceCache } from './workspace.js';
import { writeAgentWorkspaceYaml } from './workspace-yaml.js';

const WORKER_API = process.env['NAKIROS_API_URL'] ?? 'https://api.nakiros.com';

interface WorkerErrorPayload {
  error?: string;
  code?: string;
}

function isStoredRepo(value: unknown): value is StoredWorkspace['repos'][number] {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.name === 'string'
    && typeof candidate.localPath === 'string'
    && typeof candidate.role === 'string'
    && typeof candidate.profile === 'string'
  );
}

function isStoredWorkspace(value: unknown): value is StoredWorkspace {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string'
    && typeof candidate.name === 'string'
    && Array.isArray(candidate.repos)
    && candidate.repos.every(isStoredRepo)
  );
}

function normalizeWorkspaceList(payload: unknown): StoredWorkspace[] {
  if (Array.isArray(payload)) return payload.filter(isStoredWorkspace);
  if (payload && typeof payload === 'object') {
    const candidate = payload as Record<string, unknown>;
    if (Array.isArray(candidate.workspaces)) return candidate.workspaces.filter(isStoredWorkspace);
  }
  return [];
}

async function parseWorkerError(response: Response, fallbackMessage: string): Promise<Error> {
  const payload = (await response.json().catch(() => null)) as WorkerErrorPayload | null;
  return new Error(payload?.error ?? fallbackMessage);
}

async function listRemoteWorkspacesWithToken(token: string): Promise<StoredWorkspace[]> {
  const response = await fetch(`${WORKER_API}/ws`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw await parseWorkerError(response, 'Failed to load workspaces from Nakiros Cloud.');
  }

  return normalizeWorkspaceList(await response.json().catch(() => []));
}

export async function getHydratedWorkspaces(): Promise<StoredWorkspace[]> {
  const resolved = await ensureValidAccessToken();
  if (!resolved.token) return getLocalWorkspaces();

  try {
    const remoteWorkspaces = await listRemoteWorkspacesWithToken(resolved.token);
    replaceLocalWorkspaceCache(remoteWorkspaces);
    for (const workspace of remoteWorkspaces) {
      try { writeAgentWorkspaceYaml(workspace); } catch { /* non-blocking */ }
    }
    return remoteWorkspaces;
  } catch (error) {
    console.warn('[workspace-remote] Falling back to local cache:', error);
    return getLocalWorkspaces();
  }
}

export async function saveCanonicalWorkspace(workspace: StoredWorkspace): Promise<void> {
  const resolved = await ensureValidAccessToken();
  if (!resolved.token) {
    throw new Error(
      resolved.sessionExpired
        ? 'Session expired. Sign in again to save workspace changes to Nakiros Cloud.'
        : 'Sign in to save workspace changes to Nakiros Cloud.',
    );
  }

  const response = await fetch(`${WORKER_API}/ws/${workspace.id}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${resolved.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(workspace),
  });

  if (!response.ok) {
    throw await parseWorkerError(response, 'Failed to save workspace to Nakiros Cloud.');
  }

  const remoteWorkspaces = await listRemoteWorkspacesWithToken(resolved.token);
  replaceLocalWorkspaceCache(remoteWorkspaces);
  for (const workspace of remoteWorkspaces) {
    try { writeAgentWorkspaceYaml(workspace); } catch { /* non-blocking */ }
  }
}
