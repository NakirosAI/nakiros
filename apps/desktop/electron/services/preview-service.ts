import { existsSync, mkdirSync, rmSync } from 'fs';
import { readdir, readFile, writeFile, cp } from 'fs/promises';
import { homedir } from 'os';
import { join, relative } from 'path';

// ─── Paths ────────────────────────────────────────────────────────────────────

function getNakirosWorkspaceDir(workspaceSlug: string): string {
  return join(homedir(), '.nakiros', 'workspaces', workspaceSlug);
}

function getPreviewBase(workspaceSlug: string): string {
  return join(getNakirosWorkspaceDir(workspaceSlug), '.preview');
}

function getContextDir(workspaceSlug: string): string {
  return join(getNakirosWorkspaceDir(workspaceSlug), 'context');
}

// ─── Check ────────────────────────────────────────────────────────────────────

export interface PendingPreview {
  exists: boolean;
  previewRoot: string;
  files: string[];
  conversationId: string | null;
}

export async function checkPendingPreview(workspaceSlug: string): Promise<PendingPreview> {
  const previewBase = getPreviewBase(workspaceSlug);

  if (!existsSync(previewBase)) {
    return { exists: false, previewRoot: previewBase, files: [], conversationId: null };
  }

  // Scan all subdirs — first non-empty one wins
  let entries: Awaited<ReturnType<typeof readdir>>;
  try {
    entries = await readdir(previewBase, { withFileTypes: true });
  } catch {
    return { exists: false, previewRoot: previewBase, files: [], conversationId: null };
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = join(previewBase, entry.name);
    const files = await collectFiles(dir);
    if (files.length > 0) {
      return { exists: true, previewRoot: dir, files, conversationId: entry.name };
    }
  }

  return { exists: false, previewRoot: previewBase, files: [], conversationId: null };
}

// ─── Apply ────────────────────────────────────────────────────────────────────

export async function applyPreview(previewRoot: string, workspaceSlug: string): Promise<void> {
  if (!existsSync(previewRoot)) throw new Error('No pending preview found');

  const contextRoot = getContextDir(workspaceSlug);
  const files = await collectFiles(previewRoot);

  for (const absolutePath of files) {
    const rel = relative(previewRoot, absolutePath);
    const dest = join(contextRoot, rel);
    const destDir = join(dest, '..');

    mkdirSync(destDir, { recursive: true });

    // For feature.md: preserve existing Stories table if it has real data
    if (rel.match(/^features\/[^/]+\/feature\.md$/)) {
      const existing = existsSync(dest) ? await readFile(dest, 'utf8') : null;
      const incoming = await readFile(absolutePath, 'utf8');
      if (existing) {
        const merged = mergeFeatureFile(existing, incoming);
        await writeFile(dest, merged, 'utf8');
        continue;
      }
    }

    // For ux.md: skip if existing file already has a full UX spec
    if (rel.match(/^features\/[^/]+\/ux\.md$/)) {
      if (existsSync(dest)) {
        const existing = await readFile(dest, 'utf8');
        if (isFullUxSpec(existing)) continue;
      }
    }

    await cp(absolutePath, dest, { force: true });
  }

  // Clean up preview after successful apply
  rmSync(previewRoot, { recursive: true, force: true });
}

// ─── Apply single file ────────────────────────────────────────────────────────

export async function applyPreviewFile(previewRoot: string, filePath: string, workspaceSlug: string): Promise<void> {
  if (!existsSync(previewRoot)) throw new Error('No pending preview found');

  const contextRoot = getContextDir(workspaceSlug);
  const rel = relative(previewRoot, filePath);
  const dest = join(contextRoot, rel);
  const destDir = join(dest, '..');

  mkdirSync(destDir, { recursive: true });

  if (rel.match(/^features\/[^/]+\/feature\.md$/)) {
    const existing = existsSync(dest) ? await readFile(dest, 'utf8') : null;
    const incoming = await readFile(filePath, 'utf8');
    if (existing) {
      await writeFile(dest, mergeFeatureFile(existing, incoming), 'utf8');
    } else {
      await cp(filePath, dest, { force: true });
    }
  } else if (rel.match(/^features\/[^/]+\/ux\.md$/) && existsSync(dest)) {
    const existing = await readFile(dest, 'utf8');
    if (!isFullUxSpec(existing)) await cp(filePath, dest, { force: true });
  } else {
    await cp(filePath, dest, { force: true });
  }

  // Remove only this file from the preview folder
  rmSync(filePath, { force: true });

  // Clean up empty parent dirs up to previewRoot
  let dir = join(filePath, '..');
  while (dir !== previewRoot) {
    try {
      const remaining = await readdir(dir);
      if (remaining.length > 0) break;
      rmSync(dir, { recursive: true, force: true });
    } catch { break; }
    dir = join(dir, '..');
  }
}

// ─── Discard ──────────────────────────────────────────────────────────────────

export function discardPreview(previewRoot: string): void {
  if (existsSync(previewRoot)) {
    rmSync(previewRoot, { recursive: true, force: true });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function collectFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...await collectFiles(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

function mergeFeatureFile(existing: string, incoming: string): string {
  // Preserve the Stories table from the existing file if it has real data
  const storiesMatch = existing.match(/## Stories\n([\s\S]*?)(?=\n##|$)/);
  if (!storiesMatch) return incoming;

  const storiesBlock = storiesMatch[0];
  // Check if it has real data (not just placeholder rows)
  const hasRealStories = /\|\s*[A-Z0-9]+-\d+\s*\|/.test(storiesBlock);
  if (!hasRealStories) return incoming;

  // Replace the incoming Stories section with the preserved one
  return incoming.replace(/## Stories\n[\s\S]*?(?=\n##|$)/, storiesBlock);
}

function isFullUxSpec(content: string): boolean {
  // A "full" UX spec has at least 2 of these sections from a designer (not discovery)
  const designerSections = ['## User Flows', '## Wireframes', '## Components', '## Interactions'];
  const found = designerSections.filter((s) => content.includes(s));
  return found.length >= 2;
}
