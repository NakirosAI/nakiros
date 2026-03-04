import { app } from 'electron';
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
} from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { StoredWorkspace } from '@nakiros/shared';

function toSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'workspace';
}

function getWorkspacesRoot(): string {
  const dir = join(homedir(), '.nakiros', 'workspaces');
  mkdirSync(dir, { recursive: true });
  return dir;
}

function findExistingDir(id: string, root: string): string | null {
  if (!existsSync(root)) return null;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const jsonPath = join(root, entry.name, 'workspace.json');
    if (!existsSync(jsonPath)) continue;
    try {
      const ws = JSON.parse(readFileSync(jsonPath, 'utf-8')) as StoredWorkspace;
      if (ws.id === id) return join(root, entry.name);
    } catch { /* ignore malformed */ }
  }
  return null;
}

function uniqueSlugDir(name: string, root: string): string {
  const base = toSlug(name);
  let slug = base;
  let i = 2;
  while (existsSync(join(root, slug))) {
    slug = `${base}-${i++}`;
  }
  return join(root, slug);
}

// One-time migration from old userData/workspaces.json → ~/.nakiros/workspaces/{slug}/workspace.json
let migrationDone = false;
function migrateIfNeeded(): void {
  if (migrationDone) return;
  migrationDone = true;
  const oldPath = join(app.getPath('userData'), 'workspaces.json');
  if (!existsSync(oldPath)) return;
  try {
    const old = JSON.parse(readFileSync(oldPath, 'utf-8')) as StoredWorkspace[];
    for (const ws of old) {
      save(ws);
    }
    renameSync(oldPath, `${oldPath}.migrated`);
    console.log(`[Nakiros] Migrated ${old.length} workspace(s) to ~/.nakiros/workspaces/`);
  } catch (err) {
    console.error('[Nakiros] Migration from userData failed:', err);
  }
}

export function getAll(): StoredWorkspace[] {
  migrateIfNeeded();
  const root = getWorkspacesRoot();
  const result: StoredWorkspace[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const jsonPath = join(root, entry.name, 'workspace.json');
    if (!existsSync(jsonPath)) continue;
    try {
      result.push(JSON.parse(readFileSync(jsonPath, 'utf-8')) as StoredWorkspace);
    } catch { /* ignore malformed */ }
  }
  return result;
}

export function save(workspace: StoredWorkspace): void {
  const root = getWorkspacesRoot();
  const existingDir = findExistingDir(workspace.id, root);
  const newSlug = toSlug(workspace.name);
  const newDir = join(root, newSlug);

  let targetDir: string;

  if (existingDir) {
    // Workspace already saved — rename folder if workspace name changed
    if (existingDir !== newDir && !existsSync(newDir)) {
      renameSync(existingDir, newDir);
      targetDir = newDir;
    } else {
      targetDir = existingDir;
    }
  } else {
    // New workspace — find a unique slug dir
    targetDir = uniqueSlugDir(workspace.name, root);
    mkdirSync(targetDir, { recursive: true });
  }

  writeFileSync(join(targetDir, 'workspace.json'), JSON.stringify(workspace, null, 2), 'utf-8');
}

export function remove(id: string): void {
  const root = getWorkspacesRoot();
  const dir = findExistingDir(id, root);
  if (dir) {
    rmSync(dir, { recursive: true, force: true });
  }
}
