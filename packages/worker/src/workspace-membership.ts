import type { OrgMemberRow, WorkspaceMemberRow } from './storage.js';

export type WorkspaceRole = 'owner' | 'admin' | 'pm' | 'dev' | 'viewer';

export interface WorkspaceMembershipListItemData {
  userId: string;
  email: string | null;
  organizationRole: string;
  workspaceRole: WorkspaceRole | null;
  status: 'active' | 'not_added';
  joinedAt?: string;
  addedAt?: string;
  updatedAt?: string;
  isCurrentUser: boolean;
}

export const MANAGEABLE_WORKSPACE_ROLES = new Set<WorkspaceRole>(['owner', 'admin']);

const WORKSPACE_ROLE_ORDER: Record<WorkspaceRole, number> = {
  owner: 0,
  admin: 1,
  pm: 2,
  dev: 3,
  viewer: 4,
};

export function isWorkspaceRole(value: unknown): value is WorkspaceRole {
  return value === 'owner'
    || value === 'admin'
    || value === 'pm'
    || value === 'dev'
    || value === 'viewer';
}

export function isManageableWorkspaceRole(role: WorkspaceRole | null | undefined): boolean {
  return role !== null && role !== undefined && MANAGEABLE_WORKSPACE_ROLES.has(role);
}

export function hasManageableWorkspaceMember(members: Array<Pick<WorkspaceMemberRow, 'role'>>): boolean {
  return members.some((member) => isWorkspaceRole(member.role) && isManageableWorkspaceRole(member.role));
}

export function canManageWorkspaceMemberships(args: {
  currentUserRole: WorkspaceRole | null;
  isOrgAdmin: boolean;
  hasManageableMemberships: boolean;
}): boolean {
  if (isManageableWorkspaceRole(args.currentUserRole)) return true;
  return args.isOrgAdmin && !args.hasManageableMemberships;
}

export function buildWorkspaceMembershipList(
  orgMembers: OrgMemberRow[],
  workspaceMembers: WorkspaceMemberRow[],
  currentUserId: string,
): WorkspaceMembershipListItemData[] {
  const membershipsByUserId = new Map(
    workspaceMembers
      .filter((member) => isWorkspaceRole(member.role))
      .map((member) => [member.userId, member] as const),
  );

  return [...orgMembers]
    .map((orgMember) => {
      const membership = membershipsByUserId.get(orgMember.userId);
      const workspaceRole = membership?.role;
      const activeWorkspaceRole = workspaceRole && isWorkspaceRole(workspaceRole) ? workspaceRole : null;

      return {
        userId: orgMember.userId,
        email: orgMember.email,
        organizationRole: orgMember.role,
        workspaceRole: activeWorkspaceRole,
        status: activeWorkspaceRole ? 'active' : 'not_added',
        joinedAt: orgMember.joinedAt,
        addedAt: membership?.createdAt,
        updatedAt: membership?.updatedAt,
        isCurrentUser: orgMember.userId === currentUserId,
      } satisfies WorkspaceMembershipListItemData;
    })
    .sort((left, right) => {
      if (left.isCurrentUser !== right.isCurrentUser) return left.isCurrentUser ? -1 : 1;
      if (left.status !== right.status) return left.status === 'active' ? -1 : 1;
      const leftRoleOrder = left.workspaceRole ? WORKSPACE_ROLE_ORDER[left.workspaceRole] : Number.MAX_SAFE_INTEGER;
      const rightRoleOrder = right.workspaceRole ? WORKSPACE_ROLE_ORDER[right.workspaceRole] : Number.MAX_SAFE_INTEGER;
      if (leftRoleOrder !== rightRoleOrder) return leftRoleOrder - rightRoleOrder;
      const leftLabel = (left.email ?? left.userId).toLowerCase();
      const rightLabel = (right.email ?? right.userId).toLowerCase();
      return leftLabel.localeCompare(rightLabel);
    });
}
