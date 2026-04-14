import { existsSync, mkdirSync } from 'fs';
import { readFile, readdir, stat, writeFile } from 'fs/promises';
import { homedir } from 'os';
import { dirname, join, relative } from 'path';
import { resolveWorkspaceSlug } from './workspace.js';
import type { StoredWorkspace } from '@nakiros/shared';

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

async function collectMarkdownArtifactPaths(rootDir: string, currentDir: string): Promise<{ path: string; sizeBytes: number }[]> {
  const entries = await readdir(currentDir, { withFileTypes: true }).catch(() => []);
  const collected: { path: string; sizeBytes: number }[] = [];

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

    if (!normalizedPath) continue;

    let sizeBytes = 0;
    try {
      const fileStat = await stat(absolutePath);
      sizeBytes = fileStat.size;
    } catch {
      // ignore
    }

    collected.push({ path: normalizedPath, sizeBytes });
  }

  return collected;
}

export async function listContextArtifactFiles(workspace: StoredWorkspace): Promise<string[]> {
  const contextDir = getArtifactContextDir(workspace);
  if (!existsSync(contextDir)) return [];
  const files = await collectMarkdownArtifactPaths(contextDir, contextDir);
  return files.map((f) => f.path).sort((left, right) => left.localeCompare(right));
}

export async function listContextArtifactFilesWithSizes(workspace: StoredWorkspace): Promise<{ path: string; sizeBytes: number }[]> {
  const contextDir = getArtifactContextDir(workspace);
  if (!existsSync(contextDir)) return [];
  const files = await collectMarkdownArtifactPaths(contextDir, contextDir);
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

export async function getContextArtifactTotalBytes(workspace: StoredWorkspace): Promise<number> {
  const contextDir = getArtifactContextDir(workspace);
  if (!existsSync(contextDir)) return 0;
  const files = await collectMarkdownArtifactPaths(contextDir, contextDir);
  return files.reduce((sum, f) => sum + f.sizeBytes, 0);
}

export async function writeArtifactFile(workspace: StoredWorkspace, artifactPath: string, content: string): Promise<void> {
  const filePath = getArtifactFilePath(workspace, artifactPath);
  mkdirSync(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf-8');
}

