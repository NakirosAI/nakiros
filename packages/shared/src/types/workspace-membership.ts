import type { OrgRole } from './auth.js';

export type WorkspaceRole = 'owner' | 'admin' | 'pm' | 'dev' | 'viewer';

export type WorkspaceMembershipScope = 'organization' | 'personal';

export type WorkspaceMembershipStatus = 'active' | 'not_added';

export interface WorkspaceMembershipListItem {
  userId: string;
  email: string | null;
  organizationRole: OrgRole;
  workspaceRole: WorkspaceRole | null;
  status: WorkspaceMembershipStatus;
  joinedAt?: string;
  addedAt?: string;
  updatedAt?: string;
  isCurrentUser: boolean;
}

export interface WorkspaceMembershipListPayload {
  workspaceId: string;
  scope: WorkspaceMembershipScope;
  currentUserRole: WorkspaceRole | null;
  canManage: boolean;
  members: WorkspaceMembershipListItem[];
}

export interface UpsertWorkspaceMembershipInput {
  userId: string;
  role: WorkspaceRole;
}

export interface WorkspaceMembershipSubject {
  workspaceId: string;
  scope: WorkspaceMembershipScope;
  role: WorkspaceRole | null;
  status: WorkspaceMembershipStatus | 'personal';
}
