import { existsSync } from 'fs';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import type { RepoContext, StoredWorkspace, WorkspaceContext } from '@nakiros/shared';
import { ensureValidAccessToken } from './auth.js';
import { resolveWorkspaceSlug } from './workspace.js';

const WORKER_API = process.env['NAKIROS_API_URL'] ?? 'https://api.nakiros.com';

export interface ContextConflict {
  type: 'global' | 'repo';
  repoName?: string;
  updatedBy?: string;
  remoteUpdatedAt?: string;
}

export interface ContextPushResult {
  status: 'ok' | 'conflict' | 'offline' | 'unauthenticated';
  conflict?: ContextConflict;
}

export interface ContextPullResult {
  status: 'ok' | 'offline' | 'unauthenticated';
  reposPulled: string[];
}

function globalContextDir(workspace: StoredWorkspace): string {
  const slug = resolveWorkspaceSlug(workspace.id, workspace.name);
  return join(homedir(), '.nakiros', 'workspaces', slug, 'context');
}

async function readFileOrNull(filePath: string): Promise<string | null> {
  try {
    if (!existsSync(filePath)) return null;
    return await readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

async function buildGlobalContext(workspace: StoredWorkspace): Promise<WorkspaceContext> {
  const contextDir = globalContextDir(workspace);
  const [global, productA, productB, interRepo] = await Promise.all([
    readFileOrNull(join(contextDir, 'global-context.md')),
    readFileOrNull(join(contextDir, 'product-context.md')),
    readFileOrNull(join(contextDir, 'pm-context.md')),
    readFileOrNull(join(contextDir, 'inter-repo.md')),
  ]);
  return {
    global: global ?? undefined,
    product: productA ?? productB ?? undefined,
    interRepo: interRepo ?? undefined,
    generatedAt: new Date().toISOString(),
  };
}

async function buildRepoContext(repoLocalPath: string): Promise<RepoContext | null> {
  const nakDir = join(repoLocalPath, '_nakiros');
  if (!existsSync(nakDir)) return null;

  const [architecture, stack, conventions, api, llms] = await Promise.all([
    readFileOrNull(join(nakDir, 'architecture.md')),
    readFileOrNull(join(nakDir, 'stack.md')),
    readFileOrNull(join(nakDir, 'conventions.md')),
    readFileOrNull(join(nakDir, 'api.md')),
    readFileOrNull(join(nakDir, 'llms.txt')),
  ]);

  if (!architecture && !stack && !conventions && !api && !llms) return null;

  return {
    architecture: architecture ?? undefined,
    stack: stack ?? undefined,
    conventions: conventions ?? undefined,
    api: api ?? undefined,
    llms: llms ?? undefined,
    updatedAt: new Date().toISOString(),
  };
}

export async function pushWorkspaceContext(
  workspace: StoredWorkspace,
  force = false,
): Promise<ContextPushResult> {
  const resolved = await ensureValidAccessToken();
  if (!resolved.token) return { status: 'unauthenticated' };

  try {
    const globalCtx = await buildGlobalContext(workspace);
    const globalResponse = await fetch(`${WORKER_API}/ws/${workspace.id}/context`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${resolved.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...globalCtx, force }),
    });

    if (globalResponse.status === 409) {
      const payload = (await globalResponse.json().catch(() => ({}))) as {
        updatedBy?: string;
        remoteUpdatedAt?: string;
      };
      return {
        status: 'conflict',
        conflict: { type: 'global', updatedBy: payload.updatedBy, remoteUpdatedAt: payload.remoteUpdatedAt },
      };
    }

    if (!globalResponse.ok) {
      console.warn('[context-sync] Push global failed:', globalResponse.status);
      return { status: 'offline' };
    }

    for (const repo of workspace.repos) {
      if (!existsSync(repo.localPath)) continue;
      const repoCtx = await buildRepoContext(repo.localPath);
      if (!repoCtx) continue;

      const repoResponse = await fetch(
        `${WORKER_API}/ws/${workspace.id}/repos/${encodeURIComponent(repo.name)}/context`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${resolved.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ...repoCtx, force }),
        },
      );

      if (repoResponse.status === 409) {
        const payload = (await repoResponse.json().catch(() => ({}))) as {
          updatedBy?: string;
          remoteUpdatedAt?: string;
        };
        return {
          status: 'conflict',
          conflict: { type: 'repo', repoName: repo.name, updatedBy: payload.updatedBy, remoteUpdatedAt: payload.remoteUpdatedAt },
        };
      }

      if (!repoResponse.ok) {
        console.warn(`[context-sync] Push repo context failed for ${repo.name}:`, repoResponse.status);
      }
    }

    return { status: 'ok' };
  } catch (err) {
    console.warn('[context-sync] Network error during push:', err);
    return { status: 'offline' };
  }
}

export async function pullRemoteContext(workspace: StoredWorkspace): Promise<ContextPullResult> {
  const resolved = await ensureValidAccessToken();
  if (!resolved.token) return { status: 'unauthenticated', reposPulled: [] };

  try {
    const contextDir = globalContextDir(workspace);
    await mkdir(contextDir, { recursive: true });

    const globalFiles: Array<{ endpoint: string; outputName: string }> = [
      { endpoint: 'global-context', outputName: 'global-context.md' },
      { endpoint: 'product-context', outputName: 'product-context.md' },
      { endpoint: 'inter-repo', outputName: 'inter-repo.md' },
    ];

    for (const { endpoint, outputName } of globalFiles) {
      const response = await fetch(
        `${WORKER_API}/ws/${workspace.id}/context/_global/${endpoint}`,
        { headers: { Authorization: `Bearer ${resolved.token}` } },
      );
      if (response.ok) {
        const content = await response.text();
        await writeFile(join(contextDir, outputName), content, 'utf-8');
      }
    }

    const reposPulled: string[] = [];
    const manifestResponse = await fetch(`${WORKER_API}/ws/${workspace.id}/context`, {
      headers: { Authorization: `Bearer ${resolved.token}` },
    });

    if (manifestResponse.ok) {
      const manifest = (await manifestResponse.json()) as {
        repos?: Record<string, { updatedAt?: string }>;
      };
      const localRepoNames = new Set(workspace.repos.map((r) => r.name));

      for (const repoName of Object.keys(manifest.repos ?? {})) {
        if (localRepoNames.has(repoName)) continue;

        const repoCtxResponse = await fetch(
          `${WORKER_API}/ws/${workspace.id}/repos/${encodeURIComponent(repoName)}/context`,
          { headers: { Authorization: `Bearer ${resolved.token}` } },
        );
        if (!repoCtxResponse.ok) continue;

        const repoCtx = (await repoCtxResponse.json()) as RepoContext;
        const repoDir = join(contextDir, 'repos', repoName);
        await mkdir(repoDir, { recursive: true });

        const writes: Promise<void>[] = [];
        if (repoCtx.architecture) writes.push(writeFile(join(repoDir, 'architecture.md'), repoCtx.architecture, 'utf-8'));
        if (repoCtx.stack) writes.push(writeFile(join(repoDir, 'stack.md'), repoCtx.stack, 'utf-8'));
        if (repoCtx.conventions) writes.push(writeFile(join(repoDir, 'conventions.md'), repoCtx.conventions, 'utf-8'));
        if (repoCtx.api) writes.push(writeFile(join(repoDir, 'api.md'), repoCtx.api, 'utf-8'));
        if (repoCtx.llms) writes.push(writeFile(join(repoDir, 'llms.txt'), repoCtx.llms, 'utf-8'));
        await Promise.all(writes);
        reposPulled.push(repoName);
      }
    }

    return { status: 'ok', reposPulled };
  } catch (err) {
    console.warn('[context-sync] Network error during pull:', err);
    return { status: 'offline', reposPulled: [] };
  }
}
