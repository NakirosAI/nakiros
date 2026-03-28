import { app } from 'electron';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import type {
  AgentProfile,
  CanonicalWorkspaceYaml,
  StoredWorkspace,
  WorkspaceStructure,
  WorkspaceYamlRepo,
} from '@nakiros/shared';
import { ensureValidAccessToken } from './auth.js';
import { upsertNakirosMcpConfig } from './mcp-config.js';
import { getNakirosWorkspaceDir, resolveWorkspaceSlug } from './workspace.js';
import { syncWorkspaceSymlinks } from './workspace-symlinks.js';

// ---------------------------------------------------------------------------
// YAML serialization helpers
// ---------------------------------------------------------------------------

function quoteYaml(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function parseScalar(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith('\'') && trimmed.endsWith('\''))
  ) {
    return trimmed.slice(1, -1).replace(/''/g, '\'');
  }
  return trimmed;
}

function parseKeyValue(line: string): { key: string; value: string } | null {
  const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.+)?$/);
  if (!match) return null;
  return { key: match[1], value: parseScalar(match[2] ?? '') };
}

function toCanonicalWorkspaceYaml(workspace: StoredWorkspace): CanonicalWorkspaceYaml {
  const structure: WorkspaceStructure =
    workspace.topology === 'mono' ? 'mono-repo' : 'multi-repo';

  const repos: WorkspaceYamlRepo[] = workspace.repos.map((repo, index) => ({
    name: repo.name,
    role: index === 0 ? 'primary' : (repo.role || 'secondary'),
    localPath: repo.localPath,
    profile: repo.profile,
  }));

  return {
    name: workspace.name,
    slug: resolveWorkspaceSlug(workspace.id, workspace.name),
    structure,
    repos,
    pmTool: workspace.pmTool,
    projectKey: workspace.projectKey,
    documentLanguage: workspace.documentLanguage,
    branchPattern: workspace.branchPattern,
    boardType: workspace.boardType,
    syncFilter: workspace.syncFilter,
    pmBoardId: workspace.pmBoardId,
  };
}

export function buildWorkspaceYaml(workspace: StoredWorkspace): string {
  const canonical = toCanonicalWorkspaceYaml(workspace);
  const lines = [
    '# Managed by Nakiros',
    'workspace:',
    `  name: ${quoteYaml(canonical.name)}`,
    `  structure: ${quoteYaml(canonical.structure)}`,
  ];

  if (canonical.pmTool) lines.push(`  pm_tool: ${quoteYaml(canonical.pmTool)}`);
  if (canonical.documentLanguage) lines.push(`  document_language: ${quoteYaml(canonical.documentLanguage)}`);
  if (canonical.branchPattern) lines.push(`  branch_pattern: ${quoteYaml(canonical.branchPattern)}`);

  if (canonical.pmTool === 'jira' && canonical.projectKey) {
    lines.push('  jira:');
    lines.push(`    project_key: ${quoteYaml(canonical.projectKey)}`);
    if (canonical.pmBoardId) lines.push(`    board_id: ${quoteYaml(canonical.pmBoardId)}`);
    if (canonical.boardType) lines.push(`    board_type: ${quoteYaml(canonical.boardType)}`);
    if (canonical.syncFilter) lines.push(`    sync_filter: ${quoteYaml(canonical.syncFilter)}`);
  }

  lines.push('  repos:');
  for (const repo of canonical.repos) {
    lines.push(`    - name: ${quoteYaml(repo.name)}`);
    lines.push(`      role: ${quoteYaml(repo.role)}`);
    lines.push(`      localPath: ${quoteYaml(repo.localPath)}`);
    lines.push(`      profile: ${quoteYaml(repo.profile)}`);
  }

  return `${lines.join('\n')}\n`;
}

/**
 * Parses a canonical workspace.yaml string back to a typed object.
 * Primarily used to validate round-trip serialization correctness.
 */
export function parseCanonicalWorkspaceYaml(
  yaml: string,
  workspaceSlug: string,
): CanonicalWorkspaceYaml {
  let name = '';
  let structure: WorkspaceStructure = 'mono-repo';
  let pmTool: CanonicalWorkspaceYaml['pmTool'];
  let documentLanguage: string | undefined;
  let branchPattern: string | undefined;
  let projectKey: string | undefined;
  let boardType: CanonicalWorkspaceYaml['boardType'];
  let syncFilter: CanonicalWorkspaceYaml['syncFilter'];
  let pmBoardId: string | undefined;
  const repos: WorkspaceYamlRepo[] = [];

  let inWorkspace = false;
  let inRepos = false;
  let inJira = false;
  let currentRepo: Partial<WorkspaceYamlRepo> | null = null;

  const flushRepo = () => {
    if (
      currentRepo
      && currentRepo.name
      && currentRepo.role
      && currentRepo.localPath
      && currentRepo.profile
    ) {
      repos.push(currentRepo as WorkspaceYamlRepo);
    }
    currentRepo = null;
  };

  for (const rawLine of yaml.split('\n')) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const indent = rawLine.length - rawLine.trimStart().length;
    if (trimmed === 'workspace:') {
      inWorkspace = true;
      inRepos = false;
      inJira = false;
      flushRepo();
      continue;
    }

    if (!inWorkspace) continue;

    if (indent === 2 && trimmed === 'repos:') { inRepos = true; inJira = false; flushRepo(); continue; }
    if (indent === 2 && trimmed === 'jira:')  { inJira = true; inRepos = false; flushRepo(); continue; }

    if (indent === 2) {
      inRepos = false;
      inJira = false;
      flushRepo();
      const pair = parseKeyValue(trimmed);
      if (!pair) continue;
      if (pair.key === 'name') name = pair.value;
      else if (pair.key === 'structure') structure = pair.value === 'multi-repo' ? 'multi-repo' : 'mono-repo';
      else if (pair.key === 'pm_tool') pmTool = pair.value as CanonicalWorkspaceYaml['pmTool'];
      else if (pair.key === 'document_language') documentLanguage = pair.value;
      else if (pair.key === 'branch_pattern') branchPattern = pair.value;
      continue;
    }

    if (inJira && indent === 4) {
      const pair = parseKeyValue(trimmed);
      if (!pair) continue;
      if (pair.key === 'project_key') projectKey = pair.value;
      else if (pair.key === 'board_id') pmBoardId = pair.value;
      else if (pair.key === 'board_type') boardType = pair.value as CanonicalWorkspaceYaml['boardType'];
      else if (pair.key === 'sync_filter') syncFilter = pair.value as CanonicalWorkspaceYaml['syncFilter'];
      continue;
    }

    if (inRepos && indent === 4 && trimmed.startsWith('- ')) {
      flushRepo();
      currentRepo = {};
      const firstPair = parseKeyValue(trimmed.slice(2));
      if (firstPair?.key === 'name') currentRepo.name = firstPair.value;
      continue;
    }

    if (inRepos && indent === 6 && currentRepo) {
      const pair = parseKeyValue(trimmed);
      if (!pair) continue;
      if (pair.key === 'role') currentRepo.role = pair.value;
      else if (pair.key === 'localPath') currentRepo.localPath = pair.value;
      else if (pair.key === 'profile') currentRepo.profile = pair.value as AgentProfile;
      else if (pair.key === 'name') currentRepo.name = pair.value;
    }
  }

  flushRepo();

  if (!name) throw new Error('Invalid workspace.yaml: missing workspace.name');
  if (repos.length === 0) throw new Error('Invalid workspace.yaml: missing workspace.repos');

  return { name, slug: workspaceSlug, structure, repos, pmTool, projectKey, documentLanguage, branchPattern, boardType, syncFilter, pmBoardId };
}

// ---------------------------------------------------------------------------
// Electron-side write operations
// ---------------------------------------------------------------------------

export function getWorkspaceAppDir(wsId: string): string {
  const dir = join(app.getPath('userData'), wsId);
  mkdirSync(dir, { recursive: true });
  return dir;
}

async function writeClaudeMcpSettings(repoPath: string, workspaceId: string): Promise<void> {
  const claudeDir = join(repoPath, '.claude');
  mkdirSync(claudeDir, { recursive: true });
  const apiBase = process.env['NAKIROS_API_URL'] ?? 'https://api.nakiros.com';
  const resolved = await ensureValidAccessToken();
  upsertNakirosMcpConfig(join(claudeDir, 'settings.json'), workspaceId, apiBase, resolved.token);
}

/**
 * Writes workspace.yaml to ~/.nakiros/workspaces/{slug}/workspace.yaml
 * so CLI agents (claude, codex) and IDE extensions can read it from the workspace dir.
 */
export function writeAgentWorkspaceYaml(workspace: StoredWorkspace): void {
  const slug = resolveWorkspaceSlug(workspace.id, workspace.name);
  const wsDir = getNakirosWorkspaceDir(slug);
  mkdirSync(wsDir, { recursive: true });
  writeFileSync(join(wsDir, 'workspace.yaml'), buildWorkspaceYaml(workspace), 'utf-8');
}

/**
 * Full workspace sync: writes canonical YAML, creates symlinks for each repo in
 * ~/.nakiros/workspaces/{slug}/, and updates MCP config in each repo's .claude/ dir.
 *
 * Agents run directly from the workspace symlink dir — all repos visible as subdirectories.
 */
export async function syncWorkspaceYaml(workspace: StoredWorkspace): Promise<string> {
  const yaml = buildWorkspaceYaml(workspace);

  const appDir = getWorkspaceAppDir(workspace.id);
  writeFileSync(join(appDir, 'workspace.yaml'), yaml, 'utf-8');
  writeAgentWorkspaceYaml(workspace);
  syncWorkspaceSymlinks(workspace);

  for (const repo of workspace.repos) {
    await writeClaudeMcpSettings(repo.localPath, workspace.id);
  }

  return workspace.workspacePath ?? workspace.repos[0]?.localPath ?? appDir;
}
