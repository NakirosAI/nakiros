import { execFile } from 'child_process';
import { cpSync, existsSync, mkdirSync } from 'fs';
import { basename, join } from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

function slugifyWorkspaceName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'workspace';
}

function findAvailablePath(basePath: string): string {
  if (!existsSync(basePath)) return basePath;
  let n = 2;
  while (existsSync(`${basePath}-${n}`)) {
    n += 1;
  }
  return `${basePath}-${n}`;
}

export function createWorkspaceRoot(parentDir: string, workspaceName: string): string {
  const folderName = slugifyWorkspaceName(workspaceName);
  const rootPath = findAvailablePath(join(parentDir, folderName));
  mkdirSync(rootPath, { recursive: true });
  return rootPath;
}

export function copyRepoToDirectory(sourcePath: string, targetParentDir: string): { repoPath: string; repoName: string } {
  mkdirSync(targetParentDir, { recursive: true });
  const sourceName = basename(sourcePath) || 'repo';
  const targetPath = findAvailablePath(join(targetParentDir, sourceName));
  cpSync(sourcePath, targetPath, { recursive: true, force: false, errorOnExist: true });
  return { repoPath: targetPath, repoName: basename(targetPath) };
}

export async function initGitRepo(repoPath: string): Promise<void> {
  await execFileAsync('git', ['init'], { cwd: repoPath });
}
