import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'fs';
import { dirname, resolve } from 'path';
import type {
  AgentEnvironmentId,
  AgentEnvironmentStatus,
  AgentInstallRequest,
  AgentInstallStatus,
  AgentInstallSummary,
} from '@tiqora/shared';

const COMMAND_TEMPLATE_FILES = [
  'tiq-agent-dev.md',
  'tiq-agent-sm.md',
  'tiq-agent-pm.md',
  'tiq-agent-architect.md',
  'tiq-workflow-create-story.md',
  'tiq-workflow-dev-story.md',
  'tiq-workflow-fetch-project-context.md',
  'tiq-workflow-generate-context.md',
] as const;

const TIQORA_WORKSPACE_DIRECTORIES = [
  'config',
  'state',
  'agents/sessions',
  'workflows/runs',
  'workflows/steps',
  'sessions',
  'sprints',
  'context',
  'reports/daily',
  'reports/retrospective',
  'reports/mr-context',
  'sync',
  'migrations',
] as const;

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

function getTemplatesDir(): string {
  const repoRoot = findRepoRoot();
  const candidates = [
    resolve(repoRoot, 'templates/commands'),
    resolve(repoRoot, 'apps/cli/templates/commands'),
  ];
  for (const path of candidates) {
    if (COMMAND_TEMPLATE_FILES.every((file) => existsSync(resolve(path, file)))) return path;
  }
  throw new Error('Impossible de localiser les templates des commandes Tiqora.');
}

function getRuntimeDir(): string {
  const repoRoot = findRepoRoot();
  const candidates = [resolve(repoRoot, '_tiqora'), resolve(repoRoot, 'apps/cli/_tiqora')];
  for (const path of candidates) {
    if (existsSync(resolve(path, 'core/tasks/workflow.xml'))) return path;
  }
  throw new Error('Impossible de localiser le runtime _tiqora.');
}

function patchGitignore(repoPath: string): boolean {
  const gitignorePath = resolve(repoPath, '.gitignore');
  if (!existsSync(gitignorePath)) {
    writeFileSync(gitignorePath, '.tiqora/\n', 'utf8');
    return true;
  }
  const content = readFileSync(gitignorePath, 'utf8');
  if (content.split(/\r?\n/).includes('.tiqora/')) return false;
  const withTrailingNewline = content.endsWith('\n') ? content : `${content}\n`;
  writeFileSync(gitignorePath, `${withTrailingNewline}.tiqora/\n`, 'utf8');
  return true;
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
    hasTiqoraConfig: existsSync(resolve(resolvedRepoPath, '.tiqora.yaml')),
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
  const templatesDir = getTemplatesDir();
  const runtimeSourceDir = getRuntimeDir();

  let commandFilesCopied = 0;
  let commandFilesOverwritten = 0;
  let runtimeFilesCopied = 0;
  let runtimeFilesOverwritten = 0;
  let workspaceDirsCreated = 0;

  for (const target of request.targets) {
    const env = ENVIRONMENTS[target];
    const envTargetPath = resolve(repoPath, env.targetRelativePath);
    mkdirSync(envTargetPath, { recursive: true });

    for (const templateFile of COMMAND_TEMPLATE_FILES) {
      const sourcePath = resolve(templatesDir, templateFile);
      const targetPath = resolve(envTargetPath, templateFile);
      const targetExists = existsSync(targetPath);
      if (targetExists && !force) continue;
      copyFileSync(sourcePath, targetPath);
      if (targetExists) commandFilesOverwritten += 1;
      else commandFilesCopied += 1;
    }
  }

  const runtimeTargetDir = resolve(repoPath, '_tiqora');
  const runtimeCopy = copyDirectoryRecursive(runtimeSourceDir, runtimeTargetDir, force);
  runtimeFilesCopied += runtimeCopy.copied;
  runtimeFilesOverwritten += runtimeCopy.overwritten;

  const workspaceRoot = resolve(repoPath, '.tiqora');
  for (const relativeDir of TIQORA_WORKSPACE_DIRECTORIES) {
    const target = resolve(workspaceRoot, relativeDir);
    if (!existsSync(target)) workspaceDirsCreated += 1;
    mkdirSync(target, { recursive: true });
  }

  const gitignorePatched = patchGitignore(repoPath);

  return {
    repoPath,
    targets: request.targets,
    commandFilesCopied,
    commandFilesOverwritten,
    runtimeFilesCopied,
    runtimeFilesOverwritten,
    workspaceDirsCreated,
    gitignorePatched,
  };
}
