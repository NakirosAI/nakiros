import { ensureValidAccessToken } from './auth.js';
import type {
  BindWorkspaceProviderCredentialInput,
  CreateProviderCredentialInput,
  ProviderCredentialDeleteImpact,
  ProviderCredentialSummary,
  SetWorkspaceProviderDefaultInput,
  UpdateProviderCredentialInput,
  WorkspaceProviderCredentialsPayload,
} from '@nakiros/shared';

const WORKER_API = process.env['NAKIROS_API_URL'] ?? 'https://api.nakiros.com';

interface WorkerErrorPayload {
  error?: string;
  impactedWorkspaces?: Array<{ workspaceId: string; workspaceName: string; isDefault: boolean }>;
}

async function parseJson<T>(response: Response): Promise<T | null> {
  return response.json().catch(() => null) as Promise<T | null>;
}

async function getAuthToken(): Promise<string> {
  const resolved = await ensureValidAccessToken();
  if (!resolved.token) {
    throw new Error(resolved.sessionExpired ? 'Session expired. Sign in again.' : 'Not authenticated');
  }
  return resolved.token;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAuthToken();
  const response = await fetch(`${WORKER_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const payload = await parseJson<WorkerErrorPayload>(response);
    if (response.status === 409 && payload?.impactedWorkspaces) {
      const error = new Error(payload.error ?? 'Credential is still in use');
      Object.assign(error, { impactedWorkspaces: payload.impactedWorkspaces });
      throw error;
    }
    throw new Error(payload?.error ?? 'Provider credentials request failed');
  }

  return response.json() as Promise<T>;
}

export function listProviderCredentials(): Promise<ProviderCredentialSummary[]> {
  return request<ProviderCredentialSummary[]>('/provider-credentials');
}

export function createProviderCredential(input: CreateProviderCredentialInput): Promise<ProviderCredentialSummary> {
  return request<ProviderCredentialSummary>('/provider-credentials', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateProviderCredential(
  credentialId: string,
  input: UpdateProviderCredentialInput,
): Promise<ProviderCredentialSummary> {
  return request<ProviderCredentialSummary>(`/provider-credentials/${credentialId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export function revokeProviderCredential(credentialId: string): Promise<ProviderCredentialSummary> {
  return request<ProviderCredentialSummary>(`/provider-credentials/${credentialId}/revoke`, {
    method: 'POST',
  });
}

export async function deleteProviderCredential(
  credentialId: string,
  force = false,
): Promise<ProviderCredentialDeleteImpact> {
  return request<ProviderCredentialDeleteImpact>(`/provider-credentials/${credentialId}${force ? '?force=true' : ''}`, {
    method: 'DELETE',
  });
}

export function getWorkspaceProviderCredentials(workspaceId: string): Promise<WorkspaceProviderCredentialsPayload> {
  return request<WorkspaceProviderCredentialsPayload>(`/ws/${workspaceId}/provider-credentials`);
}

export function bindWorkspaceProviderCredential(
  workspaceId: string,
  input: BindWorkspaceProviderCredentialInput,
): Promise<WorkspaceProviderCredentialsPayload> {
  return request<WorkspaceProviderCredentialsPayload>(`/ws/${workspaceId}/provider-credentials/bind`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function unbindWorkspaceProviderCredential(
  workspaceId: string,
  credentialId: string,
): Promise<WorkspaceProviderCredentialsPayload> {
  return request<WorkspaceProviderCredentialsPayload>(`/ws/${workspaceId}/provider-credentials/${credentialId}`, {
    method: 'DELETE',
  });
}

export function setWorkspaceProviderDefault(
  workspaceId: string,
  input: SetWorkspaceProviderDefaultInput,
): Promise<WorkspaceProviderCredentialsPayload> {
  return request<WorkspaceProviderCredentialsPayload>(`/ws/${workspaceId}/provider-credentials/default`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}
