import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  writeFileSync,
} from 'fs';
import { homedir } from 'os';
import { dirname, resolve } from 'path';
import type {
  AgentEnvironmentId,
  AgentEnvironmentStatus,
  AgentInstallRequest,
  AgentInstallStatus,
  AgentInstallSummary,
  AgentProvider,
} from '@nakiros/shared';
import { COMMAND_TEMPLATES } from '../templates-bundle';

const COMMAND_TEMPLATE_FILES = [
  'nak-agent-nakiros.md',
  'nak-agent-dev.md',
  'nak-agent-sm.md',
  'nak-agent-pm.md',
  'nak-agent-architect.md',
  'nak-agent-brainstorming.md',
  'nak-agent-qa.md',
  'nak-agent-hotfix.md',
  'nak-workflow-create-story.md',
  'nak-workflow-dev-story.md',
  'nak-workflow-fetch-project-context.md',
  'nak-workflow-generate-context.md',
  'nak-workflow-create-ticket.md',
  'nak-workflow-hotfix-story.md',
  'nak-workflow-qa-review.md',
  'nak-workflow-sprint.md',
  'nak-workflow-project-understanding-confidence.md',
] as const;

/** Workflow runtime — installed once globally at ~/.nakiros/ */
const GLOBAL_RUNTIME_DIR = resolve(homedir(), '.nakiros');

const ENVIRONMENTS: Record<
  AgentEnvironmentId,
  { label: string; markerRelativePath: string; targetRelativePath: string }
> = {
  cursor: {
    label: 'Cursor',
    markerRelativePath: '.cursor',
    targetRelativePath: '.cursor/commands',
  },
  codex: {
    label: 'Codex',
    markerRelativePath: '.codex',
    targetRelativePath: '.codex/prompts',
  },
  claude: {
    label: 'Claude Code',
    markerRelativePath: '.claude',
    targetRelativePath: '.claude/commands',
  },
};

function findRepoRoot(startDir = process.cwd()): string {
  let cursor = resolve(startDir);
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(resolve(cursor, 'package.json'))) return cursor;
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return resolve(startDir);
}

function getRuntimeSourceDir(): string {
  const repoRoot = findRepoRoot();
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  const candidates = [
    ...(resourcesPath ? [resolve(resourcesPath, '_nakiros')] : []),
    resolve(repoRoot, '_nakiros'),
    resolve(repoRoot, 'apps/desktop/_nakiros'),
  ];
  for (const path of candidates) {
    if (existsSync(resolve(path, 'core/tasks/workflow.xml'))) return path;
  }
  throw new Error('Impossible de localiser le runtime _nakiros.');
}

function copyDirectoryRecursive(
  sourceDir: string,
  targetDir: string,
  force: boolean,
): { copied: number; overwritten: number } {
  mkdirSync(targetDir, { recursive: true });
  let copied = 0;
  let overwritten = 0;

  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = resolve(sourceDir, entry.name);
    const targetPath = resolve(targetDir, entry.name);
    if (entry.isDirectory()) {
      const nested = copyDirectoryRecursive(sourcePath, targetPath, force);
      copied += nested.copied;
      overwritten += nested.overwritten;
      continue;
    }
    if (!entry.isFile()) continue;

    const targetExists = existsSync(targetPath);
    if (targetExists && !force) continue;
    copyFileSync(sourcePath, targetPath);
    if (targetExists) overwritten += 1;
    else copied += 1;
  }

  return { copied, overwritten };
}


export function ensureRuntimeInDir(targetDir: string): void {
  const runtimeTargetDir = resolve(targetDir, '_nakiros');
  if (existsSync(runtimeTargetDir)) return;
  try {
    const runtimeSourceDir = getRuntimeSourceDir();
    copyDirectoryRecursive(runtimeSourceDir, runtimeTargetDir, false);
  } catch {
    // Runtime source not found — silently skip (dev env without packaged app).
  }
}

// ─── Runtime global ────────────────────────────────────────────────────────

export interface RuntimeInstallStatus {
  installed: boolean;
  path: string;
}

export interface RuntimeInstallSummary {
  path: string;
  filesCopied: number;
  filesOverwritten: number;
}

export function getRuntimeInstallStatus(): RuntimeInstallStatus {
  return {
    installed: existsSync(resolve(GLOBAL_RUNTIME_DIR, 'core/tasks/workflow.xml')),
    path: GLOBAL_RUNTIME_DIR,
  };
}

export function installRuntimeGlobally(force = false): RuntimeInstallSummary {
  const sourceDir = getRuntimeSourceDir();
  const result = copyDirectoryRecursive(sourceDir, GLOBAL_RUNTIME_DIR, force);
  return {
    path: GLOBAL_RUNTIME_DIR,
    filesCopied: result.copied,
    filesOverwritten: result.overwritten,
  };
}

// ─── Agents globaux ─────────────────────────────────────────────────────────

export interface GlobalInstallStatus {
  environments: Array<{
    id: AgentEnvironmentId;
    label: string;
    targetDir: string;
    installed: number;
    total: number;
  }>;
  totalInstalled: number;
  totalExpected: number;
}

export interface GlobalInstallSummary {
  environments: Array<{
    id: AgentEnvironmentId;
    label: string;
    targetDir: string;
    commandFilesCopied: number;
    commandFilesOverwritten: number;
  }>;
  commandFilesCopied: number;
  commandFilesOverwritten: number;
}

export function getGlobalInstallStatus(): GlobalInstallStatus {
  const home = homedir();
  const ids: AgentEnvironmentId[] = ['claude', 'codex', 'cursor'];
  const environments = ids.map((id) => {
    const env = ENVIRONMENTS[id];
    const targetDir = resolve(home, env.targetRelativePath);
    const installed = COMMAND_TEMPLATE_FILES.filter(
      (file) => existsSync(resolve(targetDir, file)),
    ).length;
    return {
      id,
      label: env.label,
      targetDir,
      installed,
      total: COMMAND_TEMPLATE_FILES.length,
    };
  });

  return {
    environments,
    totalInstalled: environments.reduce((acc, item) => acc + item.installed, 0),
    totalExpected: environments.reduce((acc, item) => acc + item.total, 0),
  };
}

export function installAgentsGlobally(): GlobalInstallSummary {
  const home = homedir();
  const ids: AgentEnvironmentId[] = ['claude', 'codex', 'cursor'];

  const environments: GlobalInstallSummary['environments'] = [];
  let commandFilesCopied = 0;
  let commandFilesOverwritten = 0;

  for (const id of ids) {
    const env = ENVIRONMENTS[id];
    const targetDir = resolve(home, env.targetRelativePath);
    mkdirSync(targetDir, { recursive: true });

    let copiedForEnv = 0;
    let overwrittenForEnv = 0;

    for (const [fileName, content] of Object.entries(COMMAND_TEMPLATES)) {
      const targetPath = resolve(targetDir, fileName);
      const targetExists = existsSync(targetPath);
      writeFileSync(targetPath, content, 'utf8');
      if (targetExists) {
        overwrittenForEnv += 1;
        commandFilesOverwritten += 1;
      } else {
        copiedForEnv += 1;
        commandFilesCopied += 1;
      }
    }

    environments.push({
      id,
      label: env.label,
      targetDir,
      commandFilesCopied: copiedForEnv,
      commandFilesOverwritten: overwrittenForEnv,
    });
  }

  return { environments, commandFilesCopied, commandFilesOverwritten };
}

// ─── Agents par repo ────────────────────────────────────────────────────────

function getEnvironmentStatus(repoPath: string, id: AgentEnvironmentId): AgentEnvironmentStatus {
  const env = ENVIRONMENTS[id];
  const markerExists = existsSync(resolve(repoPath, env.markerRelativePath));
  const targetPath = resolve(repoPath, env.targetRelativePath);
  const installedCount = COMMAND_TEMPLATE_FILES.filter((file) =>
    existsSync(resolve(targetPath, file))).length;

  return {
    id,
    label: env.label,
    targetPath,
    markerExists,
    installedCount,
    totalExpected: COMMAND_TEMPLATE_FILES.length,
  };
}

export function getAgentInstallStatus(repoPath: string): AgentInstallStatus {
  const resolvedRepoPath = resolve(repoPath);
  const environments: AgentEnvironmentStatus[] = [
    getEnvironmentStatus(resolvedRepoPath, 'cursor'),
    getEnvironmentStatus(resolvedRepoPath, 'codex'),
    getEnvironmentStatus(resolvedRepoPath, 'claude'),
  ];

  return {
    repoPath: resolvedRepoPath,
    hasNakirosConfig: existsSync(resolve(resolvedRepoPath, '.nakiros.yaml')),
    environments,
  };
}

export function installAgents(request: AgentInstallRequest): AgentInstallSummary {
  const repoPath = resolve(request.repoPath);
  if (!existsSync(repoPath) || !lstatSync(repoPath).isDirectory()) {
    throw new Error(`Répertoire invalide: ${repoPath}`);
  }
  if (!request.targets.length) {
    throw new Error('Sélectionne au moins un environnement cible.');
  }

  const force = request.force ?? true;

  let commandFilesCopied = 0;
  let commandFilesOverwritten = 0;

  for (const target of request.targets) {
    const env = ENVIRONMENTS[target];
    const envTargetPath = resolve(repoPath, env.targetRelativePath);
    mkdirSync(envTargetPath, { recursive: true });

    for (const [fileName, content] of Object.entries(COMMAND_TEMPLATES)) {
      const targetPath = resolve(envTargetPath, fileName);
      const targetExists = existsSync(targetPath);
      if (targetExists && !force) continue;
      writeFileSync(targetPath, content, 'utf8');
      if (targetExists) commandFilesOverwritten += 1;
      else commandFilesCopied += 1;
    }
  }

  return {
    repoPath,
    targets: request.targets,
    commandFilesCopied,
    commandFilesOverwritten,
    runtimeFilesCopied: 0,
    runtimeFilesOverwritten: 0,
    workspaceDirsCreated: 0,
    gitignorePatched: false,
  };
}

export function ensureCommandsInRepo(repoPath: string, provider: AgentProvider): void {
  const resolvedRepoPath = resolve(repoPath);
  if (!existsSync(resolvedRepoPath) || !lstatSync(resolvedRepoPath).isDirectory()) {
    throw new Error(`Répertoire invalide: ${resolvedRepoPath}`);
  }

  const env = ENVIRONMENTS[provider];
  const targetDir = resolve(resolvedRepoPath, env.targetRelativePath);
  mkdirSync(targetDir, { recursive: true });

  for (const [fileName, content] of Object.entries(COMMAND_TEMPLATES)) {
    const targetPath = resolve(targetDir, fileName);
    if (existsSync(targetPath)) continue;
    writeFileSync(targetPath, content, 'utf8');
  }
}
