import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { StoredWorkspace } from '@tiqora/shared';

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

  return [
    `# Géré par Tiqora Desktop — ne pas éditer manuellement`,
    `workspace:`,
    `  name: ${workspace.name}`,
    `  repos:`,
    reposYaml,
    `${pmLine}${keyLine}${docLangLine}${branchLine}`,
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
  mcpServers['tiqora'] = {
    type: 'http',
    url: `${mcpServerUrl}/ws/${workspaceId}/mcp`,
  };
  existing['mcpServers'] = mcpServers;

  writeFileSync(claudeJsonPath, JSON.stringify(existing, null, 2) + '\n', 'utf-8');
}

export function syncToRepos(workspace: StoredWorkspace, mcpServerUrl: string): void {
  const content = buildYaml(workspace);
  for (const repo of workspace.repos) {
    // Existing: full workspace YAML at repo root
    writeFileSync(join(repo.localPath, '.tiqora.workspace.yaml'), content, 'utf-8');

    // New: .tiqora/workspace.yaml — workspace_id for server cwd resolver
    const tiqoraDir = join(repo.localPath, '.tiqora');
    mkdirSync(tiqoraDir, { recursive: true });
    writeFileSync(join(tiqoraDir, 'workspace.yaml'), `workspace_id: ${workspace.id}\n`, 'utf-8');

    // New: .claude/claude.json — MCP config for Claude Code
    writeClaudeJson(repo.localPath, workspace.id, mcpServerUrl);
  }
}
