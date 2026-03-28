import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { getAccessToken } from './credentials.js';
import type { StoredWorkspace } from '@nakiros/shared';

export interface PulledArtifact {
  path: string;
  type: string;
  version: number;
  localPath: string;
}

export interface WorkspaceGetResult {
  workspace: StoredWorkspace;
  slug: string;
  artifacts: PulledArtifact[];
  pulledAt: number;
}

function deriveSlug(workspace: StoredWorkspace): string {
  return workspace.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function artifactLocalPath(slug: string, artifactPath: string): string {
  return join(homedir(), '.nakiros', 'workspaces', slug, 'context', `${artifactPath}.md`);
}

export async function resolveWorkspaceFromCwd(cwd: string, workspaceOverride?: string): Promise<{ workspace: StoredWorkspace; slug: string } | null> {
  const auth = await getAccessToken();
  if (!auth) return null;

  let url: string;
  if (workspaceOverride) {
    // Fetch all workspaces and find by name/slug
    url = `${auth.apiUrl}/ws`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${auth.token}` } });
    if (!response.ok) {
      process.stderr.write(`[nakiros] Failed to list workspaces (${response.status})\n`);
      return null;
    }
    const all = (await response.json()) as StoredWorkspace[];
    const match = all.find((ws) => deriveSlug(ws) === workspaceOverride || ws.name === workspaceOverride);
    if (!match) {
      process.stderr.write(`[nakiros] No workspace found with name/slug: ${workspaceOverride}\n`);
      return null;
    }
    return { workspace: match, slug: deriveSlug(match) };
  }

  // Auto-resolve from cwd
  url = `${auth.apiUrl}/workspaces/resolve?path=${encodeURIComponent(cwd)}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${auth.token}` } });
  if (response.status === 404) {
    process.stderr.write(`[nakiros] No workspace found for path: ${cwd}\n`);
    process.stderr.write('[nakiros] Make sure this repo is added to a Nakiros workspace in the Desktop app.\n');
    return null;
  }
  if (!response.ok) {
    process.stderr.write(`[nakiros] Workspace resolution failed (${response.status})\n`);
    return null;
  }
  const workspace = (await response.json()) as StoredWorkspace;
  return { workspace, slug: deriveSlug(workspace) };
}

export async function pullArtifacts(workspace: StoredWorkspace, slug: string): Promise<PulledArtifact[]> {
  const auth = await getAccessToken();
  if (!auth) return [];

  const headers = { Authorization: `Bearer ${auth.token}` };

  // 1. List artifact metadata
  const listRes = await fetch(`${auth.apiUrl}/ws/${workspace.id}/artifacts`, { headers });
  if (!listRes.ok) return [];

  const metaList = (await listRes.json()) as { artifactPath: string; artifactType: string; version: number; r2Key: string | null }[];
  if (metaList.length === 0) return [];

  const pulled: PulledArtifact[] = [];

  // 2. Fetch content for each artifact
  await Promise.all(metaList.map(async (meta) => {
    const contentRes = await fetch(
      `${auth.apiUrl}/ws/${workspace.id}/artifacts/${encodeURIComponent(meta.artifactPath)}/versions/${meta.version}`,
      { headers },
    );
    if (!contentRes.ok) return;

    const row = (await contentRes.json()) as { content: string | null };
    if (!row.content) return;

    const localPath = artifactLocalPath(slug, meta.artifactPath);
    mkdirSync(dirname(localPath), { recursive: true });
    writeFileSync(localPath, row.content, 'utf-8');

    pulled.push({ path: meta.artifactPath, type: meta.artifactType, version: meta.version, localPath });
  }));

  return pulled.sort((a, b) => a.path.localeCompare(b.path));
}

export async function workspaceGet(opts: { cwd: string; workspaceOverride?: string; artifactsOnly?: boolean }): Promise<WorkspaceGetResult | null> {
  const resolved = await resolveWorkspaceFromCwd(opts.cwd, opts.workspaceOverride);
  if (!resolved) return null;

  const { workspace, slug } = resolved;
  const artifacts = opts.artifactsOnly !== false ? await pullArtifacts(workspace, slug) : [];

  return { workspace, slug, artifacts, pulledAt: Date.now() };
}
