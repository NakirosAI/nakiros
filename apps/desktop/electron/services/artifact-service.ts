import { existsSync, mkdirSync } from 'fs';
import { readFile, readdir, writeFile } from 'fs/promises';
import { homedir } from 'os';
import { dirname, join, relative } from 'path';
import type { ProductArtifactVersion, SaveProductArtifactInput } from '@nakiros/shared';
import { ensureValidAccessToken } from './auth.js';
import { resolveWorkspaceSlug } from './workspace.js';
import { markArtifactSynced } from '@nakiros/orchestrator';
import type { StoredWorkspace } from '@nakiros/shared';

const WORKER_API = process.env['NAKIROS_API_URL'] ?? 'https://api.nakiros.com';

export function getArtifactContextDir(workspace: StoredWorkspace): string {
  const slug = resolveWorkspaceSlug(workspace.id, workspace.name);
  return join(homedir(), '.nakiros', 'workspaces', slug, 'context');
}

export function getArtifactFilePath(workspace: StoredWorkspace, artifactPath: string): string {
  return join(getArtifactContextDir(workspace), `${artifactPath}.md`);
}

export async function readArtifactFile(workspace: StoredWorkspace, artifactPath: string): Promise<string | null> {
  const filePath = getArtifactFilePath(workspace, artifactPath);
  if (!existsSync(filePath)) return null;
  return readFile(filePath, 'utf-8');
}

async function collectMarkdownArtifactPaths(rootDir: string, currentDir: string): Promise<string[]> {
  const entries = await readdir(currentDir, { withFileTypes: true }).catch(() => []);
  const collected: string[] = [];

  for (const entry of entries) {
    const absolutePath = join(currentDir, entry.name);

    if (entry.isDirectory()) {
      collected.push(...await collectMarkdownArtifactPaths(rootDir, absolutePath));
      continue;
    }

    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;

    const normalizedPath = relative(rootDir, absolutePath)
      .replace(/\\/g, '/')
      .replace(/\.md$/i, '');

    if (normalizedPath) collected.push(normalizedPath);
  }

  return collected;
}

export async function listContextArtifactFiles(workspace: StoredWorkspace): Promise<string[]> {
  const contextDir = getArtifactContextDir(workspace);
  if (!existsSync(contextDir)) return [];
  const files = await collectMarkdownArtifactPaths(contextDir, contextDir);
  return files.sort((left, right) => left.localeCompare(right));
}

export async function writeArtifactFile(workspace: StoredWorkspace, artifactPath: string, content: string): Promise<void> {
  const filePath = getArtifactFilePath(workspace, artifactPath);
  mkdirSync(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf-8');
}

export async function listArtifactVersions(workspaceId: string, artifactPath: string): Promise<ProductArtifactVersion[]> {
  const resolved = await ensureValidAccessToken();
  if (!resolved.token) return [];
  const response = await fetch(
    `${WORKER_API}/ws/${workspaceId}/artifacts/${encodeURIComponent(artifactPath)}/versions`,
    { headers: { Authorization: `Bearer ${resolved.token}` } },
  );
  if (!response.ok) return [];
  return (await response.json().catch(() => [])) as ProductArtifactVersion[];
}

export async function saveArtifactVersion(
  workspaceId: string,
  workspace: StoredWorkspace,
  input: SaveProductArtifactInput,
): Promise<ProductArtifactVersion | null> {
  // 1. Write file to disk
  await writeArtifactFile(workspace, input.artifactPath, input.content);

  // 2. Push snapshot to DB
  const resolved = await ensureValidAccessToken();
  if (!resolved.token) return null;
  const response = await fetch(
    `${WORKER_API}/ws/${workspaceId}/artifacts/${encodeURIComponent(input.artifactPath)}/versions`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${resolved.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        artifactPath: input.artifactPath,
        artifactType: input.artifactType,
        epicId: input.epicId ?? null,
        content: input.content,
        author: resolved.email ?? null,
      }),
    },
  );
  if (!response.ok) return null;
  return (await response.json()) as ProductArtifactVersion;
}

export async function listAllArtifacts(workspaceId: string): Promise<ProductArtifactVersion[]> {
  const resolved = await ensureValidAccessToken();
  if (!resolved.token) return [];
  const response = await fetch(`${WORKER_API}/ws/${workspaceId}/artifacts`, {
    headers: { Authorization: `Bearer ${resolved.token}` },
  });
  if (!response.ok) return [];
  return (await response.json().catch(() => [])) as ProductArtifactVersion[];
}

export async function pullAllArtifacts(workspaceId: string, workspace: StoredWorkspace): Promise<{ pulled: number; failed: number }> {
  const resolved = await ensureValidAccessToken();
  if (!resolved.token) return { pulled: 0, failed: 0 };

  const slug = resolveWorkspaceSlug(workspace.id, workspace.name);
  const headers = { Authorization: `Bearer ${resolved.token}` };

  // 1. Fetch metadata list (no content)
  const listRes = await fetch(`${WORKER_API}/ws/${workspaceId}/artifacts`, { headers });
  if (!listRes.ok) return { pulled: 0, failed: 0 };

  const metaList = (await listRes.json().catch(() => [])) as { artifactPath: string; artifactType: string; version: number }[];
  if (metaList.length === 0) return { pulled: 0, failed: 0 };

  let pulled = 0;
  let failed = 0;

  // 2. Download content for each artifact in parallel (max 5 concurrent)
  const chunks = [];
  for (let i = 0; i < metaList.length; i += 5) chunks.push(metaList.slice(i, i + 5));

  for (const chunk of chunks) {
    await Promise.all(chunk.map(async (meta) => {
      try {
        const contentRes = await fetch(
          `${WORKER_API}/ws/${workspaceId}/artifacts/${encodeURIComponent(meta.artifactPath)}/versions/${meta.version}`,
          { headers },
        );
        if (!contentRes.ok) { failed++; return; }
        const row = (await contentRes.json()) as { content: string | null };
        if (!row.content) { failed++; return; }
        await writeArtifactFile(workspace, meta.artifactPath, row.content);
        // Mark as synced so the file watcher doesn't push it back immediately
        markArtifactSynced(slug, meta.artifactPath, row.content, meta.version);
        pulled++;
      } catch {
        failed++;
      }
    }));
  }

  return { pulled, failed };
}
