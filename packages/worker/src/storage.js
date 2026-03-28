import { and, eq, isNull, isNotNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema.js';
function toArtifactVersionRow(r) {
    return {
        id: r.id,
        workspaceId: r.workspaceId,
        artifactPath: r.artifactPath,
        artifactType: r.artifactType,
        epicId: r.epicId ?? null,
        content: r.content ?? null,
        r2Key: r.r2Key ?? null,
        author: r.author ?? null,
        version: r.version,
        createdAt: r.createdAt,
    };
}
export class D1Storage {
    db;
    constructor(d1) {
        this.db = drizzle(d1, { schema });
    }
    async readWorkspaces() {
        const rows = await this.db.select().from(schema.workspaces).all();
        return rows.map((r) => {
            const workspace = JSON.parse(r.data);
            return {
                ...workspace,
                ownerId: r.ownerId ?? workspace.ownerId,
            };
        });
    }
    async readWorkspace(id) {
        const rows = await this.db.select().from(schema.workspaces).where(eq(schema.workspaces.id, id)).all();
        if (!rows[0])
            return null;
        const workspace = JSON.parse(rows[0].data);
        return {
            ...workspace,
            ownerId: rows[0].ownerId ?? workspace.ownerId,
        };
    }
    async writeWorkspace(workspace) {
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
    async deleteWorkspace(id) {
        await this.db.delete(schema.workspaces).where(eq(schema.workspaces.id, id));
    }
    async reassignWorkspacesOwnedByOrg(orgId, nextOwnerId) {
        const workspaces = await this.readWorkspaces();
        const targets = workspaces.filter((workspace) => workspace.ownerId === orgId);
        await Promise.all(targets.map((workspace) => this.writeWorkspace({ ...workspace, ownerId: nextOwnerId })));
    }
    async readCollabs(workspaceId) {
        const rows = await this.db
            .select()
            .from(schema.collabSessions)
            .where(eq(schema.collabSessions.workspaceId, workspaceId))
            .all();
        return rows.map((r) => JSON.parse(r.data));
    }
    async readCollab(id) {
        const rows = await this.db
            .select()
            .from(schema.collabSessions)
            .where(eq(schema.collabSessions.id, id))
            .all();
        return rows[0] ? JSON.parse(rows[0].data) : null;
    }
    async writeCollab(collab) {
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
    async readOrgsForUser(userId) {
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
    async readOrgBySlug(slug) {
        const rows = await this.db
            .select({ id: schema.organizations.id })
            .from(schema.organizations)
            .where(eq(schema.organizations.slug, slug))
            .all();
        return rows[0] ?? null;
    }
    async createOrg(org, creatorEmail) {
        await this.db.insert(schema.organizations).values(org);
        await this.db.insert(schema.orgMembers).values({
            orgId: org.id,
            userId: org.createdBy,
            role: 'admin',
            joinedAt: org.createdAt,
            email: creatorEmail ?? null,
        });
    }
    async readOrgMembers(orgId) {
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
    async readOrgMember(orgId, userId) {
        const rows = await this.db
            .select({
            userId: schema.orgMembers.userId,
            email: schema.orgMembers.email,
            role: schema.orgMembers.role,
            joinedAt: schema.orgMembers.joinedAt,
        })
            .from(schema.orgMembers)
            .where(and(eq(schema.orgMembers.orgId, orgId), eq(schema.orgMembers.userId, userId)))
            .all();
        return rows[0] ?? null;
    }
    async isOrgAdmin(orgId, userId) {
        const rows = await this.db
            .select({ role: schema.orgMembers.role })
            .from(schema.orgMembers)
            .where(and(eq(schema.orgMembers.orgId, orgId), eq(schema.orgMembers.userId, userId)))
            .all();
        return rows[0]?.role === 'admin';
    }
    async isOrgMember(orgId, userId) {
        const row = await this.readOrgMember(orgId, userId);
        return row !== null;
    }
    async addOrgMember(member) {
        await this.db.insert(schema.orgMembers).values(member);
    }
    async removeOrgMember(orgId, userId) {
        await this.db
            .delete(schema.orgMembers)
            .where(and(eq(schema.orgMembers.orgId, orgId), eq(schema.orgMembers.userId, userId)));
    }
    async deleteOrgMembers(orgId) {
        await this.db.delete(schema.orgMembers).where(eq(schema.orgMembers.orgId, orgId));
    }
    async createInvitation(inv) {
        await this.db.insert(schema.invitations).values({
            id: inv.id,
            orgId: inv.orgId,
            email: inv.email,
            role: inv.role,
            invitedBy: inv.invitedBy,
            invitedAt: inv.invitedAt,
        });
    }
    async readInvitationsByOrg(orgId) {
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
    async readInvitationsByEmail(email) {
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
    async readInvitationByOrgAndEmail(orgId, email) {
        const rows = await this.db
            .select()
            .from(schema.invitations)
            .where(and(eq(schema.invitations.orgId, orgId), eq(schema.invitations.email, email.toLowerCase())))
            .all();
        if (!rows[0])
            return null;
        const r = rows[0];
        return { id: r.id, orgId: r.orgId, email: r.email, role: r.role, invitedBy: r.invitedBy, invitedAt: r.invitedAt };
    }
    async deleteInvitation(id) {
        await this.db.delete(schema.invitations).where(eq(schema.invitations.id, id));
    }
    async deleteInvitationsByOrg(orgId) {
        await this.db.delete(schema.invitations).where(eq(schema.invitations.orgId, orgId));
    }
    async deleteOrg(orgId) {
        await this.db.delete(schema.organizations).where(eq(schema.organizations.id, orgId));
    }
    async readWorkspaceMembers(workspaceId) {
        const rows = await this.db
            .select()
            .from(schema.workspaceMembers)
            .where(eq(schema.workspaceMembers.workspaceId, workspaceId))
            .all();
        return rows;
    }
    async readWorkspaceMember(workspaceId, userId) {
        const rows = await this.db
            .select()
            .from(schema.workspaceMembers)
            .where(and(eq(schema.workspaceMembers.workspaceId, workspaceId), eq(schema.workspaceMembers.userId, userId)))
            .all();
        return rows[0] ?? null;
    }
    async upsertWorkspaceMember(row) {
        await this.db
            .insert(schema.workspaceMembers)
            .values(row)
            .onConflictDoUpdate({
            target: [schema.workspaceMembers.workspaceId, schema.workspaceMembers.userId],
            set: {
                role: row.role,
                updatedAt: row.updatedAt,
            },
        });
    }
    async deleteWorkspaceMember(workspaceId, userId) {
        await this.db
            .delete(schema.workspaceMembers)
            .where(and(eq(schema.workspaceMembers.workspaceId, workspaceId), eq(schema.workspaceMembers.userId, userId)));
    }
    async ensureWorkspaceMember(row) {
        const existing = await this.readWorkspaceMember(row.workspaceId, row.userId);
        if (existing)
            return existing;
        await this.db.insert(schema.workspaceMembers).values(row);
        return row;
    }
    async readProviderCredentials(ownerId) {
        const rows = await this.db
            .select()
            .from(schema.providerCredentials)
            .where(eq(schema.providerCredentials.ownerId, ownerId))
            .all();
        return rows;
    }
    async readProviderCredential(id) {
        const rows = await this.db
            .select()
            .from(schema.providerCredentials)
            .where(eq(schema.providerCredentials.id, id))
            .all();
        return rows[0] ?? null;
    }
    async writeProviderCredential(row) {
        await this.db
            .insert(schema.providerCredentials)
            .values({
            id: row.id,
            ownerId: row.ownerId,
            provider: row.provider,
            label: row.label,
            metadata: row.metadata,
            secretCiphertext: row.secretCiphertext,
            iv: row.iv,
            authTag: row.authTag,
            keyVersion: row.keyVersion,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            revokedAt: row.revokedAt,
        })
            .onConflictDoUpdate({
            target: schema.providerCredentials.id,
            set: {
                label: row.label,
                metadata: row.metadata,
                secretCiphertext: row.secretCiphertext,
                iv: row.iv,
                authTag: row.authTag,
                keyVersion: row.keyVersion,
                updatedAt: row.updatedAt,
                revokedAt: row.revokedAt,
            },
        });
    }
    async deleteProviderCredential(id) {
        await this.db.delete(schema.providerCredentials).where(eq(schema.providerCredentials.id, id));
    }
    async readWorkspaceProviderBindings(workspaceId) {
        const rows = await this.db
            .select()
            .from(schema.workspaceProviderBindings)
            .where(eq(schema.workspaceProviderBindings.workspaceId, workspaceId))
            .all();
        return rows.map((row) => ({
            id: row.id,
            workspaceId: row.workspaceId,
            credentialId: row.credentialId,
            provider: row.provider,
            isDefault: row.isDefault === '1',
            createdAt: row.createdAt,
        }));
    }
    async readCredentialBindings(credentialId) {
        const rows = await this.db
            .select()
            .from(schema.workspaceProviderBindings)
            .where(eq(schema.workspaceProviderBindings.credentialId, credentialId))
            .all();
        return rows.map((row) => ({
            id: row.id,
            workspaceId: row.workspaceId,
            credentialId: row.credentialId,
            provider: row.provider,
            isDefault: row.isDefault === '1',
            createdAt: row.createdAt,
        }));
    }
    async writeWorkspaceProviderBinding(row) {
        await this.db
            .insert(schema.workspaceProviderBindings)
            .values({
            id: row.id,
            workspaceId: row.workspaceId,
            credentialId: row.credentialId,
            provider: row.provider,
            isDefault: row.isDefault ? '1' : '0',
            createdAt: row.createdAt,
        })
            .onConflictDoUpdate({
            target: [schema.workspaceProviderBindings.workspaceId, schema.workspaceProviderBindings.credentialId],
            set: {
                provider: row.provider,
                isDefault: row.isDefault ? '1' : '0',
            },
        });
    }
    async clearWorkspaceProviderDefaults(workspaceId, provider) {
        const bindings = await this.readWorkspaceProviderBindings(workspaceId);
        const updates = bindings
            .filter((binding) => binding.provider === provider && binding.isDefault)
            .map((binding) => this.writeWorkspaceProviderBinding({ ...binding, isDefault: false }));
        await Promise.all(updates);
    }
    async deleteWorkspaceProviderBinding(workspaceId, credentialId) {
        await this.db
            .delete(schema.workspaceProviderBindings)
            .where(and(eq(schema.workspaceProviderBindings.workspaceId, workspaceId), eq(schema.workspaceProviderBindings.credentialId, credentialId)));
    }
    // ─── PM Data Layer — Sprints ──────────────────────────────────────────────
    mapSprintRow(r) {
        return { ...r, createdAt: r.createdAt.getTime(), updatedAt: r.updatedAt.getTime() };
    }
    async listSprints(workspaceId) {
        const rows = await this.db.select().from(schema.sprints).where(eq(schema.sprints.workspaceId, workspaceId)).all();
        return rows.map((r) => this.mapSprintRow(r));
    }
    async readSprint(id) {
        const rows = await this.db.select().from(schema.sprints).where(eq(schema.sprints.id, id)).all();
        return rows[0] ? this.mapSprintRow(rows[0]) : null;
    }
    async createSprint(workspaceId, body) {
        const now = new Date();
        const id = crypto.randomUUID();
        await this.db.insert(schema.sprints).values({
            id,
            workspaceId,
            name: body.name,
            goal: body.goal ?? null,
            startDate: body.startDate ?? null,
            endDate: body.endDate ?? null,
            status: 'planning',
            createdAt: now,
            updatedAt: now,
        });
        return this.readSprint(id);
    }
    async updateSprint(id, data) {
        const set = { updatedAt: new Date() };
        if (data.name !== undefined)
            set.name = data.name;
        if (data.goal !== undefined)
            set.goal = data.goal;
        if (data.startDate !== undefined)
            set.startDate = data.startDate;
        if (data.endDate !== undefined)
            set.endDate = data.endDate;
        if (data.status !== undefined)
            set.status = data.status;
        await this.db.update(schema.sprints).set(set).where(eq(schema.sprints.id, id));
        return this.readSprint(id);
    }
    // ─── PM Data Layer — Epics ────────────────────────────────────────────────
    mapEpicRow(r) {
        return { ...r, createdAt: r.createdAt.getTime(), updatedAt: r.updatedAt.getTime() };
    }
    async listEpics(workspaceId) {
        const rows = await this.db.select().from(schema.epics).where(eq(schema.epics.workspaceId, workspaceId)).all();
        return rows.map((r) => this.mapEpicRow(r));
    }
    async readEpic(id) {
        const rows = await this.db.select().from(schema.epics).where(eq(schema.epics.id, id)).all();
        return rows[0] ? this.mapEpicRow(rows[0]) : null;
    }
    async createEpic(workspaceId, body) {
        const now = new Date();
        const id = crypto.randomUUID();
        await this.db.insert(schema.epics).values({
            id,
            workspaceId,
            name: body.name,
            description: body.description ?? null,
            color: body.color ?? null,
            status: 'backlog',
            rank: body.rank ?? 0,
            externalId: null,
            externalSource: null,
            createdAt: now,
            updatedAt: now,
        });
        return this.readEpic(id);
    }
    async updateEpic(id, data) {
        const set = { updatedAt: new Date() };
        if (data.name !== undefined)
            set.name = data.name;
        if (data.description !== undefined)
            set.description = data.description;
        if (data.color !== undefined)
            set.color = data.color;
        if (data.status !== undefined)
            set.status = data.status;
        if (data.rank !== undefined)
            set.rank = data.rank;
        await this.db.update(schema.epics).set(set).where(eq(schema.epics.id, id));
        return this.readEpic(id);
    }
    // ─── PM Data Layer — Stories ──────────────────────────────────────────────
    mapStoryRow(r) {
        return {
            ...r,
            acceptanceCriteria: r.acceptanceCriteria,
            createdAt: r.createdAt.getTime(),
            updatedAt: r.updatedAt.getTime(),
        };
    }
    async listStories(workspaceId, filters) {
        const conditions = [eq(schema.stories.workspaceId, workspaceId)];
        if (filters.epicId)
            conditions.push(eq(schema.stories.epicId, filters.epicId));
        if (filters.sprintId)
            conditions.push(eq(schema.stories.sprintId, filters.sprintId));
        if (filters.backlog)
            conditions.push(isNull(schema.stories.sprintId));
        const rows = await this.db.select().from(schema.stories).where(and(...conditions)).all();
        return rows.map((r) => this.mapStoryRow(r));
    }
    async readStory(id) {
        const rows = await this.db.select().from(schema.stories).where(eq(schema.stories.id, id)).all();
        return rows[0] ? this.mapStoryRow(rows[0]) : null;
    }
    async createStory(workspaceId, body) {
        const now = new Date();
        const id = crypto.randomUUID();
        await this.db.insert(schema.stories).values({
            id,
            workspaceId,
            epicId: body.epicId ?? null,
            sprintId: body.sprintId ?? null,
            title: body.title,
            description: body.description ?? null,
            acceptanceCriteria: body.acceptanceCriteria ?? null,
            status: body.status ?? 'backlog',
            priority: body.priority ?? 'medium',
            assignee: body.assignee ?? null,
            storyPoints: body.storyPoints ?? null,
            rank: body.rank ?? 0,
            externalId: null,
            externalSource: null,
            lastSyncedAt: null,
            createdAt: now,
            updatedAt: now,
        });
        return this.readStory(id);
    }
    async updateStory(id, data) {
        const set = { updatedAt: new Date() };
        if (data.title !== undefined)
            set.title = data.title;
        if (data.epicId !== undefined)
            set.epicId = data.epicId;
        if (data.sprintId !== undefined)
            set.sprintId = data.sprintId;
        if (data.description !== undefined)
            set.description = data.description;
        if (data.acceptanceCriteria !== undefined)
            set.acceptanceCriteria = data.acceptanceCriteria;
        if (data.status !== undefined)
            set.status = data.status;
        if (data.priority !== undefined)
            set.priority = data.priority;
        if (data.assignee !== undefined)
            set.assignee = data.assignee;
        if (data.storyPoints !== undefined)
            set.storyPoints = data.storyPoints;
        if (data.rank !== undefined)
            set.rank = data.rank;
        await this.db.update(schema.stories).set(set).where(eq(schema.stories.id, id));
        return this.readStory(id);
    }
    // ─── PM Data Layer — Tasks ────────────────────────────────────────────────
    mapTaskRow(r) {
        return { ...r, createdAt: r.createdAt.getTime(), updatedAt: r.updatedAt.getTime() };
    }
    async listTasks(storyId) {
        const rows = await this.db.select().from(schema.tasks).where(eq(schema.tasks.storyId, storyId)).all();
        return rows.map((r) => this.mapTaskRow(r));
    }
    async readTask(id) {
        const rows = await this.db.select().from(schema.tasks).where(eq(schema.tasks.id, id)).all();
        return rows[0] ? this.mapTaskRow(rows[0]) : null;
    }
    async createTask(storyId, body) {
        const now = new Date();
        const id = crypto.randomUUID();
        await this.db.insert(schema.tasks).values({
            id,
            storyId,
            title: body.title,
            description: body.description ?? null,
            type: body.type ?? 'other',
            status: 'todo',
            assignee: body.assignee ?? null,
            rank: body.rank ?? 0,
            createdAt: now,
            updatedAt: now,
        });
        return this.readTask(id);
    }
    async updateTask(id, data) {
        const set = { updatedAt: new Date() };
        if (data.title !== undefined)
            set.title = data.title;
        if (data.description !== undefined)
            set.description = data.description;
        if (data.type !== undefined)
            set.type = data.type;
        if (data.status !== undefined)
            set.status = data.status;
        if (data.assignee !== undefined)
            set.assignee = data.assignee;
        if (data.rank !== undefined)
            set.rank = data.rank;
        await this.db.update(schema.tasks).set(set).where(eq(schema.tasks.id, id));
        return this.readTask(id);
    }
    // ─── PM Data Layer — Task Dependencies ───────────────────────────────────
    async addTaskDependency(taskId, dependsOnTaskId) {
        if (taskId === dependsOnTaskId) {
            throw new Error('A task cannot depend on itself');
        }
        const row = { id: crypto.randomUUID(), taskId, dependsOnTaskId };
        await this.db.insert(schema.taskDependencies).values(row);
        return row;
    }
    async removeTaskDependency(depId) {
        await this.db.delete(schema.taskDependencies).where(eq(schema.taskDependencies.id, depId));
    }
    async updateStoryExternalBinding(storyId, externalId, externalSource, lastSyncedAt) {
        await this.db.update(schema.stories)
            .set({ externalId, externalSource: externalSource, lastSyncedAt, updatedAt: new Date() })
            .where(eq(schema.stories.id, storyId));
    }
    // ─── PM Import ────────────────────────────────────────────────────────────
    async upsertEpicByExternalId(workspaceId, data) {
        const now = new Date();
        const rows = await this.db
            .select()
            .from(schema.epics)
            .where(and(eq(schema.epics.workspaceId, workspaceId), eq(schema.epics.externalId, data.externalId), eq(schema.epics.externalSource, data.externalSource)))
            .all();
        const existing = rows[0];
        if (existing) {
            await this.db
                .update(schema.epics)
                .set({ name: data.name, description: data.description, status: data.status, updatedAt: now })
                .where(eq(schema.epics.id, existing.id));
            return { row: { ...this.mapEpicRow(existing), name: data.name, description: data.description, status: data.status, updatedAt: now.getTime() }, created: false };
        }
        const id = crypto.randomUUID();
        const rankTs = now.getTime();
        await this.db.insert(schema.epics).values({
            id, workspaceId,
            name: data.name, description: data.description,
            color: null, status: data.status,
            rank: rankTs,
            externalId: data.externalId, externalSource: data.externalSource,
            createdAt: now, updatedAt: now,
        });
        const row = {
            id, workspaceId,
            name: data.name, description: data.description,
            color: null, status: data.status,
            rank: rankTs,
            externalId: data.externalId, externalSource: data.externalSource,
            createdAt: rankTs, updatedAt: rankTs,
        };
        return { row, created: true };
    }
    async upsertStoryByExternalId(workspaceId, data) {
        const now = new Date();
        const rows = await this.db
            .select()
            .from(schema.stories)
            .where(and(eq(schema.stories.workspaceId, workspaceId), eq(schema.stories.externalId, data.externalId), eq(schema.stories.externalSource, data.externalSource)))
            .all();
        const existing = rows[0];
        if (existing) {
            await this.db
                .update(schema.stories)
                .set({
                title: data.title, description: data.description,
                epicId: data.epicId, sprintId: data.sprintId,
                status: data.status, priority: data.priority,
                storyPoints: data.storyPoints,
                lastSyncedAt: now.getTime(), updatedAt: now,
            })
                .where(eq(schema.stories.id, existing.id));
            const updated = {
                ...this.mapStoryRow(existing),
                title: data.title, description: data.description,
                epicId: data.epicId, sprintId: data.sprintId,
                status: data.status, priority: data.priority,
                storyPoints: data.storyPoints,
                lastSyncedAt: now.getTime(), updatedAt: now.getTime(),
            };
            return { row: updated, created: false };
        }
        const id = crypto.randomUUID();
        const nowMs = now.getTime();
        await this.db.insert(schema.stories).values({
            id, workspaceId,
            epicId: data.epicId, sprintId: data.sprintId,
            title: data.title, description: data.description,
            acceptanceCriteria: null,
            status: data.status, priority: data.priority,
            assignee: null, storyPoints: data.storyPoints,
            rank: nowMs,
            externalId: data.externalId, externalSource: data.externalSource,
            lastSyncedAt: nowMs, createdAt: now, updatedAt: now,
        });
        const row = {
            id, workspaceId,
            epicId: data.epicId, sprintId: data.sprintId,
            title: data.title, description: data.description,
            acceptanceCriteria: null,
            status: data.status, priority: data.priority,
            assignee: null, storyPoints: data.storyPoints,
            rank: nowMs,
            externalId: data.externalId, externalSource: data.externalSource,
            lastSyncedAt: nowMs, createdAt: nowMs, updatedAt: nowMs,
        };
        return { row, created: true };
    }
    async readEpicsByExternalSource(workspaceId, source) {
        const rows = await this.db
            .select()
            .from(schema.epics)
            .where(and(eq(schema.epics.workspaceId, workspaceId), eq(schema.epics.externalSource, source)))
            .all();
        return rows.map((r) => this.mapEpicRow(r));
    }
    async writePmSyncLog(row) {
        await this.db.insert(schema.pmSyncLog).values({
            id: row.id,
            workspaceId: row.workspaceId,
            entityType: row.entityType,
            entityId: row.entityId,
            provider: row.provider,
            direction: row.direction,
            status: row.status,
            conflictData: row.conflictData ?? null,
            syncedAt: new Date(row.syncedAt),
        });
    }
    // ─── PM Sync — Story 5.5 ──────────────────────────────────────────────────
    mapPmSyncLogRow(r) {
        return {
            ...r,
            conflictData: r.conflictData,
            syncedAt: r.syncedAt instanceof Date ? r.syncedAt.getTime() : r.syncedAt,
            resolvedAt: r.resolvedAt ?? null,
        };
    }
    async listLinkedStories(workspaceId) {
        const rows = await this.db.select().from(schema.stories)
            .where(and(eq(schema.stories.workspaceId, workspaceId), isNotNull(schema.stories.externalId))).all();
        return rows.map((r) => this.mapStoryRow(r));
    }
    async listUnresolvedConflicts(workspaceId) {
        const rows = await this.db.select().from(schema.pmSyncLog)
            .where(and(eq(schema.pmSyncLog.workspaceId, workspaceId), eq(schema.pmSyncLog.status, 'conflict'), isNull(schema.pmSyncLog.resolvedAt))).all();
        return rows.map((r) => this.mapPmSyncLogRow(r));
    }
    async readPmSyncLog(id) {
        const rows = await this.db.select().from(schema.pmSyncLog)
            .where(eq(schema.pmSyncLog.id, id))
            .all();
        return rows[0] ? this.mapPmSyncLogRow(rows[0]) : null;
    }
    async markConflictResolved(id, resolution) {
        const now = Date.now();
        const row = await this.readPmSyncLog(id);
        if (!row)
            return;
        const existingData = row.conflictData ?? {};
        const updatedConflictData = { ...existingData, resolvedAt: now, resolution };
        await this.db.update(schema.pmSyncLog)
            .set({ status: 'resolved', conflictData: updatedConflictData, resolvedAt: now })
            .where(eq(schema.pmSyncLog.id, id));
    }
    async updateStoryFromJira(storyId, fields) {
        const set = { updatedAt: new Date() };
        if (fields.title !== undefined)
            set.title = fields.title;
        if (fields.description !== undefined)
            set.description = fields.description;
        if (fields.status !== undefined)
            set.status = fields.status;
        if (fields.priority !== undefined)
            set.priority = fields.priority;
        if (fields.lastSyncedAt !== undefined)
            set.lastSyncedAt = fields.lastSyncedAt;
        await this.db.update(schema.stories).set(set).where(eq(schema.stories.id, storyId));
    }
    async updateLastSyncedAt(storyId, ts) {
        await this.db.update(schema.stories)
            .set({ lastSyncedAt: ts, updatedAt: new Date() })
            .where(eq(schema.stories.id, storyId));
    }
    async listArtifactVersions(workspaceId, artifactPath) {
        const rows = await this.db
            .select()
            .from(schema.artifactVersions)
            .where(and(eq(schema.artifactVersions.workspaceId, workspaceId), eq(schema.artifactVersions.artifactPath, artifactPath)))
            .orderBy(schema.artifactVersions.version)
            .all();
        return rows.map(toArtifactVersionRow);
    }
    async getArtifactVersion(workspaceId, artifactPath, version) {
        const row = await this.db
            .select()
            .from(schema.artifactVersions)
            .where(and(eq(schema.artifactVersions.workspaceId, workspaceId), eq(schema.artifactVersions.artifactPath, artifactPath), eq(schema.artifactVersions.version, version)))
            .get();
        return row ? toArtifactVersionRow(row) : null;
    }
    async saveArtifactVersion(row) {
        await this.db.insert(schema.artifactVersions).values({
            id: row.id,
            workspaceId: row.workspaceId,
            artifactPath: row.artifactPath,
            artifactType: row.artifactType,
            epicId: row.epicId ?? null,
            content: row.content ?? null,
            r2Key: row.r2Key ?? null,
            author: row.author ?? null,
            version: row.version,
            createdAt: row.createdAt,
        });
    }
    async getLatestArtifactVersions(workspaceId) {
        const rows = await this.db
            .select()
            .from(schema.artifactVersions)
            .where(eq(schema.artifactVersions.workspaceId, workspaceId))
            .all();
        // Return only the latest version of each artifact path
        const latest = new Map();
        for (const r of rows) {
            const existing = latest.get(r.artifactPath);
            if (!existing || r.version > existing.version) {
                latest.set(r.artifactPath, toArtifactVersionRow(r));
            }
        }
        return [...latest.values()];
    }
}
