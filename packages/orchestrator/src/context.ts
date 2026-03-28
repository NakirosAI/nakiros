import { existsSync, mkdirSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { resolve } from 'path';

export function buildWorkspaceContext(workspaceSlug: string): string | null {
  const contextPath = resolve(homedir(), '.nakiros', 'workspaces', workspaceSlug, 'context', 'global-context.md');
  if (!existsSync(contextPath)) return null;
  try {
    const content = readFileSync(contextPath, 'utf8').trim();
    if (!content) return null;
    return `[WORKSPACE CONTEXT — ${new Date().toISOString()}]\n${content}\n[END WORKSPACE CONTEXT]`;
  } catch {
    return null;
  }
}

function hasProjectMarkers(candidate: string): boolean {
  return existsSync(resolve(candidate, '_nakiros', 'workspace.yaml'));
}

export function resolveAgentCwd(repoPath?: string, additionalDirs?: string[], workspaceSymlinkDir?: string): string {
  // Prefer the workspace symlink dir (~/.nakiros/workspaces/{slug}/) when it exists.
  // All repos are accessible via symlinks from there — no --add-dir needed.
  if (workspaceSymlinkDir && existsSync(workspaceSymlinkDir)) {
    return workspaceSymlinkDir;
  }

  const normalizedCandidates = Array.from(new Set([
    ...(repoPath ? [resolve(repoPath)] : []),
    ...((additionalDirs ?? []).filter((d) => d.trim().length > 0).map((d) => resolve(d))),
  ])).filter((candidate) => existsSync(candidate));

  const projectScopedCwd = normalizedCandidates.find((candidate) => hasProjectMarkers(candidate));
  if (projectScopedCwd) return projectScopedCwd;

  if (normalizedCandidates.length > 0) return normalizedCandidates[0]!;

  const fallbackCwd = resolve(homedir(), '.nakiros');
  mkdirSync(fallbackCwd, { recursive: true });
  return fallbackCwd;
}
