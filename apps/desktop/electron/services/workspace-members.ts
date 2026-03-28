import type {
  UpsertWorkspaceMembershipInput,
  WorkspaceMembershipListItem,
  WorkspaceMembershipListPayload,
  WorkspaceMembershipScope,
  WorkspaceMembershipStatus,
  WorkspaceMembershipSubject,
  WorkspaceRole,
} from '@nakiros/shared';
import { ensureValidAccessToken } from './auth.js';
import { evaluateWorkspaceLaunchAccess, toWorkspaceLaunchDeniedCode } from './workspace-launch-policy.js';

const WORKER_API = process.env['NAKIROS_API_URL'] ?? 'https://api.nakiros.com';

interface WorkerErrorPayload {
  error?: string;
}

function isWorkspaceRole(value: unknown): value is WorkspaceRole {
  return value === 'owner'
    || value === 'admin'
    || value === 'pm'
    || value === 'dev'
    || value === 'viewer';
}

function isWorkspaceMembershipScope(value: unknown): value is WorkspaceMembershipScope {
  return value === 'organization' || value === 'personal';
}

function isWorkspaceMembershipStatus(value: unknown): value is WorkspaceMembershipStatus {
  return value === 'active' || value === 'not_added';
}

function isWorkspaceMembershipListItem(value: unknown): value is WorkspaceMembershipListItem {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.userId === 'string'
    && (candidate.email === null || typeof candidate.email === 'string')
    && (candidate.organizationRole === 'admin' || candidate.organizationRole === 'member')
    && (candidate.workspaceRole === null || isWorkspaceRole(candidate.workspaceRole))
    && isWorkspaceMembershipStatus(candidate.status)
    && (candidate.joinedAt === undefined || typeof candidate.joinedAt === 'string')
    && (candidate.addedAt === undefined || typeof candidate.addedAt === 'string')
    && (candidate.updatedAt === undefined || typeof candidate.updatedAt === 'string')
    && typeof candidate.isCurrentUser === 'boolean'
  );
}

function isWorkspaceMembershipListPayload(value: unknown): value is WorkspaceMembershipListPayload {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.workspaceId === 'string'
    && isWorkspaceMembershipScope(candidate.scope)
    && (candidate.currentUserRole === null || isWorkspaceRole(candidate.currentUserRole))
    && typeof candidate.canManage === 'boolean'
    && Array.isArray(candidate.members)
    && candidate.members.every(isWorkspaceMembershipListItem)
  );
}

function isWorkspaceMembershipSubject(value: unknown): value is WorkspaceMembershipSubject {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.workspaceId === 'string'
    && isWorkspaceMembershipScope(candidate.scope)
    && (candidate.role === null || isWorkspaceRole(candidate.role))
    && (candidate.status === 'personal' || isWorkspaceMembershipStatus(candidate.status))
  );
}

async function parseWorkerError(response: Response, fallbackMessage: string): Promise<Error> {
  const payload = (await response.json().catch(() => null)) as WorkerErrorPayload | null;
  return new Error(payload?.error ?? fallbackMessage);
}

async function requireAccessToken(): Promise<string> {
  const resolved = await ensureValidAccessToken();
  if (!resolved.token) {
    throw new Error(
      resolved.sessionExpired
        ? 'Session expired. Sign in again.'
        : 'Not authenticated',
    );
  }
  return resolved.token;
}

export async function listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMembershipListPayload> {
  const token = await requireAccessToken();
  const response = await fetch(`${WORKER_API}/ws/${workspaceId}/members`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw await parseWorkerError(response, 'Failed to load workspace members.');
  }

  const payload = await response.json().catch(() => null);
  if (!isWorkspaceMembershipListPayload(payload)) {
    throw new Error('Invalid workspace members payload.');
  }
  return payload;
}

export async function upsertWorkspaceMember(
  workspaceId: string,
  input: UpsertWorkspaceMembershipInput,
): Promise<WorkspaceMembershipListPayload> {
  const token = await requireAccessToken();
  const response = await fetch(`${WORKER_API}/ws/${workspaceId}/members/${input.userId}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ role: input.role }),
  });

  if (!response.ok) {
    throw await parseWorkerError(response, 'Failed to update workspace member.');
  }

  const payload = await response.json().catch(() => null);
  if (!isWorkspaceMembershipListPayload(payload)) {
    throw new Error('Invalid workspace members payload.');
  }
  return payload;
}

export async function removeWorkspaceMember(workspaceId: string, userId: string): Promise<void> {
  const token = await requireAccessToken();
  const response = await fetch(`${WORKER_API}/ws/${workspaceId}/members/${userId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw await parseWorkerError(response, 'Failed to remove workspace member.');
  }
}

export async function getCurrentWorkspaceMembership(workspaceId: string): Promise<WorkspaceMembershipSubject> {
  const token = await requireAccessToken();
  const response = await fetch(`${WORKER_API}/ws/${workspaceId}/members/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw await parseWorkerError(response, 'Failed to resolve workspace membership.');
  }

  const payload = await response.json().catch(() => null);
  if (!isWorkspaceMembershipSubject(payload)) {
    throw new Error('Invalid workspace membership payload.');
  }
  return payload;
}

export async function assertWorkspaceLaunchAllowed(args: {
  workspaceId: string;
  enforceRoles: boolean;
}): Promise<void> {
  const subject = await getCurrentWorkspaceMembership(args.workspaceId);
  const decision = evaluateWorkspaceLaunchAccess({
    subject,
    enforceRoles: args.enforceRoles,
  });

  if (!decision.allowed) {
    if (decision.reason === 'not-added' || decision.reason === 'viewer') {
      throw new Error(toWorkspaceLaunchDeniedCode(decision.reason));
    }
    throw new Error('Workspace launch is not allowed.');
  }
}
