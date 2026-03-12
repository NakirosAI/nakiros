import { D1Storage } from './storage.js';
import { handleMcpRequest } from './mcp.js';
import { verifyAuth, type AuthContext } from './auth.js';
import { sendInvitationEmail } from './email.js';
import type { StoredWorkspace } from './types.js';

const PERSONAL_WORKSPACE_LIMIT = 3;

// ─── Env bindings (declared in wrangler.toml) ────────────────────────────────

interface Env {
  DB: D1Database;
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
      const mine = all.filter((w) => canAccess(w, auth));
      return json(mine);
    }

    // ── MCP by workspace ID ────────────────────────────────────────────────
    const mcpMatch = url.pathname.match(/^\/ws\/([^/]+)\/mcp$/);
    if (mcpMatch) {
      const workspaceId = mcpMatch[1]!;
      const workspace = await storage.readWorkspace(workspaceId);
      if (!workspace) return json({ error: `Workspace '${workspaceId}' not found` }, 404);
      if (!canAccess(workspace, auth)) return json({ error: 'Forbidden' }, 403);
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
      if (existing && !canAccess(existing, auth)) {
        return json({ error: 'Forbidden' }, 403);
      }
      if (!existing && !auth.orgId) {
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
      const ownerId = deriveWorkspaceOwnerId(existing?.ownerId, auth);
      await storage.writeWorkspace({ ...body, id: workspaceId, ownerId });
      return json({ ok: true });
    }

    if (wsMatch && request.method === 'DELETE') {
      const workspaceId = wsMatch[1]!;
      const workspace = await storage.readWorkspace(workspaceId);
      if (workspace && !canAccess(workspace, auth)) return json({ error: 'Forbidden' }, 403);
      await storage.deleteWorkspace(workspaceId);
      return json({ ok: true });
    }

    // ── Context endpoints ──────────────────────────────────────────────────
    const ctxMatch = url.pathname.match(/^\/ws\/([^/]+)\/context$/);
    if (ctxMatch && request.method === 'PUT') {
      const workspaceId = ctxMatch[1]!;
      const workspace = await storage.readWorkspace(workspaceId);
      if (!workspace) return json({ error: 'Workspace not found' }, 404);
      if (!canAccess(workspace, auth)) return json({ error: 'Forbidden' }, 403);
      const patch = (await request.json()) as Partial<{
        global: string; product: string; interRepo: string;
      }>;
      workspace.context = { ...workspace.context, ...patch };
      await storage.writeWorkspace(workspace);
      return json({ ok: true });
    }

    const repoCtxMatch = url.pathname.match(/^\/ws\/([^/]+)\/repos\/([^/]+)\/context$/);
    if (repoCtxMatch && request.method === 'PUT') {
      const [, workspaceId, repoName] = repoCtxMatch as [string, string, string];
      const workspace = await storage.readWorkspace(workspaceId);
      if (!workspace) return json({ error: 'Workspace not found' }, 404);
      if (!canAccess(workspace, auth)) return json({ error: 'Forbidden' }, 403);
      const patch = (await request.json()) as Partial<{
        architecture: string; stack: string; conventions: string; api: string; llms: string;
      }>;
      workspace.context = {
        ...workspace.context,
        repos: {
          ...workspace.context?.repos,
          [repoName]: {
            ...workspace.context?.repos?.[repoName],
            ...patch,
            updatedAt: new Date().toISOString(),
          },
        },
      };
      await storage.writeWorkspace(workspace);
      return json({ ok: true });
    }

    // ── Collab sessions ────────────────────────────────────────────────────
    const collabsMatch = url.pathname.match(/^\/ws\/([^/]+)\/collabs$/);
    if (collabsMatch && request.method === 'GET') {
      const workspace = await storage.readWorkspace(collabsMatch[1]!);
      if (workspace && !canAccess(workspace, auth)) return json({ error: 'Forbidden' }, 403);
      const collabs = await storage.readCollabs(collabsMatch[1]!);
      return json(collabs);
    }

    const collabMatch = url.pathname.match(/^\/ws\/([^/]+)\/collabs\/([^/]+)$/);
    if (collabMatch && request.method === 'GET') {
      const collab = await storage.readCollab(collabMatch[2]!);
      if (!collab) return json({ error: 'Collab not found' }, 404);
      return json(collab);
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
  return existingOwnerId ?? auth.orgId ?? auth.userId;
}

function isOwnedByCurrentScope(workspace: StoredWorkspace, auth: AuthContext): boolean {
  if (workspace.ownerId) return workspace.ownerId === auth.userId;
  return canAccess(workspace, auth);
}
