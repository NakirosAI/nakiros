import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';

import type { CollabSession, StoredWorkspace } from './types.js';
import * as schema from './schema.js';

export interface OrgRow {
  id: string;
  name: string;
  slug: string;
  createdBy: string;
  createdAt: string;
  role: string; // caller's role in this org
}

export interface OrgMemberRow {
  userId: string;
  email: string | null;
  role: string;
  joinedAt: string;
}

export interface InvitationRow {
  id: string;
  orgId: string;
  email: string;
  role: string;
  invitedBy: string;
  invitedAt: string;
}

export interface IStorage {
  readWorkspaces(): Promise<StoredWorkspace[]>;
  readWorkspace(id: string): Promise<StoredWorkspace | null>;
  writeWorkspace(workspace: StoredWorkspace): Promise<void>;
  deleteWorkspace(id: string): Promise<void>;
  reassignWorkspacesOwnedByOrg(orgId: string, nextOwnerId: string): Promise<void>;
  readCollabs(workspaceId: string): Promise<CollabSession[]>;
  readCollab(id: string): Promise<CollabSession | null>;
  writeCollab(collab: CollabSession): Promise<void>;
  readOrgsForUser(userId: string): Promise<OrgRow[]>;
  readOrgBySlug(slug: string): Promise<{ id: string } | null>;
  createOrg(org: { id: string; name: string; slug: string; createdBy: string; createdAt: string }, creatorEmail?: string): Promise<void>;
  readOrgMembers(orgId: string): Promise<OrgMemberRow[]>;
  isOrgAdmin(orgId: string, userId: string): Promise<boolean>;
  addOrgMember(member: { orgId: string; userId: string; email: string; role: string; joinedAt: string }): Promise<void>;
  removeOrgMember(orgId: string, userId: string): Promise<void>;
  deleteOrgMembers(orgId: string): Promise<void>;
  createInvitation(inv: InvitationRow): Promise<void>;
  readInvitationsByOrg(orgId: string): Promise<InvitationRow[]>;
  readInvitationsByEmail(email: string): Promise<InvitationRow[]>;
  readInvitationByOrgAndEmail(orgId: string, email: string): Promise<InvitationRow | null>;
  deleteInvitation(id: string): Promise<void>;
  deleteInvitationsByOrg(orgId: string): Promise<void>;
  deleteOrg(orgId: string): Promise<void>;
}

export class D1Storage implements IStorage {
  private db: ReturnType<typeof drizzle>;

  constructor(d1: D1Database) {
    this.db = drizzle(d1, { schema });
  }

  async readWorkspaces(): Promise<StoredWorkspace[]> {
    const rows = await this.db.select().from(schema.workspaces).all();
    return rows.map((r) => {
      const workspace = JSON.parse(r.data) as StoredWorkspace;
      return {
        ...workspace,
        ownerId: r.ownerId ?? workspace.ownerId,
      };
    });
  }

  async readWorkspace(id: string): Promise<StoredWorkspace | null> {
    const rows = await this.db.select().from(schema.workspaces).where(eq(schema.workspaces.id, id)).all();
    if (!rows[0]) return null;
    const workspace = JSON.parse(rows[0].data) as StoredWorkspace;
    return {
      ...workspace,
      ownerId: rows[0].ownerId ?? workspace.ownerId,
    };
  }

  async writeWorkspace(workspace: StoredWorkspace): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .insert(schema.workspaces)
      .values({
        id: workspace.id,
        name: workspace.name,
        ownerId: workspace.ownerId ?? null,
        data: JSON.stringify(workspace),
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: schema.workspaces.id,
        set: {
          name: workspace.name,
          ownerId: workspace.ownerId ?? null,
          data: JSON.stringify(workspace),
          updatedAt: now,
        },
      });
  }

  async deleteWorkspace(id: string): Promise<void> {
    await this.db.delete(schema.workspaces).where(eq(schema.workspaces.id, id));
  }

  async reassignWorkspacesOwnedByOrg(orgId: string, nextOwnerId: string): Promise<void> {
    const workspaces = await this.readWorkspaces();
    const targets = workspaces.filter((workspace) => workspace.ownerId === orgId);
    await Promise.all(targets.map((workspace) => this.writeWorkspace({ ...workspace, ownerId: nextOwnerId })));
  }

  async readCollabs(workspaceId: string): Promise<CollabSession[]> {
    const rows = await this.db
      .select()
      .from(schema.collabSessions)
      .where(eq(schema.collabSessions.workspaceId, workspaceId))
      .all();
    return rows.map((r) => JSON.parse(r.data) as CollabSession);
  }

  async readCollab(id: string): Promise<CollabSession | null> {
    const rows = await this.db
      .select()
      .from(schema.collabSessions)
      .where(eq(schema.collabSessions.id, id))
      .all();
    return rows[0] ? (JSON.parse(rows[0].data) as CollabSession) : null;
  }

  async writeCollab(collab: CollabSession): Promise<void> {
    await this.db
      .insert(schema.collabSessions)
      .values({
        id: collab.id,
        workspaceId: collab.workspaceId,
        topic: collab.topic,
        status: collab.status,
        data: JSON.stringify(collab),
        createdAt: collab.createdAt,
        resolvedAt: collab.resolvedAt ?? null,
      })
      .onConflictDoUpdate({
        target: schema.collabSessions.id,
        set: {
          status: collab.status,
          data: JSON.stringify(collab),
          resolvedAt: collab.resolvedAt ?? null,
        },
      });
  }

  async readOrgsForUser(userId: string): Promise<OrgRow[]> {
    const rows = await this.db
      .select({
        id: schema.organizations.id,
        name: schema.organizations.name,
        slug: schema.organizations.slug,
        createdBy: schema.organizations.createdBy,
        createdAt: schema.organizations.createdAt,
        role: schema.orgMembers.role,
      })
      .from(schema.orgMembers)
      .innerJoin(schema.organizations, eq(schema.orgMembers.orgId, schema.organizations.id))
      .where(eq(schema.orgMembers.userId, userId))
      .all();
    return rows;
  }

  async readOrgBySlug(slug: string): Promise<{ id: string } | null> {
    const rows = await this.db
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .where(eq(schema.organizations.slug, slug))
      .all();
    return rows[0] ?? null;
  }

  async createOrg(
    org: { id: string; name: string; slug: string; createdBy: string; createdAt: string },
    creatorEmail?: string,
  ): Promise<void> {
    await this.db.insert(schema.organizations).values(org);
    await this.db.insert(schema.orgMembers).values({
      orgId: org.id,
      userId: org.createdBy,
      role: 'admin',
      joinedAt: org.createdAt,
      email: creatorEmail ?? null,
    });
  }

  async readOrgMembers(orgId: string): Promise<OrgMemberRow[]> {
    const rows = await this.db
      .select({
        userId: schema.orgMembers.userId,
        email: schema.orgMembers.email,
        role: schema.orgMembers.role,
        joinedAt: schema.orgMembers.joinedAt,
      })
      .from(schema.orgMembers)
      .where(eq(schema.orgMembers.orgId, orgId))
      .all();
    return rows;
  }

  async isOrgAdmin(orgId: string, userId: string): Promise<boolean> {
    const rows = await this.db
      .select({ role: schema.orgMembers.role })
      .from(schema.orgMembers)
      .where(and(eq(schema.orgMembers.orgId, orgId), eq(schema.orgMembers.userId, userId)))
      .all();
    return rows[0]?.role === 'admin';
  }

  async addOrgMember(member: { orgId: string; userId: string; email: string; role: string; joinedAt: string }): Promise<void> {
    await this.db.insert(schema.orgMembers).values(member);
  }

  async removeOrgMember(orgId: string, userId: string): Promise<void> {
    await this.db
      .delete(schema.orgMembers)
      .where(and(eq(schema.orgMembers.orgId, orgId), eq(schema.orgMembers.userId, userId)));
  }

  async deleteOrgMembers(orgId: string): Promise<void> {
    await this.db.delete(schema.orgMembers).where(eq(schema.orgMembers.orgId, orgId));
  }

  async createInvitation(inv: InvitationRow): Promise<void> {
    await this.db.insert(schema.invitations).values({
      id: inv.id,
      orgId: inv.orgId,
      email: inv.email,
      role: inv.role,
      invitedBy: inv.invitedBy,
      invitedAt: inv.invitedAt,
    });
  }

  async readInvitationsByOrg(orgId: string): Promise<InvitationRow[]> {
    const rows = await this.db
      .select()
      .from(schema.invitations)
      .where(eq(schema.invitations.orgId, orgId))
      .all();
    return rows.map((r) => ({
      id: r.id,
      orgId: r.orgId,
      email: r.email,
      role: r.role,
      invitedBy: r.invitedBy,
      invitedAt: r.invitedAt,
    }));
  }

  async readInvitationsByEmail(email: string): Promise<InvitationRow[]> {
    const rows = await this.db
      .select()
      .from(schema.invitations)
      .where(eq(schema.invitations.email, email.toLowerCase()))
      .all();
    return rows.map((r) => ({
      id: r.id,
      orgId: r.orgId,
      email: r.email,
      role: r.role,
      invitedBy: r.invitedBy,
      invitedAt: r.invitedAt,
    }));
  }

  async readInvitationByOrgAndEmail(orgId: string, email: string): Promise<InvitationRow | null> {
    const rows = await this.db
      .select()
      .from(schema.invitations)
      .where(and(eq(schema.invitations.orgId, orgId), eq(schema.invitations.email, email.toLowerCase())))
      .all();
    if (!rows[0]) return null;
    const r = rows[0];
    return { id: r.id, orgId: r.orgId, email: r.email, role: r.role, invitedBy: r.invitedBy, invitedAt: r.invitedAt };
  }

  async deleteInvitation(id: string): Promise<void> {
    await this.db.delete(schema.invitations).where(eq(schema.invitations.id, id));
  }

  async deleteInvitationsByOrg(orgId: string): Promise<void> {
    await this.db.delete(schema.invitations).where(eq(schema.invitations.orgId, orgId));
  }

  async deleteOrg(orgId: string): Promise<void> {
    await this.db.delete(schema.organizations).where(eq(schema.organizations.id, orgId));
  }
}
