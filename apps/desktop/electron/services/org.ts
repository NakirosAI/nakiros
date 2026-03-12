import { getStoredToken } from './auth.js';
import { createAddOrgMemberPayload } from './org-payload.js';
import type {
  OrgRole,
  OrganizationInfo,
  OrganizationInvitationAcceptanceResult,
  OrganizationInvitationResult,
  OrganizationMemberListItem,
} from '@nakiros/shared';

const WORKER_API = process.env['NAKIROS_API_URL'] ?? 'https://api.nakiros.com';

export type OrgInfo = OrganizationInfo;

export type OrgMember = OrganizationMemberListItem;

export interface CreateOrgResult {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
}

export type AddMemberResult = OrganizationInvitationResult;

function isOrgRole(value: unknown): value is OrgRole {
  return value === 'admin' || value === 'member';
}

function isOrgInfo(value: unknown): value is OrgInfo {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string'
    && typeof candidate.name === 'string'
    && typeof candidate.slug === 'string'
    && isOrgRole(candidate.role)
  );
}

function isOrgMember(value: unknown): value is OrgMember {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    (candidate.userId === undefined || typeof candidate.userId === 'string')
    && (candidate.invitationId === undefined || typeof candidate.invitationId === 'string')
    && (candidate.email === null || typeof candidate.email === 'string')
    && isOrgRole(candidate.role)
    && (candidate.joinedAt === undefined || typeof candidate.joinedAt === 'string')
    && (candidate.invitedAt === undefined || typeof candidate.invitedAt === 'string')
    && (candidate.status === 'active' || candidate.status === 'pending')
  );
}

function normalizeOrgList(payload: unknown): OrgInfo[] {
  if (Array.isArray(payload)) return payload.filter(isOrgInfo);
  if (payload && typeof payload === 'object') {
    const candidate = payload as Record<string, unknown>;
    if (Array.isArray(candidate.organizations)) return candidate.organizations.filter(isOrgInfo);
    if (Array.isArray(candidate.orgs)) return candidate.orgs.filter(isOrgInfo);
    if (isOrgInfo(candidate.organization)) return [candidate.organization];
    if (isOrgInfo(payload)) return [payload];
  }
  return [];
}

function normalizeOrgMembers(payload: unknown): OrgMember[] {
  if (Array.isArray(payload)) return payload.filter(isOrgMember);
  if (payload && typeof payload === 'object') {
    const candidate = payload as Record<string, unknown>;
    if (Array.isArray(candidate.members)) return candidate.members.filter(isOrgMember);
    if (Array.isArray(candidate.items)) return candidate.items.filter(isOrgMember);
  }
  return [];
}

/**
 * Returns all organizations the authenticated user belongs to.
 */
export async function listMyOrgs(): Promise<OrgInfo[]> {
  const token = getStoredToken();
  if (!token) return [];

  try {
    const res = await fetch(`${WORKER_API}/orgs/mine`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    return normalizeOrgList(await res.json().catch(() => []));
  } catch {
    return [];
  }
}

/**
 * Returns the first organization the authenticated user belongs to, or undefined (personal mode).
 */
export async function getMyOrg(): Promise<OrgInfo | undefined> {
  const orgs = await listMyOrgs();
  return orgs[0];
}

/**
 * Creates a new organization. Throws with a user-facing message on failure.
 */
export async function createOrg(name: string, slug: string): Promise<CreateOrgResult> {
  const token = getStoredToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${WORKER_API}/orgs`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, slug }),
  });

  const payload = (await res.json().catch(() => null)) as {
    error?: string;
    organizationId?: string;
    organizationName?: string;
    organizationSlug?: string;
  } | null;

  if (!res.ok || !payload?.organizationId) {
    throw new Error(payload?.error ?? 'Failed to create organization');
  }

  return {
    organizationId: payload.organizationId,
    organizationName: payload.organizationName ?? name,
    organizationSlug: payload.organizationSlug ?? slug,
  };
}

/**
 * Deletes an organization. Admin only.
 */
export async function deleteOrg(orgId: string): Promise<void> {
  const token = getStoredToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${WORKER_API}/orgs/${orgId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? 'Failed to delete organization');
  }
}

/**
 * Lists members of an organization. Admin only.
 */
export async function listOrgMembers(orgId: string): Promise<OrgMember[]> {
  const token = getStoredToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${WORKER_API}/orgs/${orgId}/members`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error(`Failed to list members: ${res.status}`);
  return normalizeOrgMembers(await res.json().catch(() => []));
}

/**
 * Adds a member to an organization by email. Admin only.
 * Throws with user-facing error codes on common failures.
 */
export async function addOrgMember(
  orgId: string,
  email: string,
  role: OrgRole,
  inviterEmail?: string,
): Promise<AddMemberResult> {
  const token = getStoredToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${WORKER_API}/orgs/${orgId}/members`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(createAddOrgMemberPayload(email, role, inviterEmail)),
  });

  const payload = (await res.json().catch(() => null)) as {
    error?: string;
    code?: string;
    id?: string;
    userId?: string;
    email?: string;
    role?: OrgRole;
    status?: 'pending' | 'active';
  } | null;

  if (!res.ok) {
    // Encode code in message because Electron IPC doesn't preserve custom Error properties
    const code = payload?.code ?? 'UNKNOWN';
    throw new Error(`${code}:${payload?.error ?? 'Failed to add member'}`);
  }

  return {
    id: payload!.id,
    userId: payload!.userId,
    email: payload!.email!,
    role: payload!.role ?? role,
    status: payload!.status ?? 'pending',
  };
}

/**
 * Removes a member from an organization. Admin only.
 */
export async function removeOrgMember(orgId: string, userId: string): Promise<void> {
  const token = getStoredToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${WORKER_API}/orgs/${orgId}/members/${userId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? 'Failed to remove member');
  }
}

/**
 * Leaves the current organization for the authenticated user.
 */
export async function leaveOrg(orgId: string): Promise<void> {
  const token = getStoredToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${WORKER_API}/orgs/${orgId}/members/me`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? 'Failed to leave organization');
  }
}

/**
 * Cancels a pending invitation. Admin only.
 */
export async function cancelInvitation(orgId: string, invitationId: string): Promise<void> {
  const token = getStoredToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${WORKER_API}/orgs/${orgId}/invitations/${invitationId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? 'Failed to cancel invitation');
  }
}

/**
 * Auto-accepts any pending invitations for the given email. Called after sign-in.
 */
export async function acceptInvitations(email: string): Promise<OrganizationInvitationAcceptanceResult> {
  const token = getStoredToken();
  if (!token) return { joined: 0 };

  try {
    const res = await fetch(`${WORKER_API}/invitations/accept`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) return { joined: 0 };
    return (await res.json()) as { joined: number };
  } catch {
    return { joined: 0 };
  }
}
