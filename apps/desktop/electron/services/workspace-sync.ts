import { writeFileSync } from 'fs';
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

export function syncToRepos(workspace: StoredWorkspace): void {
  const content = buildYaml(workspace);
  for (const repo of workspace.repos) {
    const dest = join(repo.localPath, '.tiqora.workspace.yaml');
    writeFileSync(dest, content, 'utf-8');
  }
}
