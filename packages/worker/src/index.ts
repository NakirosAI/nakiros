import { D1Storage } from './storage.js';
import { handleMcpRequest } from './mcp.js';
import { verifyAuth, type AuthContext } from './auth.js';
import { sendInvitationEmail } from './email.js';
import {
  buildWorkspaceMembershipList,
  canManageWorkspaceMemberships,
  hasManageableWorkspaceMember,
  isWorkspaceRole,
  type WorkspaceRole,
} from './workspace-membership.js';
import {
  decryptProviderSecret,
  encryptProviderSecret,
  parseBindWorkspaceCredentialInput,
  parseCreateProviderCredentialInput,
  parseSetWorkspaceDefaultInput,
  parseUpdateProviderCredentialInput,
  toProviderCredentialSummary,
  toWorkspaceBinding,
  type ProviderCredentialDeleteImpact,
  type ProviderCredentialSummary,
  type ProviderCredentialUsage,
  type ProviderCredentialsEnv,
  type WorkspaceProviderCredentialsPayload,
} from './provider-credentials.js';
import { isSupportedImportProvider } from './pm-import.js';
import { parseCreateEpicArgs, parseCreateStoryArgs, parseCreateTaskArgs } from './agent-actions.js';
import { runJiraImport, buildJiraIssuePayload, updateJiraIssue } from './jira-import.js';
import { pushStoryToProvider, PmNotSupportedError } from './pm-push.js';
import { fetchJiraStoryState, detectConflict, type SyncResult } from './pm-sync.js';
import type {
  StoredWorkspace,
  CreateSprintBody,
  UpdateSprintBody,
  CreateEpicBody,
  UpdateEpicBody,
  CreateStoryBody,
  UpdateStoryBody,
  CreateTaskBody,
  UpdateTaskBody,
  StoryFilters,
  ArtifactVersionRow,
  SaveArtifactVersionBody,
} from './types.js';

const PERSONAL_WORKSPACE_LIMIT = 3;

// ─── Env bindings (declared in wrangler.toml) ────────────────────────────────

interface Env extends ProviderCredentialsEnv {
  DB: D1Database;
  CONTEXT_BUCKET: R2Bucket;
  MELODY_AUTH_CLIENT_ID: string;
  MELODY_AUTH_CLIENT_SECRET: string;
  RESEND_API_KEY: string;
}

// ─── Worker ──────────────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === 'OPTIONS') return corsPreflightResponse();

    const url = new URL(request.url);
    const storage = new D1Storage(env.DB);

    // ── Status (public — health check) ────────────────────────────────────
    if (request.method === 'GET' && url.pathname === '/status') {
      return json({ status: 'running' });
    }

    // ── Everything below requires a valid Melody Auth JWT ─────────────────
    const auth = await verifyAuth(request);
    if (!auth) {
      return json({ error: 'Unauthorized — sign in via Nakiros Desktop' }, 401);
    }

    // ── Organizations ──────────────────────────────────────────────────────

    if (request.method === 'GET' && url.pathname === '/orgs/mine') {
      const orgs = await storage.readOrgsForUser(auth.userId);
      return json(orgs);
    }

    if (request.method === 'POST' && url.pathname === '/orgs') {
      let body: { name?: string; slug?: string };
      try {
        body = (await request.json()) as { name?: string; slug?: string };
      } catch {
        return json({ error: 'Invalid JSON body' }, 400);
      }

      const name = body.name?.trim();
      const slug = body.slug?.trim().toLowerCase();

      if (!name) return json({ error: 'Organization name is required' }, 400);
      if (!slug) return json({ error: 'Organization slug is required' }, 400);
      if (!/^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/.test(slug)) {
        return json({ error: 'Slug must be 3–48 chars, lowercase letters, numbers and hyphens only' }, 400);
      }

      const existing = await storage.readOrgBySlug(slug);
      if (existing) return json({ error: 'This identifier is already taken — choose another' }, 409);

      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await storage.createOrg({ id, name, slug, createdBy: auth.userId, createdAt: now }, auth.email);
      return json({ organizationId: id, organizationName: name, organizationSlug: slug }, 201);
    }

    const orgMatch = url.pathname.match(/^\/orgs\/([^/]+)$/);

    if (orgMatch && request.method === 'DELETE') {
      const [, orgId] = orgMatch as [string, string];
      if (!(await storage.isOrgAdmin(orgId, auth.userId))) {
        return json({ error: 'Forbidden — admin only' }, 403);
      }
      await storage.reassignWorkspacesOwnedByOrg(orgId, auth.userId);
      await storage.deleteInvitationsByOrg(orgId);
      await storage.deleteOrgMembers(orgId);
      await storage.deleteOrg(orgId);
      return json({ ok: true });
    }

    // ── Org members ────────────────────────────────────────────────────────

    const orgMembersMatch = url.pathname.match(/^\/orgs\/([^/]+)\/members$/);

    if (orgMembersMatch && request.method === 'GET') {
      const orgId = orgMembersMatch[1]!;
      if (!(await storage.isOrgAdmin(orgId, auth.userId))) {
        return json({ error: 'Forbidden — admin only' }, 403);
      }
      const members = await storage.readOrgMembers(orgId);
      // Patch email for the current user if not stored yet
      const patched = members.map((m) =>
        m.userId === auth.userId && !m.email && auth.email ? { ...m, email: auth.email } : m,
      );
      const invitations = await storage.readInvitationsByOrg(orgId);
      return json([
        ...patched.map((m) => ({ ...m, status: 'active' })),
        ...invitations.map((inv) => ({ invitationId: inv.id, email: inv.email, role: inv.role, invitedAt: inv.invitedAt, status: 'pending' })),
      ]);
    }

    if (orgMembersMatch && request.method === 'POST') {
      const orgId = orgMembersMatch[1]!;
      if (!(await storage.isOrgAdmin(orgId, auth.userId))) {
        return json({ error: 'Forbidden — admin only' }, 403);
      }

      let body: { email?: string; role?: string; inviterEmail?: string };
      try {
        body = (await request.json()) as { email?: string; role?: string; inviterEmail?: string };
      } catch {
        return json({ error: 'Invalid JSON body' }, 400);
      }

      const email = body.email?.trim().toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return json({ error: 'Valid email is required' }, 400);
      }

      const role = body.role === 'admin' ? 'admin' : 'member';

      // Check if already an active member
      const members = await storage.readOrgMembers(orgId);
      if (members.some((m) => m.email?.toLowerCase() === email)) {
        return json({ error: 'This user is already a member', code: 'ALREADY_MEMBER' }, 409);
      }

      // Check for duplicate pending invitation
      const existing = await storage.readInvitationByOrgAndEmail(orgId, email);
      if (existing) {
        return json({ error: 'An invitation for this email is already pending', code: 'ALREADY_MEMBER' }, 409);
      }

      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await storage.createInvitation({ id, orgId, email, role, invitedBy: auth.userId, invitedAt: now });

      // Send invitation email — use waitUntil so the worker stays alive after returning the response
      if (env.RESEND_API_KEY) {
        const orgs = await storage.readOrgsForUser(auth.userId).catch(() => []);
        const orgName = orgs.find((o) => o.id === orgId)?.name ?? 'the organization';
        ctx.waitUntil(
          sendInvitationEmail(env.RESEND_API_KEY, {
            to: email,
            orgName,
            invitedBy: body.inviterEmail ?? auth.email ?? auth.userId,
          }).catch((err) => console.error('[invite] email send failed:', err)),
        );
      }

      return json({ id, email, role, status: 'pending' }, 201);
    }

    const orgLeaveMatch = url.pathname.match(/^\/orgs\/([^/]+)\/members\/me$/);

    if (orgLeaveMatch && request.method === 'DELETE') {
      const [, orgId] = orgLeaveMatch as [string, string];
      await storage.removeOrgMember(orgId, auth.userId);
      return json({ ok: true });
    }

    const orgMemberMatch = url.pathname.match(/^\/orgs\/([^/]+)\/members\/([^/]+)$/);

    if (orgMemberMatch && request.method === 'DELETE') {
      const [, orgId, targetUserId] = orgMemberMatch as [string, string, string];
      if (!(await storage.isOrgAdmin(orgId, auth.userId))) {
        return json({ error: 'Forbidden — admin only' }, 403);
      }
      if (targetUserId === auth.userId) {
        return json({ error: 'Cannot remove yourself from the organization' }, 400);
      }
      await storage.removeOrgMember(orgId, targetUserId);
      return json({ ok: true });
    }

    // ── Cancel invitation ──────────────────────────────────────────────────
    const invitationMatch = url.pathname.match(/^\/orgs\/([^/]+)\/invitations\/([^/]+)$/);

    if (invitationMatch && request.method === 'DELETE') {
      const [, orgId, invId] = invitationMatch as [string, string, string];
      if (!(await storage.isOrgAdmin(orgId, auth.userId))) {
        return json({ error: 'Forbidden — admin only' }, 403);
      }
      await storage.deleteInvitation(invId);
      return json({ ok: true });
    }

    // ── Accept invitations (called after sign-in with email from ID token) ─
    if (request.method === 'POST' && url.pathname === '/invitations/accept') {
      let body: { email?: string };
      try {
        body = (await request.json()) as { email?: string };
      } catch {
        return json({ error: 'Invalid JSON body' }, 400);
      }
      const email = body.email?.trim().toLowerCase();
      if (!email) return json({ error: 'Email is required' }, 400);

      const invitations = await storage.readInvitationsByEmail(email);
      let joined = 0;
      for (const inv of invitations) {
        const existing = await storage.readOrgMembers(inv.orgId);
        if (!existing.some((m) => m.userId === auth.userId)) {
          await storage.addOrgMember({
            orgId: inv.orgId,
            userId: auth.userId,
            email,
            role: inv.role,
            joinedAt: new Date().toISOString(),
          });
          joined++;
        }
        await storage.deleteInvitation(inv.id);
      }
      return json({ joined });
    }

    // ── List workspaces for the current user/org ────────────────────────────
    if (request.method === 'GET' && url.pathname === '/ws') {
      const all = await storage.readWorkspaces();
      const mine: StoredWorkspace[] = [];
      for (const workspace of all) {
        if (await canAccessWorkspace(storage, workspace, auth)) {
          mine.push(workspace);
        }
      }
      return json(mine);
    }

    // ── Resolve workspace by local repo path (for CLI / sync watcher) ───────
    if (request.method === 'GET' && url.pathname === '/workspaces/resolve') {
      const repoPath = url.searchParams.get('path');
      if (!repoPath) return json({ error: 'path query param required' }, 400);

      const all = await storage.readWorkspaces();
      for (const workspace of all) {
        if (!(await canAccessWorkspace(storage, workspace, auth))) continue;
        const match = workspace.repos.some(
          (repo) => repoPath === repo.localPath || repoPath.startsWith(repo.localPath + '/'),
        );
        if (match) return json(workspace);
      }
      return json({ error: 'No workspace found for this path' }, 404);
    }

    if (request.method === 'GET' && url.pathname === '/provider-credentials') {
      return json(await buildProviderCredentialSummaries(storage, deriveCredentialOwnerId(auth)));
    }

    if (request.method === 'POST' && url.pathname === '/provider-credentials') {
      try {
        const input = parseCreateProviderCredentialInput(await request.json());
        const now = new Date().toISOString();
        const credentialId = crypto.randomUUID();
        const encrypted = await encryptProviderSecret(env, input.secret);
        await storage.writeProviderCredential({
          id: credentialId,
          ownerId: deriveCredentialOwnerId(auth),
          provider: input.provider,
          label: input.label,
          metadata: JSON.stringify(input.metadata),
          secretCiphertext: encrypted.secretCiphertext,
          iv: encrypted.iv,
          authTag: encrypted.authTag,
          keyVersion: encrypted.keyVersion,
          createdAt: now,
          updatedAt: now,
          revokedAt: null,
        });
        const created = await buildProviderCredentialSummary(storage, credentialId);
        if (!created) return json({ error: 'Credential not found after creation' }, 500);
        return json(created, 201);
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : 'Invalid credential payload' }, 400);
      }
    }

    const providerCredentialMatch = url.pathname.match(/^\/provider-credentials\/([^/]+)$/);
    const providerCredentialRevokeMatch = url.pathname.match(/^\/provider-credentials\/([^/]+)\/revoke$/);

    if (providerCredentialMatch && request.method === 'PUT') {
      const credentialId = providerCredentialMatch[1]!;
      const existing = await storage.readProviderCredential(credentialId);
      if (!existing) return json({ error: 'Credential not found' }, 404);
      if (existing.ownerId !== deriveCredentialOwnerId(auth)) return json({ error: 'Forbidden' }, 403);

      try {
        const input = parseUpdateProviderCredentialInput(existing.provider as 'jira' | 'github' | 'gitlab', await request.json());
        const encrypted = input.secret ? await encryptProviderSecret(env, input.secret) : null;
        await storage.writeProviderCredential({
          ...existing,
          label: input.label ?? existing.label,
          metadata: input.metadata ? JSON.stringify(input.metadata) : existing.metadata,
          secretCiphertext: encrypted?.secretCiphertext ?? existing.secretCiphertext,
          iv: encrypted?.iv ?? existing.iv,
          authTag: encrypted?.authTag ?? existing.authTag,
          keyVersion: encrypted?.keyVersion ?? existing.keyVersion,
          updatedAt: new Date().toISOString(),
        });
        const summary = await buildProviderCredentialSummary(storage, existing.id);
        return json(summary);
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : 'Invalid credential payload' }, 400);
      }
    }

    if (providerCredentialRevokeMatch && request.method === 'POST') {
      const credentialId = providerCredentialRevokeMatch[1]!;
      const existing = await storage.readProviderCredential(credentialId);
      if (!existing) return json({ error: 'Credential not found' }, 404);
      if (existing.ownerId !== deriveCredentialOwnerId(auth)) return json({ error: 'Forbidden' }, 403);

      const bindings = await storage.readCredentialBindings(credentialId);
      await Promise.all(
        bindings
          .filter((binding) => binding.isDefault)
          .map((binding) => storage.writeWorkspaceProviderBinding({ ...binding, isDefault: false })),
      );
      await storage.writeProviderCredential({
        ...existing,
        revokedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      const summary = await buildProviderCredentialSummary(storage, credentialId);
      return json(summary);
    }

    if (providerCredentialMatch && request.method === 'DELETE') {
      const credentialId = providerCredentialMatch[1]!;
      const existing = await storage.readProviderCredential(credentialId);
      if (!existing) return json({ error: 'Credential not found' }, 404);
      if (existing.ownerId !== deriveCredentialOwnerId(auth)) return json({ error: 'Forbidden' }, 403);

      const impact = await buildProviderCredentialDeleteImpact(storage, credentialId);
      const forceDelete = url.searchParams.get('force') === 'true';
      if (impact.impactedWorkspaces.length > 0 && !forceDelete) {
        return json({
          error: 'Credential is still used by one or more workspaces',
          impactedWorkspaces: impact.impactedWorkspaces,
        }, 409);
      }

      const bindings = await storage.readCredentialBindings(credentialId);
      await Promise.all(bindings.map((binding) => storage.deleteWorkspaceProviderBinding(binding.workspaceId, binding.credentialId)));
      await storage.deleteProviderCredential(credentialId);
      return json({ ...impact, canDelete: true });
    }

    // ── MCP by workspace ID ────────────────────────────────────────────────
    const mcpMatch = url.pathname.match(/^\/ws\/([^/]+)\/mcp$/);
    if (mcpMatch) {
      const workspaceId = mcpMatch[1]!;
      const workspace = await storage.readWorkspace(workspaceId);
      if (!workspace) return json({ error: `Workspace '${workspaceId}' not found` }, 404);
      if (!(await canAccessWorkspace(storage, workspace, auth))) return json({ error: 'Forbidden' }, 403);
      return handleMcpRequest(request, workspace, storage);
    }

    // ── Workspace CRUD ──────────────────────────────────────────────────────
    const wsMatch = url.pathname.match(/^\/ws\/([^/]+)$/);

    if (wsMatch && request.method === 'PUT') {
      const workspaceId = wsMatch[1]!;
      let body: StoredWorkspace;
      try {
        body = (await request.json()) as StoredWorkspace;
      } catch {
        return json({ error: 'Invalid JSON body' }, 400);
      }
      const all = await storage.readWorkspaces();
      const existing = all.find((workspace) => workspace.id === workspaceId) ?? null;
      if (existing && !(await canAccessWorkspace(storage, existing, auth))) {
        return json({ error: 'Forbidden' }, 403);
      }
      const ownership = await resolveWorkspaceOwnerId(storage, existing?.ownerId, body.ownerId, auth);
      if (ownership.errorResponse) {
        return ownership.errorResponse;
      }

      if (!existing && ownership.ownerId === auth.userId) {
        const personalWorkspaces = all.filter((workspace) => isOwnedByCurrentScope(workspace, auth));
        if (personalWorkspaces.length >= PERSONAL_WORKSPACE_LIMIT) {
          return json(
            {
              error: `Solo plan limited to ${PERSONAL_WORKSPACE_LIMIT} private workspaces`,
              code: 'SOLO_WORKSPACE_LIMIT',
            },
            403,
          );
        }
      }

      await storage.writeWorkspace({ ...body, id: workspaceId, ownerId: ownership.ownerId });
      if (ownership.shouldSeedOwnerMembership) {
        await seedWorkspaceOwnerMembership(storage, workspaceId, auth.userId);
      }
      return json({ ok: true });
    }

    if (wsMatch && request.method === 'DELETE') {
      const workspaceId = wsMatch[1]!;
      const workspace = await storage.readWorkspace(workspaceId);
      if (workspace && !(await canAccessWorkspace(storage, workspace, auth))) return json({ error: 'Forbidden' }, 403);
      await storage.deleteWorkspace(workspaceId);
      return json({ ok: true });
    }

    const workspaceProviderCredentialsMatch = url.pathname.match(/^\/ws\/([^/]+)\/provider-credentials$/);
    const workspaceProviderBindMatch = url.pathname.match(/^\/ws\/([^/]+)\/provider-credentials\/bind$/);
    const workspaceProviderDefaultMatch = url.pathname.match(/^\/ws\/([^/]+)\/provider-credentials\/default$/);
    const workspaceProviderCredentialMatch = url.pathname.match(/^\/ws\/([^/]+)\/provider-credentials\/([^/]+)$/);

    if (workspaceProviderCredentialsMatch && request.method === 'GET') {
      const workspaceId = workspaceProviderCredentialsMatch[1]!;
      const workspace = await storage.readWorkspace(workspaceId);
      if (!workspace) return json({ error: 'Workspace not found' }, 404);
      if (!(await canAccessWorkspace(storage, workspace, auth))) return json({ error: 'Forbidden' }, 403);
      return json(await buildWorkspaceProviderCredentialsPayload(storage, workspace, deriveWorkspaceScopeOwnerId(workspace, auth)));
    }

    if (workspaceProviderBindMatch && request.method === 'POST') {
      const workspaceId = workspaceProviderBindMatch[1]!;
      const workspace = await storage.readWorkspace(workspaceId);
      if (!workspace) return json({ error: 'Workspace not found' }, 404);
      if (!(await canAccessWorkspace(storage, workspace, auth))) return json({ error: 'Forbidden' }, 403);

      try {
        const input = parseBindWorkspaceCredentialInput(await request.json());
        const credential = await storage.readProviderCredential(input.credentialId);
        if (!credential) return json({ error: 'Credential not found' }, 404);
        if (credential.ownerId !== deriveWorkspaceScopeOwnerId(workspace, auth)) return json({ error: 'Forbidden' }, 403);
        if (credential.provider !== input.provider) return json({ error: 'Credential provider mismatch' }, 400);
        if (credential.revokedAt) return json({ error: 'Credential is revoked' }, 400);

        const existingBindings = await storage.readWorkspaceProviderBindings(workspaceId);
        const providerBindings = existingBindings.filter((binding) => binding.provider === input.provider);
        const shouldSetDefault = input.isDefault || providerBindings.every((binding) => !binding.isDefault);

        if (shouldSetDefault) {
          await storage.clearWorkspaceProviderDefaults(workspaceId, input.provider);
        }

        await storage.writeWorkspaceProviderBinding({
          id: crypto.randomUUID(),
          workspaceId,
          credentialId: input.credentialId,
          provider: input.provider,
          isDefault: shouldSetDefault,
          createdAt: new Date().toISOString(),
        });

        return json(await buildWorkspaceProviderCredentialsPayload(storage, workspace, deriveWorkspaceScopeOwnerId(workspace, auth)));
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : 'Invalid workspace binding payload' }, 400);
      }
    }

    if (workspaceProviderDefaultMatch && request.method === 'PUT') {
      const workspaceId = workspaceProviderDefaultMatch[1]!;
      const workspace = await storage.readWorkspace(workspaceId);
      if (!workspace) return json({ error: 'Workspace not found' }, 404);
      if (!(await canAccessWorkspace(storage, workspace, auth))) return json({ error: 'Forbidden' }, 403);

      try {
        const input = parseSetWorkspaceDefaultInput(await request.json());
        const bindings = await storage.readWorkspaceProviderBindings(workspaceId);
        const target = bindings.find((binding) => binding.credentialId === input.credentialId && binding.provider === input.provider);
        if (!target) return json({ error: 'Credential is not bound to this workspace' }, 404);
        const credential = await storage.readProviderCredential(input.credentialId);
        if (!credential) return json({ error: 'Credential not found' }, 404);
        if (credential.revokedAt) return json({ error: 'Credential is revoked' }, 400);
        await storage.clearWorkspaceProviderDefaults(workspaceId, input.provider);
        await storage.writeWorkspaceProviderBinding({ ...target, isDefault: true });
        return json(await buildWorkspaceProviderCredentialsPayload(storage, workspace, deriveWorkspaceScopeOwnerId(workspace, auth)));
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : 'Invalid default binding payload' }, 400);
      }
    }

    if (workspaceProviderCredentialMatch && request.method === 'DELETE') {
      const [, workspaceId, credentialId] = workspaceProviderCredentialMatch as [string, string, string];
      const workspace = await storage.readWorkspace(workspaceId);
      if (!workspace) return json({ error: 'Workspace not found' }, 404);
      if (!(await canAccessWorkspace(storage, workspace, auth))) return json({ error: 'Forbidden' }, 403);
      await storage.deleteWorkspaceProviderBinding(workspaceId, credentialId);
      return json(await buildWorkspaceProviderCredentialsPayload(storage, workspace, deriveWorkspaceScopeOwnerId(workspace, auth)));
    }

    const workspaceMembersMatch = url.pathname.match(/^\/ws\/([^/]+)\/members$/);
    const workspaceCurrentMemberMatch = url.pathname.match(/^\/ws\/([^/]+)\/members\/me$/);
    const workspaceMemberMatch = url.pathname.match(/^\/ws\/([^/]+)\/members\/([^/]+)$/);

    if (workspaceCurrentMemberMatch && request.method === 'GET') {
      const workspaceId = workspaceCurrentMemberMatch[1]!;
      const context = await resolveWorkspaceMembershipContext(storage, workspaceId, auth, { backfillManager: true });
      if (context.errorResponse) return context.errorResponse;

      if (context.scope === 'personal') {
        return json({
          workspaceId,
          scope: 'personal',
          role: null,
          status: 'personal',
        });
      }

      return json({
        workspaceId,
        scope: 'organization',
        role: context.currentUserRole,
        status: context.currentUserRole ? 'active' : 'not_added',
      });
    }

    if (workspaceMembersMatch && request.method === 'GET') {
      const workspaceId = workspaceMembersMatch[1]!;
      const context = await resolveWorkspaceMembershipContext(storage, workspaceId, auth, { backfillManager: true });
      if (context.errorResponse) return context.errorResponse;

      if (context.scope === 'personal') {
        return json({
          workspaceId,
          scope: 'personal',
          currentUserRole: null,
          canManage: false,
          members: [],
        });
      }

      if (!context.canManage) {
        return json({ error: 'Forbidden — workspace owner or admin only' }, 403);
      }

      return json({
        workspaceId,
        scope: 'organization',
        currentUserRole: context.currentUserRole,
        canManage: true,
        members: buildWorkspaceMembershipList(context.orgMembers, context.workspaceMembers, auth.userId),
      });
    }

    if (workspaceMemberMatch && request.method === 'PUT') {
      const [, workspaceId, targetUserId] = workspaceMemberMatch as [string, string, string];
      const context = await resolveWorkspaceMembershipContext(storage, workspaceId, auth, { backfillManager: true });
      if (context.errorResponse) return context.errorResponse;

      if (context.scope !== 'organization') {
        return json({ error: 'Workspace roles are only supported for organization workspaces' }, 400);
      }

      if (!context.canManage) {
        return json({ error: 'Forbidden — workspace owner or admin only' }, 403);
      }

      let body: { role?: string };
      try {
        body = (await request.json()) as { role?: string };
      } catch {
        return json({ error: 'Invalid JSON body' }, 400);
      }

      if (!isWorkspaceRole(body.role)) {
        return json({ error: 'Invalid workspace role' }, 400);
      }

      if (!context.orgMembers.some((member) => member.userId === targetUserId)) {
        return json({ error: 'Forbidden — target user must belong to the workspace organization' }, 403);
      }

      const now = new Date().toISOString();
      const existing = context.workspaceMembers.find((member) => member.userId === targetUserId) ?? null;
      const nextMembers = [
        ...context.workspaceMembers.filter((member) => member.userId !== targetUserId),
        {
          workspaceId,
          userId: targetUserId,
          role: body.role,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        },
      ];

      if (!hasManageableWorkspaceMember(nextMembers)) {
        return json({ error: 'At least one workspace owner or admin must remain assigned' }, 400);
      }

      await storage.upsertWorkspaceMember({
        workspaceId,
        userId: targetUserId,
        role: body.role,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });

      const updatedMembers = await storage.readWorkspaceMembers(workspaceId);
      return json({
        workspaceId,
        scope: 'organization',
        currentUserRole: updatedMembers.find((member) => member.userId === auth.userId && isWorkspaceRole(member.role))?.role ?? null,
        canManage: true,
        members: buildWorkspaceMembershipList(context.orgMembers, updatedMembers, auth.userId),
      });
    }

    if (workspaceMemberMatch && request.method === 'DELETE') {
      const [, workspaceId, targetUserId] = workspaceMemberMatch as [string, string, string];
      const context = await resolveWorkspaceMembershipContext(storage, workspaceId, auth, { backfillManager: true });
      if (context.errorResponse) return context.errorResponse;

      if (context.scope !== 'organization') {
        return json({ error: 'Workspace roles are only supported for organization workspaces' }, 400);
      }

      if (!context.canManage) {
        return json({ error: 'Forbidden — workspace owner or admin only' }, 403);
      }

      const existing = context.workspaceMembers.find((member) => member.userId === targetUserId);
      if (!existing) {
        return json({ ok: true });
      }

      const nextMembers = context.workspaceMembers.filter((member) => member.userId !== targetUserId);
      if (!hasManageableWorkspaceMember(nextMembers)) {
        return json({ error: 'At least one workspace owner or admin must remain assigned' }, 400);
      }

      await storage.deleteWorkspaceMember(workspaceId, targetUserId);
      return json({ ok: true });
    }

    // ── Context endpoints ──────────────────────────────────────────────────

    const ctxMatch = url.pathname.match(/^\/ws\/([^/]+)\/context$/);

    if (ctxMatch) {
      const workspaceId = ctxMatch[1]!;
      const workspace = await storage.readWorkspace(workspaceId);
      if (!workspace) return json({ error: 'Workspace not found' }, 404);
      if (!(await canAccessWorkspace(storage, workspace, auth))) return json({ error: 'Forbidden' }, 403);

      // GET — retourne le manifest de contexte (métadonnées uniquement, pas le contenu)
      if (request.method === 'GET') {
        const ctx = workspace.context ?? {};
        const reposMeta: Record<string, { updatedAt?: string; updatedBy?: string; files: string[] }> = {};
        for (const [name, repoCtx] of Object.entries(ctx.repos ?? {})) {
          reposMeta[name] = {
            updatedAt: repoCtx.updatedAt,
            updatedBy: repoCtx.updatedBy,
            files: (['architecture', 'stack', 'conventions', 'api', 'llms'] as const)
              .filter((f) => Boolean(repoCtx[f])),
          };
        }
        return json({
          generatedAt: ctx.generatedAt,
          updatedBy: ctx.updatedBy,
          hasGlobal: Boolean(ctx.global),
          hasProduct: Boolean(ctx.product),
          hasInterRepo: Boolean(ctx.interRepo),
          repos: reposMeta,
        });
      }

      // PUT — met à jour le contexte global (global, product, interRepo)
      if (request.method === 'PUT') {
        const body = (await request.json()) as Partial<{
          global: string; product: string; interRepo: string;
          generatedAt: string; force: boolean;
        }>;
        // Conflict detection: reject if remote is newer unless force=true
        const remoteGeneratedAt = workspace.context?.generatedAt;
        if (!body.force && body.generatedAt && remoteGeneratedAt) {
          if (new Date(remoteGeneratedAt) > new Date(body.generatedAt)) {
            return json({
              error: 'Context conflict — remote version is newer',
              code: 'CONTEXT_CONFLICT',
              remoteGeneratedAt,
              updatedBy: workspace.context?.updatedBy,
            }, 409);
          }
        }
        const now = new Date().toISOString();
        workspace.context = {
          ...workspace.context,
          ...(body.global !== undefined && { global: body.global }),
          ...(body.product !== undefined && { product: body.product }),
          ...(body.interRepo !== undefined && { interRepo: body.interRepo }),
          generatedAt: body.generatedAt ?? now,
          updatedBy: auth.email ?? auth.userId,
        };
        await storage.writeWorkspace(workspace);
        return json({ ok: true, generatedAt: workspace.context?.generatedAt });
      }
    }

    // GET /ws/:id/context/_global/:file — télécharge le contenu d'un fichier global
    const globalFileMatch = url.pathname.match(/^\/ws\/([^/]+)\/context\/_global\/(global-context|product-context|inter-repo)$/);
    if (globalFileMatch && request.method === 'GET') {
      const [, workspaceId, fileName] = globalFileMatch as [string, string, string];
      const workspace = await storage.readWorkspace(workspaceId);
      if (!workspace) return json({ error: 'Workspace not found' }, 404);
      if (!(await canAccessWorkspace(storage, workspace, auth))) return json({ error: 'Forbidden' }, 403);
      const fieldMap: Record<string, 'global' | 'product' | 'interRepo'> = {
        'global-context': 'global',
        'product-context': 'product',
        'inter-repo': 'interRepo',
      };
      const field = fieldMap[fileName]!;
      const content = workspace.context?.[field];
      if (!content) return json({ error: 'File not found' }, 404);
      return new Response(content, {
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'X-Updated-At': workspace.context?.generatedAt ?? '',
          'X-Updated-By': workspace.context?.updatedBy ?? '',
        },
      });
    }

    const repoCtxMatch = url.pathname.match(/^\/ws\/([^/]+)\/repos\/([^/]+)\/context$/);

    if (repoCtxMatch) {
      const [, workspaceId, repoName] = repoCtxMatch as [string, string, string];
      const workspace = await storage.readWorkspace(workspaceId);
      if (!workspace) return json({ error: 'Workspace not found' }, 404);
      if (!(await canAccessWorkspace(storage, workspace, auth))) return json({ error: 'Forbidden' }, 403);

      // GET — retourne le contexte complet d'un repo (contenu markdown inclus)
      if (request.method === 'GET') {
        const repoCtx = workspace.context?.repos?.[repoName];
        if (!repoCtx) return json({ error: 'No context for this repo' }, 404);
        return json(repoCtx);
      }

      // PUT — met à jour le contexte d'un repo spécifique
      if (request.method === 'PUT') {
        const body = (await request.json()) as Partial<{
          architecture: string; stack: string; conventions: string; api: string; llms: string;
          updatedAt: string; force: boolean;
        }>;
        // Conflict detection: reject if remote is newer unless force=true
        const remoteUpdatedAt = workspace.context?.repos?.[repoName]?.updatedAt;
        if (!body.force && body.updatedAt && remoteUpdatedAt) {
          if (new Date(remoteUpdatedAt) > new Date(body.updatedAt)) {
            return json({
              error: 'Context conflict — remote version is newer',
              code: 'CONTEXT_CONFLICT',
              remoteUpdatedAt,
              updatedBy: workspace.context?.repos?.[repoName]?.updatedBy,
            }, 409);
          }
        }
        const now = new Date().toISOString();
        workspace.context = {
          ...workspace.context,
          repos: {
            ...workspace.context?.repos,
            [repoName]: {
              ...workspace.context?.repos?.[repoName],
              ...(body.architecture !== undefined && { architecture: body.architecture }),
              ...(body.stack !== undefined && { stack: body.stack }),
              ...(body.conventions !== undefined && { conventions: body.conventions }),
              ...(body.api !== undefined && { api: body.api }),
              ...(body.llms !== undefined && { llms: body.llms }),
              updatedAt: body.updatedAt ?? now,
              updatedBy: auth.email ?? auth.userId,
            },
          },
        };
        await storage.writeWorkspace(workspace);
        return json({ ok: true, updatedAt: workspace.context?.repos?.[repoName]?.updatedAt });
      }
    }

    // ── Collab sessions ────────────────────────────────────────────────────
    const collabsMatch = url.pathname.match(/^\/ws\/([^/]+)\/collabs$/);
    if (collabsMatch && request.method === 'GET') {
      const workspace = await storage.readWorkspace(collabsMatch[1]!);
      if (workspace && !(await canAccessWorkspace(storage, workspace, auth))) return json({ error: 'Forbidden' }, 403);
      const collabs = await storage.readCollabs(collabsMatch[1]!);
      return json(collabs);
    }

    const collabMatch = url.pathname.match(/^\/ws\/([^/]+)\/collabs\/([^/]+)$/);
    if (collabMatch && request.method === 'GET') {
      const collab = await storage.readCollab(collabMatch[2]!);
      if (!collab) return json({ error: 'Collab not found' }, 404);
      return json(collab);
    }

    // ── PM Data Layer — Sprint/Epic/Story/Task CRUD ────────────────────────
    // Route order: most-specific patterns first (dependencies → tasks → stories → sprints → epics)

    // Task dependency: DELETE /ws/:id/stories/:storyId/tasks/:taskId/dependencies/:depId
    const taskDependencyMatch = url.pathname.match(/^\/ws\/([^/]+)\/stories\/([^/]+)\/tasks\/([^/]+)\/dependencies\/([^/]+)$/);
    if (taskDependencyMatch && request.method === 'DELETE') {
      const [, workspaceId, storyId, taskId, depId] = taskDependencyMatch as [string, string, string, string, string];
      const workspace = await storage.readWorkspace(workspaceId);
      if (!workspace) return json({ error: 'Workspace not found' }, 404);
      if (!(await canAccessWorkspace(storage, workspace, auth))) return json({ error: 'Forbidden' }, 403);
      const story = await storage.readStory(storyId);
      if (!story || story.workspaceId !== workspaceId) return json({ error: 'Story not found' }, 404);
      const task = await storage.readTask(taskId);
      if (!task || task.storyId !== storyId) return json({ error: 'Task not found' }, 404);
      await storage.removeTaskDependency(depId);
      return json({ ok: true });
    }

    // Task dependencies: POST /ws/:id/stories/:storyId/tasks/:taskId/dependencies
    const taskDependenciesMatch = url.pathname.match(/^\/ws\/([^/]+)\/stories\/([^/]+)\/tasks\/([^/]+)\/dependencies$/);
    if (taskDependenciesMatch && request.method === 'POST') {
      const [, workspaceId, storyId, taskId] = taskDependenciesMatch as [string, string, string, string];
      const workspace = await storage.readWorkspace(workspaceId);
      if (!workspace) return json({ error: 'Workspace not found' }, 404);
      if (!(await canAccessWorkspace(storage, workspace, auth))) return json({ error: 'Forbidden' }, 403);
      const story = await storage.readStory(storyId);
      if (!story || story.workspaceId !== workspaceId) return json({ error: 'Story not found' }, 404);
      const task = await storage.readTask(taskId);
      if (!task || task.storyId !== storyId) return json({ error: 'Task not found' }, 404);
      let depBody: { dependsOnTaskId?: string };
      try { depBody = (await request.json()) as { dependsOnTaskId?: string }; }
      catch { return json({ error: 'Invalid JSON body' }, 400); }
      if (!depBody.dependsOnTaskId) return json({ error: 'dependsOnTaskId is required' }, 400);
      if (taskId === depBody.dependsOnTaskId) return json({ error: 'A task cannot depend on itself' }, 400);
      const dep = await storage.addTaskDependency(taskId, depBody.dependsOnTaskId);
      return json(dep, 201);
    }

    // Single task: PATCH /ws/:id/stories/:storyId/tasks/:taskId
    const taskMatch = url.pathname.match(/^\/ws\/([^/]+)\/stories\/([^/]+)\/tasks\/([^/]+)$/);
    if (taskMatch && request.method === 'PATCH') {
      const [, workspaceId, storyId, taskId] = taskMatch as [string, string, string, string];
      const workspace = await storage.readWorkspace(workspaceId);
      if (!workspace) return json({ error: 'Workspace not found' }, 404);
      if (!(await canAccessWorkspace(storage, workspace, auth))) return json({ error: 'Forbidden' }, 403);
      const story = await storage.readStory(storyId);
      if (!story || story.workspaceId !== workspaceId) return json({ error: 'Story not found' }, 404);
      const task = await storage.readTask(taskId);
      if (!task || task.storyId !== storyId) return json({ error: 'Task not found' }, 404);
      let taskPatch: UpdateTaskBody;
      try { taskPatch = (await request.json()) as UpdateTaskBody; }
      catch { return json({ error: 'Invalid JSON body' }, 400); }
      return json(await storage.updateTask(taskId, taskPatch));
    }

    // Tasks collection: GET, POST /ws/:id/stories/:storyId/tasks
    const tasksMatch = url.pathname.match(/^\/ws\/([^/]+)\/stories\/([^/]+)\/tasks$/);
    if (tasksMatch) {
      const [, workspaceId, storyId] = tasksMatch as [string, string, string];
      const workspace = await storage.readWorkspace(workspaceId);
      if (!workspace) return json({ error: 'Workspace not found' }, 404);
      if (!(await canAccessWorkspace(storage, workspace, auth))) return json({ error: 'Forbidden' }, 403);
      const story = await storage.readStory(storyId);
      if (!story || story.workspaceId !== workspaceId) return json({ error: 'Story not found' }, 404);
      if (request.method === 'GET') {
        return json(await storage.listTasks(storyId));
      }
      if (request.method === 'POST') {
        let taskBody: CreateTaskBody;
        try { taskBody = (await request.json()) as CreateTaskBody; }
        catch { return json({ error: 'Invalid JSON body' }, 400); }
        if (!taskBody.title) return json({ error: 'title is required' }, 400);
        return json(await storage.createTask(storyId, taskBody), 201);
      }
    }

    // ── Story Push (provider-agnostic): POST /ws/:id/stories/:storyId/push ───
    const storyPushMatch = url.pathname.match(/^\/ws\/([^/]+)\/stories\/([^/]+)\/push$/);
    if (storyPushMatch && request.method === 'POST') {
      const workspaceId = storyPushMatch[1]!;
      const storyId = storyPushMatch[2]!;

      const workspace = await storage.readWorkspace(workspaceId);
      if (!workspace) return json({ error: 'Workspace not found' }, 404);
      if (!(await canAccessWorkspace(storage, workspace, auth))) return json({ error: 'Forbidden' }, 403);

      const story = await storage.readStory(storyId);
      if (!story || story.workspaceId !== workspaceId) return json({ error: 'Story not found' }, 404);

      if (story.externalId) {
        return json({
          error: true,
          code: 'already_synced',
          message: `Story is already linked to an external PM tool (${story.externalId})`,
        }, 409);
      }

      const bindings = await storage.readWorkspaceProviderBindings(workspaceId);
      const defaultBinding = bindings.find((b) => b.isDefault);
      if (!defaultBinding) {
        return json({ error: true, code: 'pm_config_invalid', message: 'No PM tool configured for this workspace' }, 400);
      }

      if (!workspace.projectKey) {
        return json({ error: true, code: 'pm_config_invalid', message: 'No project key configured for this workspace' }, 400);
      }

      try {
        const result = await pushStoryToProvider({
          story,
          providerName: defaultBinding.provider,
          credentialId: defaultBinding.credentialId,
          storage,
          env,
          projectKey: workspace.projectKey,
        });

        await storage.updateStoryExternalBinding(storyId, result.issueKey, result.provider, Date.now());
        await storage.writePmSyncLog({
          id: crypto.randomUUID(),
          workspaceId,
          entityType: 'story',
          entityId: storyId,
          provider: result.provider as 'jira' | 'linear' | 'github' | 'gitlab',
          direction: 'push',
          status: 'success',
          conflictData: null,
          syncedAt: Date.now(),
        });

        return json({ ok: true, issueKey: result.issueKey, provider: result.provider });

      } catch (err) {
        if (err instanceof PmNotSupportedError) {
          return json({ error: true, code: 'pm_not_supported', message: err.message }, 501);
        }
        await storage.writePmSyncLog({
          id: crypto.randomUUID(),
          workspaceId,
          entityType: 'story',
          entityId: storyId,
          provider: defaultBinding.provider as 'jira' | 'linear' | 'github' | 'gitlab',
          direction: 'push',
          status: 'error',
          conflictData: null,
          syncedAt: Date.now(),
        }).catch(() => {});
        const message = err instanceof Error ? err.message : 'Unknown error';
        return json({ error: true, code: 'pm_push_failed', message }, 502);
      }
    }

    // Single story: PATCH /ws/:id/stories/:storyId
    const storyMatch = url.pathname.match(/^\/ws\/([^/]+)\/stories\/([^/]+)$/);
    if (storyMatch && request.method === 'PATCH') {
      const [, workspaceId, storyId] = storyMatch as [string, string, string];
      const workspace = await storage.readWorkspace(workspaceId);
      if (!workspace) return json({ error: 'Workspace not found' }, 404);
      if (!(await canAccessWorkspace(storage, workspace, auth))) return json({ error: 'Forbidden' }, 403);
      const story = await storage.readStory(storyId);
      if (!story || story.workspaceId !== workspaceId) return json({ error: 'Story not found' }, 404);
      let storyPatch: UpdateStoryBody;
      try { storyPatch = (await request.json()) as UpdateStoryBody; }
      catch { return json({ error: 'Invalid JSON body' }, 400); }
      return json(await storage.updateStory(storyId, storyPatch));
    }

    // Stories collection: GET, POST /ws/:id/stories
    const storiesMatch = url.pathname.match(/^\/ws\/([^/]+)\/stories$/);
    if (storiesMatch) {
      const [, workspaceId] = storiesMatch as [string, string];
      const workspace = await storage.readWorkspace(workspaceId);
      if (!workspace) return json({ error: 'Workspace not found' }, 404);
      if (!(await canAccessWorkspace(storage, workspace, auth))) return json({ error: 'Forbidden' }, 403);
      if (request.method === 'GET') {
        const filters: StoryFilters = {
          epicId: url.searchParams.get('epicId') ?? undefined,
          sprintId: url.searchParams.get('sprintId') ?? undefined,
          backlog: url.searchParams.get('backlog') === 'true',
        };
        return json(await storage.listStories(workspaceId, filters));
      }
      if (request.method === 'POST') {
        let storyBody: CreateStoryBody;
        try { storyBody = (await request.json()) as CreateStoryBody; }
        catch { return json({ error: 'Invalid JSON body' }, 400); }
        if (!storyBody.title) return json({ error: 'title is required' }, 400);
        return json(await storage.createStory(workspaceId, storyBody), 201);
      }
    }

    // Single sprint: PATCH /ws/:id/sprints/:sprintId
    const sprintMatch = url.pathname.match(/^\/ws\/([^/]+)\/sprints\/([^/]+)$/);
    if (sprintMatch && request.method === 'PATCH') {
      const [, workspaceId, sprintId] = sprintMatch as [string, string, string];
      const workspace = await storage.readWorkspace(workspaceId);
      if (!workspace) return json({ error: 'Workspace not found' }, 404);
      if (!(await canAccessWorkspace(storage, workspace, auth))) return json({ error: 'Forbidden' }, 403);
      const sprint = await storage.readSprint(sprintId);
      if (!sprint || sprint.workspaceId !== workspaceId) return json({ error: 'Sprint not found' }, 404);
      let sprintPatch: UpdateSprintBody;
      try { sprintPatch = (await request.json()) as UpdateSprintBody; }
      catch { return json({ error: 'Invalid JSON body' }, 400); }
      if (sprintPatch.status === 'active') {
        const allSprints = await storage.listSprints(workspaceId);
        const alreadyActive = allSprints.find(s => s.status === 'active' && s.id !== sprintId);
        if (alreadyActive) {
          return json({ error: 'Another sprint is already active', code: 'SPRINT_ALREADY_ACTIVE' }, 409);
        }
      }
      if (sprintPatch.startDate && sprintPatch.endDate && sprintPatch.startDate > sprintPatch.endDate) {
        return json({ error: 'start_date must be ≤ end_date' }, 400);
      }
      return json(await storage.updateSprint(sprintId, sprintPatch));
    }

    // Sprints collection: GET, POST /ws/:id/sprints
    const sprintsMatch = url.pathname.match(/^\/ws\/([^/]+)\/sprints$/);
    if (sprintsMatch) {
      const [, workspaceId] = sprintsMatch as [string, string];
      const workspace = await storage.readWorkspace(workspaceId);
      if (!workspace) return json({ error: 'Workspace not found' }, 404);
      if (!(await canAccessWorkspace(storage, workspace, auth))) return json({ error: 'Forbidden' }, 403);
      if (request.method === 'GET') {
        return json(await storage.listSprints(workspaceId));
      }
      if (request.method === 'POST') {
        let sprintBody: CreateSprintBody;
        try { sprintBody = (await request.json()) as CreateSprintBody; }
        catch { return json({ error: 'Invalid JSON body' }, 400); }
        if (!sprintBody.name) return json({ error: 'name is required' }, 400);
        if (sprintBody.startDate && sprintBody.endDate && sprintBody.startDate > sprintBody.endDate) {
          return json({ error: 'start_date must be ≤ end_date' }, 400);
        }
        return json(await storage.createSprint(workspaceId, sprintBody), 201);
      }
    }

    // Single epic: PATCH /ws/:id/epics/:epicId
    const epicMatch = url.pathname.match(/^\/ws\/([^/]+)\/epics\/([^/]+)$/);
    if (epicMatch && request.method === 'PATCH') {
      const [, workspaceId, epicId] = epicMatch as [string, string, string];
      const workspace = await storage.readWorkspace(workspaceId);
      if (!workspace) return json({ error: 'Workspace not found' }, 404);
      if (!(await canAccessWorkspace(storage, workspace, auth))) return json({ error: 'Forbidden' }, 403);
      const epic = await storage.readEpic(epicId);
      if (!epic || epic.workspaceId !== workspaceId) return json({ error: 'Epic not found' }, 404);
      let epicPatch: UpdateEpicBody;
      try { epicPatch = (await request.json()) as UpdateEpicBody; }
      catch { return json({ error: 'Invalid JSON body' }, 400); }
      return json(await storage.updateEpic(epicId, epicPatch));
    }

    // Epics collection: GET, POST /ws/:id/epics
    const epicsMatch = url.pathname.match(/^\/ws\/([^/]+)\/epics$/);
    if (epicsMatch) {
      const [, workspaceId] = epicsMatch as [string, string];
      const workspace = await storage.readWorkspace(workspaceId);
      if (!workspace) return json({ error: 'Workspace not found' }, 404);
      if (!(await canAccessWorkspace(storage, workspace, auth))) return json({ error: 'Forbidden' }, 403);
      if (request.method === 'GET') {
        return json(await storage.listEpics(workspaceId));
      }
      if (request.method === 'POST') {
        let epicBody: CreateEpicBody;
        try { epicBody = (await request.json()) as CreateEpicBody; }
        catch { return json({ error: 'Invalid JSON body' }, 400); }
        if (!epicBody.name) return json({ error: 'name is required' }, 400);
        return json(await storage.createEpic(workspaceId, epicBody), 201);
      }
    }

    // ── Agent Actions ─────────────────────────────────────────────────────────
    // POST /ws/:workspaceId/actions/:tool  (called by action-orchestrator.ts)
    const actionsMatch = url.pathname.match(/^\/ws\/([^/]+)\/actions\/([^/]+)$/);
    if (actionsMatch && request.method === 'POST') {
      const [, workspaceId, tool] = actionsMatch as [string, string, string];
      const workspace = await storage.readWorkspace(workspaceId);
      if (!workspace) return json({ error: 'Workspace not found' }, 404);
      if (!(await canAccessWorkspace(storage, workspace, auth))) return json({ error: 'Forbidden' }, 403);

      let body: Record<string, string>;
      try { body = (await request.json()) as Record<string, string>; }
      catch { return json({ error: 'Invalid JSON body' }, 400); }

      if (tool === 'create_epic') {
        const parsed = parseCreateEpicArgs(body);
        if (!parsed.ok) return json({ error: parsed.error }, parsed.status);
        return json(await storage.createEpic(workspaceId, parsed.value), 201);
      }

      if (tool === 'create_story') {
        const parsed = parseCreateStoryArgs(body);
        if (!parsed.ok) return json({ error: parsed.error }, parsed.status);
        return json(await storage.createStory(workspaceId, parsed.value), 201);
      }

      if (tool === 'create_task') {
        const parsed = parseCreateTaskArgs(body);
        if (!parsed.ok) return json({ error: parsed.error }, parsed.status);
        const story = await storage.readStory(parsed.value.storyId);
        if (!story || story.workspaceId !== workspaceId) return json({ error: 'Story not found' }, 404);
        const { storyId, ...taskBody } = parsed.value;
        return json(await storage.createTask(storyId, taskBody), 201);
      }

      return json({ error: `Unknown action tool: ${tool}` }, 400);
    }

    // ── PM Import ────────────────────────────────────────────────────────────
    const pmImportMatch = url.pathname.match(/^\/ws\/([^/]+)\/pm\/import$/);
    if (pmImportMatch && request.method === 'POST') {
      const workspaceId = pmImportMatch[1]!;
      const workspace = await storage.readWorkspace(workspaceId);
      if (!workspace) return json({ error: 'Workspace not found' }, 404);
      if (!(await canAccessWorkspace(storage, workspace, auth))) return json({ error: 'Forbidden' }, 403);

      if (!workspace.projectKey) {
        return json({ error: true, code: 'pm_config_invalid', message: 'No project key configured for this workspace' }, 400);
      }

      let body: { provider?: string } = {};
      try { body = (await request.json()) as { provider?: string }; } catch { /* no body is fine */ }

      const bindings = await storage.readWorkspaceProviderBindings(workspaceId);
      const defaultBindings = bindings.filter((b) => b.isDefault);
      const targetProvider = body.provider;
      const binding = targetProvider
        ? defaultBindings.find((b) => b.provider === targetProvider)
        : defaultBindings[0];

      if (!binding) {
        return json({ error: true, code: 'pm_config_invalid', message: 'No PM tool credential bound to this workspace' }, 400);
      }

      const credential = await storage.readProviderCredential(binding.credentialId);
      if (!credential || credential.revokedAt) {
        return json({ error: true, code: 'pm_config_invalid', message: 'PM credential is revoked or missing' }, 400);
      }

      const provider = credential.provider;
      if (!isSupportedImportProvider(provider)) {
        return json({ error: true, code: 'pm_provider_not_supported', message: `Provider "${provider}" is not yet supported for import` }, 501);
      }

      let apiToken: string;
      try {
        apiToken = await decryptProviderSecret(env, credential);
      } catch {
        return json({ error: true, code: 'pm_config_invalid', message: 'Failed to decrypt PM credential' }, 400);
      }

      const metadata = JSON.parse(credential.metadata) as Record<string, unknown>;
      const importContext = { workspaceId, projectKey: workspace.projectKey, apiToken, metadata };

      let result;
      try {
        switch (provider) {
          case 'jira': result = await runJiraImport(importContext, storage, env); break;
        }
      } catch (err) {
        await storage.writePmSyncLog({
          id: crypto.randomUUID(),
          workspaceId,
          entityType: 'epic',
          entityId: workspaceId,
          provider: provider as 'jira',
          direction: 'import',
          status: 'error',
          conflictData: { message: err instanceof Error ? err.message : String(err) },
          syncedAt: Date.now(),
        });
        return json({ error: true, code: 'pm_import_failed', message: err instanceof Error ? err.message : 'Import failed' }, 502);
      }

      await storage.writePmSyncLog({
        id: crypto.randomUUID(),
        workspaceId,
        entityType: 'epic',
        entityId: workspaceId,
        provider: provider as 'jira',
        direction: 'import',
        status: 'success',
        syncedAt: Date.now(),
      });

      return json({ ok: true, provider, imported: result });
    }

    // ── PM Sync: POST /ws/:id/pm/sync ────────────────────────────────────────
    const pmSyncMatch = url.pathname.match(/^\/ws\/([^/]+)\/pm\/sync$/);
    if (pmSyncMatch && request.method === 'POST') {
      const workspaceId = pmSyncMatch[1]!;
      const workspace = await storage.readWorkspace(workspaceId);
      if (!workspace) return json({ error: 'Workspace not found' }, 404);
      if (!(await canAccessWorkspace(storage, workspace, auth))) return json({ error: 'Forbidden' }, 403);

      const bindings = await storage.readWorkspaceProviderBindings(workspaceId);
      const defaultBinding = bindings.find((b) => b.isDefault);
      if (!defaultBinding) {
        return json({ error: true, code: 'pm_config_invalid', message: 'No PM tool configured for this workspace' }, 400);
      }

      const credential = await storage.readProviderCredential(defaultBinding.credentialId);
      if (!credential || credential.revokedAt) {
        return json({ error: true, code: 'pm_config_invalid', message: 'PM credential is revoked or missing' }, 400);
      }

      const apiToken = await decryptProviderSecret(env, credential);
      const metadata = JSON.parse(credential.metadata) as { baseUrl: string; email: string };
      const authHeader = `Basic ${btoa(`${metadata.email}:${apiToken}`)}`;

      const linkedStories = await storage.listLinkedStories(workspaceId);
      const syncResult: SyncResult = { synced: 0, conflicts: 0, errors: 0 };
      const existingConflicts = await storage.listUnresolvedConflicts(workspaceId);

      for (const story of linkedStories) {
        try {
          const jiraState = await fetchJiraStoryState(story, metadata.baseUrl, authHeader);
          const lastSynced = story.lastSyncedAt ?? 0;
          const jiraChanged = jiraState.jiraUpdatedMs > lastSynced;
          const nakirosChanged = story.updatedAt > lastSynced;

          if (!jiraChanged && !nakirosChanged) continue;

          if (jiraChanged && nakirosChanged) {
            const diff = detectConflict(story, jiraState);
            if (diff) {
              const alreadyConflicted = existingConflicts.some((c) => c.entityId === story.id);
              if (!alreadyConflicted) {
                await storage.writePmSyncLog({
                  id: crypto.randomUUID(),
                  workspaceId,
                  entityType: 'story',
                  entityId: story.id,
                  provider: defaultBinding.provider as 'jira' | 'linear' | 'github' | 'gitlab',
                  direction: 'import',
                  status: 'conflict',
                  conflictData: diff,
                  syncedAt: Date.now(),
                });
              }
              syncResult.conflicts++;
            } else {
              await storage.updateLastSyncedAt(story.id, Date.now());
            }
            continue;
          }

          if (jiraChanged && !nakirosChanged) {
            await storage.updateStoryFromJira(story.id, {
              title: jiraState.title,
              description: jiraState.description,
              status: jiraState.status,
              priority: jiraState.priority,
              lastSyncedAt: Date.now(),
            });
            await storage.writePmSyncLog({
              id: crypto.randomUUID(),
              workspaceId,
              entityType: 'story',
              entityId: story.id,
              provider: defaultBinding.provider as 'jira' | 'linear' | 'github' | 'gitlab',
              direction: 'import',
              status: 'success',
              syncedAt: Date.now(),
            });
            syncResult.synced++;
            continue;
          }

          if (!jiraChanged && nakirosChanged) {
            if (!workspace.projectKey) { syncResult.errors++; continue; }
            const payload = buildJiraIssuePayload(story, workspace.projectKey);
            await updateJiraIssue(metadata.baseUrl, authHeader, story.externalId!, payload);
            await storage.updateLastSyncedAt(story.id, Date.now());
            await storage.writePmSyncLog({
              id: crypto.randomUUID(),
              workspaceId,
              entityType: 'story',
              entityId: story.id,
              provider: defaultBinding.provider as 'jira' | 'linear' | 'github' | 'gitlab',
              direction: 'push',
              status: 'success',
              syncedAt: Date.now(),
            });
            syncResult.synced++;
          }
        } catch {
          syncResult.errors++;
        }
      }

      return json({ ok: true, ...syncResult });
    }

    // ── Sync Conflicts: GET /ws/:id/sync/conflicts ────────────────────────────
    const syncConflictsMatch = url.pathname.match(/^\/ws\/([^/]+)\/sync\/conflicts$/);
    if (syncConflictsMatch && request.method === 'GET') {
      const workspaceId = syncConflictsMatch[1]!;
      const workspace = await storage.readWorkspace(workspaceId);
      if (!workspace) return json({ error: 'Workspace not found' }, 404);
      if (!(await canAccessWorkspace(storage, workspace, auth))) return json({ error: 'Forbidden' }, 403);

      const rows = await storage.listUnresolvedConflicts(workspaceId);
      const conflicts = rows.map((row) => ({
        conflictId: row.id,
        storyId: row.entityId,
        provider: row.provider,
        conflictData: row.conflictData ?? null,
        syncedAt: row.syncedAt,
      }));

      return json({ conflicts });
    }

    // ── Sync Resolve: POST /ws/:id/sync/resolve ───────────────────────────────
    const syncResolveMatch = url.pathname.match(/^\/ws\/([^/]+)\/sync\/resolve$/);
    if (syncResolveMatch && request.method === 'POST') {
      const workspaceId = syncResolveMatch[1]!;
      const workspace = await storage.readWorkspace(workspaceId);
      if (!workspace) return json({ error: 'Workspace not found' }, 404);
      if (!(await canAccessWorkspace(storage, workspace, auth))) return json({ error: 'Forbidden' }, 403);

      let body: { conflictId?: string; resolution?: 'nakiros' | 'jira' };
      try {
        body = (await request.json()) as { conflictId?: string; resolution?: 'nakiros' | 'jira' };
      } catch {
        return json({ error: true, code: 'invalid_request', message: 'Invalid JSON body' }, 400);
      }
      if (!body.conflictId || !body.resolution) {
        return json({ error: true, code: 'invalid_request', message: 'conflictId and resolution are required' }, 400);
      }

      const conflictRow = await storage.readPmSyncLog(body.conflictId);
      if (!conflictRow || conflictRow.workspaceId !== workspaceId) {
        return json({ error: true, code: 'conflict_not_found', message: 'Conflict not found' }, 404);
      }
      if (conflictRow.status === 'resolved') {
        return json({ error: true, code: 'conflict_already_resolved', message: 'This conflict has already been resolved' }, 409);
      }

      const bindings = await storage.readWorkspaceProviderBindings(workspaceId);
      const defaultBinding = bindings.find((b) => b.isDefault);
      if (!defaultBinding) {
        return json({ error: true, code: 'pm_config_invalid', message: 'No PM tool configured' }, 400);
      }

      const credential = await storage.readProviderCredential(defaultBinding.credentialId);
      if (!credential || credential.revokedAt) {
        return json({ error: true, code: 'pm_config_invalid', message: 'PM credential revoked or missing' }, 400);
      }

      const story = await storage.readStory(conflictRow.entityId);
      if (!story || story.workspaceId !== workspaceId) {
        return json({ error: true, code: 'story_not_found', message: 'Story not found' }, 404);
      }

      const apiToken = await decryptProviderSecret(env, credential);
      const metadata = JSON.parse(credential.metadata) as { baseUrl: string; email: string };
      const authHeader = `Basic ${btoa(`${metadata.email}:${apiToken}`)}`;

      if (body.resolution === 'nakiros') {
        if (!workspace.projectKey) {
          return json({ error: true, code: 'pm_config_invalid', message: 'No project key configured' }, 400);
        }
        const payload = buildJiraIssuePayload(story, workspace.projectKey);
        await updateJiraIssue(metadata.baseUrl, authHeader, story.externalId!, payload);
        await storage.updateLastSyncedAt(story.id, Date.now());
      } else {
        const jiraState = await fetchJiraStoryState(story, metadata.baseUrl, authHeader);
        await storage.updateStoryFromJira(story.id, {
          title: jiraState.title,
          description: jiraState.description,
          status: jiraState.status,
          priority: jiraState.priority,
          lastSyncedAt: Date.now(),
        });
      }

      await storage.markConflictResolved(body.conflictId, body.resolution);
      return json({ ok: true, resolution: body.resolution });
    }

    // ── Artifact Versions ──────────────────────────────────────────────────

    const wsArtifactsMatch = url.pathname.match(/^\/ws\/([^/]+)\/artifacts$/);
    if (wsArtifactsMatch && request.method === 'GET') {
      const [, wsId] = wsArtifactsMatch as [string, string];
      const workspace = await storage.readWorkspace(wsId);
      if (!workspace) return json({ error: 'Workspace not found' }, 404);
      if (!(await canAccessWorkspace(storage, workspace, auth))) return json({ error: 'Forbidden' }, 403);
      const versions = await storage.getLatestArtifactVersions(wsId);
      // Strip content from listing — callers fetch individual versions when needed
      return json(versions.map(({ content: _c, ...meta }) => meta));
    }

    const wsArtifactVersionsMatch = url.pathname.match(/^\/ws\/([^/]+)\/artifacts\/(.+)\/versions$/);
    if (wsArtifactVersionsMatch && request.method === 'GET') {
      const [, wsId, encodedPath] = wsArtifactVersionsMatch as [string, string, string];
      const artifactPath = decodeURIComponent(encodedPath);
      const workspace = await storage.readWorkspace(wsId);
      if (!workspace) return json({ error: 'Workspace not found' }, 404);
      if (!(await canAccessWorkspace(storage, workspace, auth))) return json({ error: 'Forbidden' }, 403);
      const versions = await storage.listArtifactVersions(wsId, artifactPath);
      return json(versions.map(({ content: _c, ...meta }) => meta));
    }

    if (wsArtifactVersionsMatch && request.method === 'POST') {
      const [, wsId, encodedPath] = wsArtifactVersionsMatch as [string, string, string];
      const artifactPath = decodeURIComponent(encodedPath);
      const workspace = await storage.readWorkspace(wsId);
      if (!workspace) return json({ error: 'Workspace not found' }, 404);
      if (!(await canAccessWorkspace(storage, workspace, auth))) return json({ error: 'Forbidden' }, 403);
      let body: SaveArtifactVersionBody;
      try { body = (await request.json()) as SaveArtifactVersionBody; } catch { return json({ error: 'Invalid JSON' }, 400); }
      if (!body.content || !body.artifactType) return json({ error: 'content and artifactType required' }, 400);
      const existing = await storage.listArtifactVersions(wsId, artifactPath);
      const nextVersion = existing.length > 0 ? Math.max(...existing.map((v) => v.version)) + 1 : 1;
      const r2Key = `workspaces/${wsId}/artifacts/${artifactPath}/v${nextVersion}.md`;
      await env.CONTEXT_BUCKET.put(r2Key, body.content, { httpMetadata: { contentType: 'text/markdown; charset=utf-8' } });
      const row: ArtifactVersionRow = {
        id: crypto.randomUUID(),
        workspaceId: wsId,
        artifactPath,
        artifactType: body.artifactType,
        epicId: body.epicId ?? null,
        content: null,
        r2Key,
        author: body.author ?? auth.email ?? null,
        version: nextVersion,
        createdAt: Date.now(),
      };
      await storage.saveArtifactVersion(row);
      return json({ ...row, content: body.content }, 201);
    }

    const wsArtifactVersionMatch = url.pathname.match(/^\/ws\/([^/]+)\/artifacts\/(.+)\/versions\/(\d+)$/);
    if (wsArtifactVersionMatch && request.method === 'GET') {
      const [, wsId, encodedPath, versionStr] = wsArtifactVersionMatch as [string, string, string, string];
      const artifactPath = decodeURIComponent(encodedPath);
      const workspace = await storage.readWorkspace(wsId);
      if (!workspace) return json({ error: 'Workspace not found' }, 404);
      if (!(await canAccessWorkspace(storage, workspace, auth))) return json({ error: 'Forbidden' }, 403);
      const row = await storage.getArtifactVersion(wsId, artifactPath, parseInt(versionStr, 10));
      if (!row) return json({ error: 'Version not found' }, 404);
      // Resolve content: R2 first, fallback to inline content for legacy rows
      let content: string | null = row.content;
      if (row.r2Key) {
        const obj = await env.CONTEXT_BUCKET.get(row.r2Key);
        content = obj ? await obj.text() : null;
      }
      return json({ ...row, content });
    }

    return json({ error: 'Not found' }, 404);
  },
} satisfies ExportedHandler<Env>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

function corsPreflightResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}

/** Returns true if the user or their org owns the workspace. */
export function canAccess(workspace: StoredWorkspace, auth: AuthContext): boolean {
  if (!workspace.ownerId) return true; // migration: no owner yet
  return workspace.ownerId === auth.orgId || workspace.ownerId === auth.userId;
}

export function deriveWorkspaceOwnerId(existingOwnerId: string | undefined, auth: AuthContext): string {
  return existingOwnerId ?? auth.userId;
}

async function canAccessWorkspace(
  storage: D1Storage,
  workspace: StoredWorkspace,
  auth: AuthContext,
): Promise<boolean> {
  if (!workspace.ownerId) return true;
  if (workspace.ownerId === auth.userId) return true;
  return storage.isOrgMember(workspace.ownerId, auth.userId);
}

interface ResolvedWorkspaceOwner {
  ownerId: string;
  shouldSeedOwnerMembership: boolean;
  errorResponse?: Response;
}

export async function resolveWorkspaceOwnerId(
  storage: Pick<D1Storage, 'isOrgMember'>,
  existingOwnerId: string | undefined,
  requestedOwnerId: string | undefined,
  auth: AuthContext,
): Promise<ResolvedWorkspaceOwner> {
  if (!existingOwnerId) {
    if (!requestedOwnerId || requestedOwnerId === auth.userId) {
      return { ownerId: auth.userId, shouldSeedOwnerMembership: false };
    }

    if (!(await storage.isOrgMember(requestedOwnerId, auth.userId))) {
      return {
        ownerId: auth.userId,
        shouldSeedOwnerMembership: false,
        errorResponse: json({ error: 'Forbidden — target organization must include the current user' }, 403),
      };
    }

    return { ownerId: requestedOwnerId, shouldSeedOwnerMembership: true };
  }

  if (!requestedOwnerId || requestedOwnerId === existingOwnerId) {
    return { ownerId: existingOwnerId, shouldSeedOwnerMembership: false };
  }

  if (existingOwnerId !== auth.userId) {
    return {
      ownerId: existingOwnerId,
      shouldSeedOwnerMembership: false,
      errorResponse: json(
        { error: 'Workspace ownership can only be transferred from a personal workspace to one of your organizations' },
        400,
      ),
    };
  }

  if (requestedOwnerId === auth.userId) {
    return { ownerId: auth.userId, shouldSeedOwnerMembership: false };
  }

  if (!(await storage.isOrgMember(requestedOwnerId, auth.userId))) {
    return {
      ownerId: existingOwnerId,
      shouldSeedOwnerMembership: false,
      errorResponse: json({ error: 'Forbidden — target organization must include the current user' }, 403),
    };
  }

  return { ownerId: requestedOwnerId, shouldSeedOwnerMembership: true };
}

async function seedWorkspaceOwnerMembership(
  storage: Pick<D1Storage, 'readWorkspaceMember' | 'upsertWorkspaceMember'>,
  workspaceId: string,
  userId: string,
): Promise<void> {
  const now = new Date().toISOString();
  const existing = await storage.readWorkspaceMember(workspaceId, userId);
  await storage.upsertWorkspaceMember({
    workspaceId,
    userId,
    role: 'owner',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });
}

function isOwnedByCurrentScope(workspace: StoredWorkspace, auth: AuthContext): boolean {
  if (workspace.ownerId) return workspace.ownerId === auth.userId;
  return canAccess(workspace, auth);
}

function deriveCredentialOwnerId(auth: AuthContext): string {
  return auth.orgId ?? auth.userId;
}

function deriveWorkspaceScopeOwnerId(workspace: StoredWorkspace, auth: AuthContext): string {
  return workspace.ownerId ?? deriveCredentialOwnerId(auth);
}

interface WorkspaceMembershipContextResult {
  errorResponse?: Response;
  scope: 'organization' | 'personal';
  orgMembers: Awaited<ReturnType<D1Storage['readOrgMembers']>>;
  workspaceMembers: Awaited<ReturnType<D1Storage['readWorkspaceMembers']>>;
  currentUserRole: WorkspaceRole | null;
  canManage: boolean;
}

async function resolveWorkspaceMembershipContext(
  storage: D1Storage,
  workspaceId: string,
  auth: AuthContext,
  options: { backfillManager: boolean },
): Promise<WorkspaceMembershipContextResult> {
  const workspace = await storage.readWorkspace(workspaceId);
  if (!workspace) {
    return {
      errorResponse: json({ error: 'Workspace not found' }, 404),
      scope: 'personal',
      orgMembers: [],
      workspaceMembers: [],
      currentUserRole: null,
      canManage: false,
    };
  }

  if (!(await canAccessWorkspace(storage, workspace, auth))) {
    return {
      errorResponse: json({ error: 'Forbidden' }, 403),
      scope: 'personal',
      orgMembers: [],
      workspaceMembers: [],
      currentUserRole: null,
      canManage: false,
    };
  }

  const orgId = workspace.ownerId && workspace.ownerId !== auth.userId && await storage.isOrgMember(workspace.ownerId, auth.userId)
    ? workspace.ownerId
    : null;
  if (!orgId) {
    return {
      scope: 'personal',
      orgMembers: [],
      workspaceMembers: [],
      currentUserRole: null,
      canManage: false,
    };
  }

  const orgMembers = await storage.readOrgMembers(orgId);
  const currentOrgMember = orgMembers.find((member) => member.userId === auth.userId) ?? null;
  if (!currentOrgMember) {
    return {
      errorResponse: json({ error: 'Forbidden' }, 403),
      scope: 'organization',
      orgMembers: [],
      workspaceMembers: [],
      currentUserRole: null,
      canManage: false,
    };
  }

  let workspaceMembers = (await storage.readWorkspaceMembers(workspaceId))
    .filter((member) => isWorkspaceRole(member.role) && orgMembers.some((orgMember) => orgMember.userId === member.userId));
  const isOrgAdmin = currentOrgMember.role === 'admin';

  if (!hasManageableWorkspaceMember(workspaceMembers) && isOrgAdmin && options.backfillManager) {
    const now = new Date().toISOString();
    const existingManagerCandidate = workspaceMembers.find((member) => member.userId === auth.userId) ?? null;
    await storage.upsertWorkspaceMember({
      workspaceId,
      userId: auth.userId,
      role: 'owner',
      createdAt: existingManagerCandidate?.createdAt ?? now,
      updatedAt: now,
    });
    workspaceMembers = (await storage.readWorkspaceMembers(workspaceId))
      .filter((member) => isWorkspaceRole(member.role) && orgMembers.some((orgMember) => orgMember.userId === member.userId));
  }

  const currentUserMembership = workspaceMembers.find((member) => member.userId === auth.userId) ?? null;
  const currentUserRole = currentUserMembership && isWorkspaceRole(currentUserMembership.role)
    ? currentUserMembership.role
    : null;
  const hasManageableMemberships = hasManageableWorkspaceMember(workspaceMembers);

  return {
    scope: 'organization',
    orgMembers,
    workspaceMembers,
    currentUserRole,
    canManage: canManageWorkspaceMemberships({
      currentUserRole,
      isOrgAdmin,
      hasManageableMemberships,
    }),
  };
}

async function buildProviderCredentialSummary(
  storage: D1Storage,
  credentialId: string,
): Promise<ProviderCredentialSummary | null> {
  const credential = await storage.readProviderCredential(credentialId);
  if (!credential) return null;
  const bindings = await storage.readCredentialBindings(credentialId);
  const workspaces = await storage.readWorkspaces();
  const usage: ProviderCredentialUsage[] = bindings
    .map((binding) => {
      const workspace = workspaces.find((item) => item.id === binding.workspaceId);
      if (!workspace) return null;
      return {
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        isDefault: binding.isDefault,
      };
    })
    .filter((item): item is ProviderCredentialUsage => item !== null);
  return toProviderCredentialSummary(credential, usage);
}

async function buildProviderCredentialSummaries(
  storage: D1Storage,
  ownerId: string,
): Promise<ProviderCredentialSummary[]> {
  const credentials = await storage.readProviderCredentials(ownerId);
  const workspaces = await storage.readWorkspaces();
  const summaries = await Promise.all(credentials.map(async (credential) => {
    const bindings = await storage.readCredentialBindings(credential.id);
    const usage: ProviderCredentialUsage[] = bindings
      .map((binding) => {
        const workspace = workspaces.find((item) => item.id === binding.workspaceId);
        if (!workspace) return null;
        return {
          workspaceId: workspace.id,
          workspaceName: workspace.name,
          isDefault: binding.isDefault,
        };
      })
      .filter((item): item is ProviderCredentialUsage => item !== null);
    return toProviderCredentialSummary(credential, usage);
  }));
  return summaries.sort((left, right) => left.label.localeCompare(right.label));
}

async function buildWorkspaceProviderCredentialsPayload(
  storage: D1Storage,
  workspace: StoredWorkspace,
  ownerId: string,
): Promise<WorkspaceProviderCredentialsPayload> {
  const availableCredentials = await buildProviderCredentialSummaries(storage, ownerId);
  const bindings = await storage.readWorkspaceProviderBindings(workspace.id);
  const boundCredentials = bindings
    .map((binding) => {
      const credential = availableCredentials.find((candidate) => candidate.id === binding.credentialId);
      if (!credential) return null;
      return toWorkspaceBinding(binding, credential);
    })
    .filter((binding): binding is WorkspaceProviderCredentialsPayload['bindings'][number] => binding !== null)
    .sort((left, right) => left.credential.label.localeCompare(right.credential.label));

  return {
    workspaceId: workspace.id,
    bindings: boundCredentials,
    availableCredentials,
  };
}

async function buildProviderCredentialDeleteImpact(
  storage: D1Storage,
  credentialId: string,
): Promise<ProviderCredentialDeleteImpact> {
  const credential = await buildProviderCredentialSummary(storage, credentialId);
  if (!credential) {
    throw new Error('Credential not found');
  }
  return {
    credential,
    canDelete: credential.usage.length === 0,
    impactedWorkspaces: credential.usage,
  };
}
