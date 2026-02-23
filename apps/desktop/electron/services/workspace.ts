import { app } from 'electron';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { StoredWorkspace } from '@tiqora/shared';

function getStoragePath(): string {
  const dir = app.getPath('userData');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return join(dir, 'workspaces.json');
}

function readAll(): StoredWorkspace[] {
  const path = getStoragePath();
  if (!existsSync(path)) return [];
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as StoredWorkspace[];
  } catch {
    return [];
  }
}

function writeAll(workspaces: StoredWorkspace[]): void {
  writeFileSync(getStoragePath(), JSON.stringify(workspaces, null, 2), 'utf-8');
}

export function getAll(): StoredWorkspace[] {
  return readAll();
}

export function save(workspace: StoredWorkspace): void {
  const all = readAll();
  const idx = all.findIndex((w) => w.id === workspace.id);
  if (idx >= 0) {
    all[idx] = workspace;
  } else {
    all.push(workspace);
  }
  writeAll(all);
}

export function remove(id: string): void {
  const all = readAll().filter((w) => w.id !== id);
  writeAll(all);
}
