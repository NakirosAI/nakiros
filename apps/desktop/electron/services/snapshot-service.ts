import { existsSync, mkdirSync, rmSync } from 'fs';
import { readFile, readdir, writeFile, cp } from 'fs/promises';
import { homedir } from 'os';
import { dirname, join, relative } from 'path';
import type { FileChange, FileChangesReviewSession, SnapshotMeta } from '@nakiros/shared';

// ─── Paths ────────────────────────────────────────────────────────────────────

function getContextDir(workspaceSlug: string): string {
  return join(homedir(), '.nakiros', 'workspaces', workspaceSlug, 'context');
}

function getSnapshotDir(workspaceSlug: string, runId: string): string {
  return join(homedir(), '.nakiros', 'workspaces', workspaceSlug, '.snapshots', runId);
}

function getSnapshotMetaPath(workspaceSlug: string, runId: string): string {
  return join(getSnapshotDir(workspaceSlug, runId), 'meta.json');
}

// ─── File collection ──────────────────────────────────────────────────────────

async function collectMarkdownFiles(dir: string): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (!existsSync(dir)) return result;

  async function walk(current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const abs = join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(abs);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const rel = relative(dir, abs).replace(/\\/g, '/');
        const content = await readFile(abs, 'utf-8').catch(() => '');
        result.set(rel, content);
      }
    }
  }

  await walk(dir);
  return result;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function takeSnapshot(workspaceSlug: string, runId: string): Promise<void> {
  const contextDir = getContextDir(workspaceSlug);
  const snapshotDir = getSnapshotDir(workspaceSlug, runId);

  mkdirSync(snapshotDir, { recursive: true });

  // Copy context dir into snapshot (only .md files via our walker)
  const files = await collectMarkdownFiles(contextDir);
  for (const [rel, content] of files) {
    const dest = join(snapshotDir, 'context', rel);
    mkdirSync(dirname(dest), { recursive: true });
    await writeFile(dest, content, 'utf-8');
  }

  const meta: SnapshotMeta = {
    runId,
    workspaceSlug,
    takenAt: new Date().toISOString(),
    status: 'pending',
  };
  await writeFile(getSnapshotMetaPath(workspaceSlug, runId), JSON.stringify(meta, null, 2), 'utf-8');
}

export async function diffSnapshot(workspaceSlug: string, runId: string): Promise<FileChangesReviewSession | null> {
  const snapshotDir = getSnapshotDir(workspaceSlug, runId);
  if (!existsSync(snapshotDir)) return null;

  const contextDir = getContextDir(workspaceSlug);
  const snapshotContextDir = join(snapshotDir, 'context');

  const [before, after] = await Promise.all([
    collectMarkdownFiles(snapshotContextDir),
    collectMarkdownFiles(contextDir),
  ]);

  const changes: FileChange[] = [];
  const allPaths = new Set([...before.keys(), ...after.keys()]);

  for (const rel of allPaths) {
    const beforeContent = before.get(rel) ?? null;
    const afterContent = after.get(rel) ?? null;

    if (beforeContent === null && afterContent !== null) {
      changes.push({ relativePath: rel, absolutePath: join(contextDir, rel), status: 'created', before: null, after: afterContent });
    } else if (beforeContent !== null && afterContent === null) {
      changes.push({ relativePath: rel, absolutePath: join(contextDir, rel), status: 'deleted', before: beforeContent, after: null });
    } else if (beforeContent !== afterContent) {
      changes.push({ relativePath: rel, absolutePath: join(contextDir, rel), status: 'modified', before: beforeContent, after: afterContent });
    }
  }

  if (changes.length === 0) return null;

  return { runId, workspaceSlug, changes };
}

export async function revertSnapshot(workspaceSlug: string, runId: string, relativePaths?: string[]): Promise<void> {
  const snapshotDir = getSnapshotDir(workspaceSlug, runId);
  if (!existsSync(snapshotDir)) return;

  const contextDir = getContextDir(workspaceSlug);
  const snapshotContextDir = join(snapshotDir, 'context');

  const [before, after] = await Promise.all([
    collectMarkdownFiles(snapshotContextDir),
    collectMarkdownFiles(contextDir),
  ]);

  const pathsToRevert = relativePaths ?? [...new Set([...before.keys(), ...after.keys()])];

  for (const rel of pathsToRevert) {
    const dest = join(contextDir, rel);
    const beforeContent = before.get(rel);

    if (beforeContent === undefined) {
      // File was created by agent — delete it
      rmSync(dest, { force: true });
    } else {
      // File was modified or deleted by agent — restore it
      mkdirSync(dirname(dest), { recursive: true });
      await writeFile(dest, beforeContent, 'utf-8');
    }
  }
}

export async function resolveSnapshot(workspaceSlug: string, runId: string): Promise<void> {
  const metaPath = getSnapshotMetaPath(workspaceSlug, runId);
  if (!existsSync(metaPath)) return;
  const meta = JSON.parse(await readFile(metaPath, 'utf-8')) as SnapshotMeta;
  await writeFile(metaPath, JSON.stringify({ ...meta, status: 'resolved' }, null, 2), 'utf-8');
}

export async function listPendingSnapshots(workspaceSlug: string): Promise<SnapshotMeta[]> {
  const snapshotsRoot = join(homedir(), '.nakiros', 'workspaces', workspaceSlug, '.snapshots');
  if (!existsSync(snapshotsRoot)) return [];

  const entries = await readdir(snapshotsRoot, { withFileTypes: true }).catch(() => []);
  const metas: SnapshotMeta[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const metaPath = join(snapshotsRoot, entry.name, 'meta.json');
    if (!existsSync(metaPath)) continue;
    try {
      const meta = JSON.parse(await readFile(metaPath, 'utf-8')) as SnapshotMeta;
      if (meta.status === 'pending') metas.push(meta);
    } catch {
      // ignore malformed meta
    }
  }

  return metas.sort((a, b) => a.takenAt.localeCompare(b.takenAt));
}
