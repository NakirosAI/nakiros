import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { parse } from 'yaml';

import type { IStorage } from './storage.js';

interface WorkspaceYaml {
  workspace_name?: string;
  workspace_slug?: string;
}

function toWorkspaceSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'workspace';
}

async function resolveWorkspaceIdFromPointer(pointer: WorkspaceYaml, storage: IStorage): Promise<string | null> {
  const workspaces = await storage.readWorkspaces();

  if (pointer.workspace_slug) {
    const bySlug = workspaces.find((workspace) => toWorkspaceSlug(workspace.name) === pointer.workspace_slug);
    if (bySlug) return bySlug.id;
  }

  if (pointer.workspace_name) {
    const byName = workspaces.find((workspace) => workspace.name === pointer.workspace_name);
    if (byName) return byName.id;
  }

  return null;
}

export async function resolveWorkspaceId(cwd: string, storage: IStorage): Promise<string | null> {
  let dir = cwd;

  for (let i = 0; i < 5; i++) {
    const configPath = join(dir, '_nakiros', 'workspace.yaml');
    if (existsSync(configPath)) {
      try {
        const content = readFileSync(configPath, 'utf-8');
        const parsed = parse(content) as WorkspaceYaml;
        return resolveWorkspaceIdFromPointer(parsed, storage);
      } catch {
        return null;
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return null;
}
