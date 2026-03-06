import { existsSync, mkdirSync } from 'fs';
import type { Dirent } from 'fs';
import { readdir, readFile, stat } from 'fs/promises';
import { homedir } from 'os';
import { basename, dirname, join, resolve } from 'path';
import type { StoredWorkspace } from '@nakiros/shared';
import { resolveWorkspaceSlug } from './workspace';

export interface ScannedDoc {
  name: string;
  relativePath: string;
  absolutePath: string;
  isGenerated: boolean;
  lastModifiedAt?: number;
}

export interface ScannedRepo {
  repoName: string;
  repoPath: string;
  docs: ScannedDoc[];
}

export interface GlobalSection {
  docs: ScannedDoc[];
  missingNames: string[];
}

export interface ScanResult {
  repos: ScannedRepo[];
  globalSection: GlobalSection;
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

const PRIORITY_DIRS = ['docs', '_bmad-output', '_nakiros'];
const GENERATED_TIQUORA_PREFIXES = [
  '_nakiros/',
];

const GLOBAL_EXPECTED_FILES = ['global-context.md', 'inter-repo.md', 'product-context.md'];
const GLOBAL_FILE_ALIASES: Record<string, string[]> = {
  'product-context.md': ['pm-context.md'],
};

function isExcluded(relPath: string): boolean {
  const normalized = relPath.replace(/\\/g, '/');
  return normalized.split('/').some((part) => EXCLUDED_DIRS.has(part));
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

async function walkMarkdown(repoPath: string, llmDocs: string[]): Promise<ScannedDoc[]> {
  const repoRoot = resolve(repoPath);
  const llmDocsSet = new Set(llmDocs.map((docPath) => normalizePath(resolve(repoRoot, docPath))));
  const seen = new Set<string>();
  const results: { priority: number; doc: ScannedDoc }[] = [];
  const stack: Array<{ absPath: string; relPath: string }> = [{ absPath: repoRoot, relPath: '' }];

  while (stack.length > 0) {
    const current = stack.pop()!;
    let entries: Dirent[];
    try {
      entries = await readdir(current.absPath, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const nextRelPath = current.relPath ? `${current.relPath}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        if (EXCLUDED_DIRS.has(entry.name) || isExcluded(nextRelPath)) continue;
        stack.push({
          absPath: join(current.absPath, entry.name),
          relPath: nextRelPath,
        });
        continue;
      }

      if (!entry.isFile()) continue;
      const normalized = nextRelPath.replace(/\\/g, '/');
      const lowerName = entry.name.toLowerCase();
      if (!lowerName.endsWith('.md') && lowerName !== 'llms.txt') continue;
      if (isExcluded(normalized)) continue;

      const absolutePath = join(current.absPath, entry.name);
      const normalizedAbsPath = normalizePath(resolve(absolutePath));
      if (seen.has(normalizedAbsPath)) continue;
      seen.add(normalizedAbsPath);

      const fileName = basename(normalized);
      const dirPart = dirname(normalized);
      const isGenerated = GENERATED_TIQUORA_PREFIXES.some((prefix) =>
        normalized.startsWith(prefix),
      );

      let priority: number;
      if (llmDocsSet.has(normalizedAbsPath)) {
        priority = 0;
      } else if (dirPart === '.' && PRIORITY_ROOT_FILES.has(fileName)) {
        priority = 1;
      } else if (PRIORITY_DIRS.some((dirName) => normalized.startsWith(`${dirName}/`))) {
        priority = 2;
      } else if (isGenerated) {
        priority = 50;
      } else {
        continue;
      }

      let lastModifiedAt: number | undefined;
      try {
        const filestat = await stat(absolutePath);
        lastModifiedAt = filestat.mtimeMs;
      } catch {
        // ignore
      }

      results.push({
        priority,
        doc: {
          name: fileName.replace(/\.md$/i, ''),
          relativePath: normalized,
          absolutePath,
          isGenerated,
          lastModifiedAt,
        },
      });
    }
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
  const scratchDir = join(
    homedir(),
    '.nakiros',
    'workspaces',
    resolveWorkspaceSlug(workspace.id, workspace.name),
  );
  mkdirSync(scratchDir, { recursive: true });
  return scratchDir;
}

async function scanGlobalSection(workspace: StoredWorkspace): Promise<GlobalSection> {
  const workspaceSlug = resolveWorkspaceSlug(workspace.id, workspace.name);
  const contextDir = join(homedir(), '.nakiros', 'workspaces', workspaceSlug, 'context');
  const docs: ScannedDoc[] = [];
  const missingNames: string[] = [];

  for (const filename of GLOBAL_EXPECTED_FILES) {
    const candidates = [filename, ...(GLOBAL_FILE_ALIASES[filename] ?? [])];
    const resolvedFilename = candidates.find((candidate) => existsSync(join(contextDir, candidate)));

    if (resolvedFilename) {
      const absolutePath = join(contextDir, resolvedFilename);
      let lastModifiedAt: number | undefined;
      try {
        const metaPath = join(contextDir, 'meta.json');
        if (existsSync(metaPath)) {
          const raw = await readFile(metaPath, 'utf-8');
          const meta = JSON.parse(raw) as Record<string, { generatedAt?: number }>;
          lastModifiedAt = meta[resolvedFilename]?.generatedAt ?? meta[filename]?.generatedAt;
        }
        if (!lastModifiedAt) {
          const filestat = await stat(absolutePath);
          lastModifiedAt = filestat.mtimeMs;
        }
      } catch {
        // ignore
      }
      docs.push({
        name: filename.replace(/\.md$/i, ''),
        relativePath: `context/${resolvedFilename}`,
        absolutePath,
        isGenerated: true,
        lastModifiedAt,
      });
    } else {
      missingNames.push(filename.replace(/\.md$/i, ''));
    }
  }

  return { docs, missingNames };
}

export async function scanWorkspaceDocs(workspace: StoredWorkspace): Promise<ScanResult> {
  const primaryRepoPath = getPrimaryRepoPath(workspace);

  const [repoResults, globalSection] = await Promise.all([
    Promise.all(
      workspace.repos
        .filter((repo) => existsSync(repo.localPath))
        .map(async (repo) => ({
          repoName: repo.name,
          repoPath: repo.localPath,
          docs: await walkMarkdown(repo.localPath, repo.llmDocs),
        })),
    ),
    scanGlobalSection(workspace),
  ]);

  const repos = repoResults.filter((r) => r.docs.length > 0);

  const workspaceRootPath = workspace.workspacePath?.trim();
  const hasDistinctWorkspaceRoot =
    Boolean(workspaceRootPath) &&
    !workspace.repos.some((repo) => resolve(repo.localPath) === resolve(workspaceRootPath!)) &&
    existsSync(workspaceRootPath!);

  if (hasDistinctWorkspaceRoot && workspaceRootPath) {
    const workspaceDocs = await walkMarkdown(workspaceRootPath, []);
    if (workspaceDocs.length > 0) {
      repos.unshift({
        repoName: `${workspace.name} (workspace)`,
        repoPath: workspaceRootPath,
        docs: workspaceDocs,
      });
    }
  }

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

  return { repos, globalSection, primaryRepoPath };
}
