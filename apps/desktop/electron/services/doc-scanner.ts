import { existsSync, mkdirSync } from 'fs';
import { readdir } from 'fs/promises';
import { homedir } from 'os';
import { basename, dirname, join } from 'path';
import type { StoredWorkspace } from '@tiqora/shared';

export interface ScannedDoc {
  name: string;
  relativePath: string;
  absolutePath: string;
  isGenerated: boolean;
}

export interface ScannedRepo {
  repoName: string;
  repoPath: string;
  docs: ScannedDoc[];
}

export interface ScanResult {
  repos: ScannedRepo[];
  primaryRepoPath: string;
}

const EXCLUDED_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'out', '.turbo',
  '.next', '.nuxt', 'coverage', '.cache', 'build', '.svelte-kit',
]);

const PRIORITY_ROOT_FILES = new Set([
  'README.md', 'ARCHITECTURE.md', 'CLAUDE.md',
  'CONTRIBUTING.md', 'CHANGELOG.md', 'llms.txt',
]);

const PRIORITY_DIRS = ['docs', '_bmad-output'];

function isExcluded(relPath: string): boolean {
  const normalized = relPath.replace(/\\/g, '/');
  return normalized.split('/').some((part) => EXCLUDED_DIRS.has(part));
}

async function walkMarkdown(repoPath: string, llmDocs: string[]): Promise<ScannedDoc[]> {
  const llmDocsSet = new Set(llmDocs.map((d) => join(repoPath, d)));
  const seen = new Set<string>();
  const results: { priority: number; doc: ScannedDoc }[] = [];

  let allFiles: string[];
  try {
    allFiles = await readdir(repoPath, { recursive: true, encoding: 'utf-8' }) as string[];
  } catch {
    return [];
  }

  for (const relPath of allFiles) {
    const normalized = relPath.replace(/\\/g, '/');
    if (!normalized.endsWith('.md')) continue;
    if (isExcluded(normalized)) continue;

    const absolutePath = join(repoPath, relPath);
    if (seen.has(absolutePath)) continue;
    seen.add(absolutePath);

    const fileName = basename(normalized);
    const dirPart = dirname(normalized);
    const isGenerated = normalized.startsWith('.tiqora/context/');

    let priority: number;
    if (llmDocsSet.has(absolutePath)) {
      priority = 0; // configured llmDocs first
    } else if (dirPart === '.' && PRIORITY_ROOT_FILES.has(fileName)) {
      priority = 1; // known root docs
    } else if (PRIORITY_DIRS.some((d) => normalized.startsWith(d + '/'))) {
      priority = 2; // docs/ and _bmad-output/
    } else if (isGenerated) {
      priority = 50; // generated docs at end
    } else {
      continue; // not in whitelist — skip
    }

    results.push({
      priority,
      doc: {
        name: fileName.replace(/\.md$/i, ''),
        relativePath: normalized,
        absolutePath,
        isGenerated,
      },
    });
  }

  results.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.doc.relativePath.localeCompare(b.doc.relativePath);
  });

  return results.map((r) => r.doc);
}

function getPrimaryRepoPath(workspace: StoredWorkspace): string {
  if (workspace.repos.length > 0) {
    return workspace.repos[0]!.localPath;
  }
  const scratchDir = join(homedir(), '.tiqora', 'workspaces', workspace.id);
  mkdirSync(scratchDir, { recursive: true });
  return scratchDir;
}

export async function scanWorkspaceDocs(workspace: StoredWorkspace): Promise<ScanResult> {
  const primaryRepoPath = getPrimaryRepoPath(workspace);

  const repoResults = await Promise.all(
    workspace.repos
      .filter((repo) => existsSync(repo.localPath))
      .map(async (repo) => ({
        repoName: repo.name,
        repoPath: repo.localPath,
        docs: await walkMarkdown(repo.localPath, repo.llmDocs),
      })),
  );
  const repos = repoResults.filter((r) => r.docs.length > 0);

  // For no-repo workspaces, scan the scratch dir (may have brainstorming.md etc.)
  if (workspace.repos.length === 0 && existsSync(primaryRepoPath)) {
    const scratchDocs = await walkMarkdown(primaryRepoPath, []);
    if (scratchDocs.length > 0) {
      repos.push({
        repoName: workspace.name,
        repoPath: primaryRepoPath,
        docs: scratchDocs,
      });
    }
  }

  return { repos, primaryRepoPath };
}
