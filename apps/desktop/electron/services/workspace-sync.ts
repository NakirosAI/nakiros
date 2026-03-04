import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { StoredWorkspace } from '@nakiros/shared';

function buildYaml(workspace: StoredWorkspace): string {
  const reposYaml = workspace.repos
    .map((repo) => {
      const llmDocsYaml =
        repo.llmDocs.length > 0
          ? repo.llmDocs.map((d) => `        - ${d}`).join('\n')
          : '        - CLAUDE.md';
      return [
        `    - name: ${repo.name}`,
        `      url: "${repo.url ?? ''}"`,
        `      role: ${repo.role}`,
        `      profile: ${repo.profile}`,
        `      llmDocs:`,
        llmDocsYaml,
      ].join('\n');
    })
    .join('\n');

  const pmLine = workspace.pmTool ? `\n  pmTool: ${workspace.pmTool}` : '';
  const keyLine = workspace.projectKey
    ? `\n  projectKey: ${workspace.projectKey}`
    : '';
  const docLangLine = workspace.documentLanguage
    ? `\n  document_language: ${workspace.documentLanguage}`
    : '';
  const branchLine = workspace.branchPattern
    ? `\n  branch_pattern: ${workspace.branchPattern}`
    : '';
  const topologyLine = workspace.topology
    ? `\n  topology: ${workspace.topology}`
    : '';

  return [
    `# Géré par Nakiros — ne pas éditer manuellement`,
    `workspace:`,
    `  name: ${workspace.name}`,
    `  repos:`,
    reposYaml,
    `${pmLine}${keyLine}${docLangLine}${branchLine}${topologyLine}`,
  ]
    .join('\n')
    .trimEnd() + '\n';
}

function writeClaudeJson(repoPath: string, workspaceId: string, mcpServerUrl: string): void {
  const claudeDir = join(repoPath, '.claude');
  mkdirSync(claudeDir, { recursive: true });
  const claudeJsonPath = join(claudeDir, 'claude.json');

  let existing: Record<string, unknown> = {};
  if (existsSync(claudeJsonPath)) {
    try {
      existing = JSON.parse(readFileSync(claudeJsonPath, 'utf-8')) as Record<string, unknown>;
    } catch { /* ignore malformed file */ }
  }

  const mcpServers = (existing['mcpServers'] as Record<string, unknown>) ?? {};
  mcpServers['nakiros'] = {
    type: 'http',
    url: `${mcpServerUrl}/ws/${workspaceId}/mcp`,
  };
  existing['mcpServers'] = mcpServers;

  writeFileSync(claudeJsonPath, JSON.stringify(existing, null, 2) + '\n', 'utf-8');
}

export function syncToRepos(workspace: StoredWorkspace, mcpServerUrl: string): void {
  const content = buildYaml(workspace);
  const workspaceRootPath = workspace.workspacePath ?? workspace.repos[0]?.localPath;
  if (workspaceRootPath) {
    writeFileSync(join(workspaceRootPath, '.nakiros.workspace.yaml'), content, 'utf-8');
  }

  for (const repo of workspace.repos) {
    // Compat: keep a local copy in each repo for workflows launched from repo cwd.
    if (repo.localPath !== workspaceRootPath) {
      writeFileSync(join(repo.localPath, '.nakiros.workspace.yaml'), content, 'utf-8');
    }

    // Required for server cwd resolver — written into _nakiros/ (committed, versioned).
    const nakirosDir = join(repo.localPath, '_nakiros');
    mkdirSync(nakirosDir, { recursive: true });
    writeFileSync(join(nakirosDir, 'workspace.yaml'), `workspace_id: ${workspace.id}\n`, 'utf-8');

    // MCP config for Claude Code
    writeClaudeJson(repo.localPath, workspace.id, mcpServerUrl);
  }
}
