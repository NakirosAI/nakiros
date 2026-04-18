import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join, resolve } from 'path';

export const COMMANDS_META_FILE = join(homedir(), '.nakiros', 'commands-meta.json');

export interface CommandMeta {
  tag?: string;
  label?: string;
  color?: string;
  placeholder?: string;
}

import type {
  AgentEnvironmentId,
  AgentEnvironmentStatus,
  AgentInstallRequest,
  AgentInstallStatus,
  AgentInstallSummary,
} from '@nakiros/shared';

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

function readCommandTemplates(): Record<string, string> {
  const dir = resolve(GLOBAL_RUNTIME_DIR, 'commands');
  if (!existsSync(dir)) return {};
  return Object.fromEntries(
    readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.md'))
      .map((e) => [e.name, readFileSync(resolve(dir, e.name), 'utf8')])
  );
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

export interface InstalledCommand {
  id: string;
  command: string;
  kind: 'agent' | 'workflow';
  fileName: string;
  meta?: CommandMeta;
}

function parseInstalledCommand(fileName: string): InstalledCommand | null {
  if (!fileName.endsWith('.md')) return null;
  const commandName = fileName.replace(/\.md$/i, '');
  if (!/^nak-(?:agent|workflow)-[a-z0-9-]+$/.test(commandName)) return null;

  const kind: InstalledCommand['kind'] = commandName.startsWith('nak-workflow-')
    ? 'workflow'
    : 'agent';
  const id = commandName.replace(/^nak-(?:agent|workflow)-/, '');

  return {
    id,
    command: `/${commandName}`,
    kind,
    fileName,
  };
}

function readCommandsMeta(): Record<string, CommandMeta> {
  try {
    if (existsSync(COMMANDS_META_FILE)) {
      return JSON.parse(readFileSync(COMMANDS_META_FILE, 'utf-8')) as Record<string, CommandMeta>;
    }
  } catch {
    /* ignore */
  }
  return {};
}

export function getInstalledCommands(): InstalledCommand[] {
  const dir = resolve(GLOBAL_RUNTIME_DIR, 'commands');
  if (!existsSync(dir)) return [];

  const metaMap = readCommandsMeta();

  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const cmd = parseInstalledCommand(entry.name);
      if (!cmd) return null;
      const commandName = entry.name.replace(/\.md$/i, '');
      const meta = metaMap[`nak-${cmd.kind}-${cmd.id}`] ?? metaMap[commandName];
      return meta ? { ...cmd, meta } : cmd;
    })
    .filter((entry): entry is InstalledCommand => entry != null)
    .sort((a, b) => a.command.localeCompare(b.command));
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

    for (const [fileName, content] of Object.entries(readCommandTemplates())) {
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

    for (const [fileName, content] of Object.entries(readCommandTemplates())) {
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

export function getGlobalInstallStatus(): GlobalInstallStatus {
  const home = homedir();
  const ids: AgentEnvironmentId[] = ['claude', 'codex', 'cursor'];
  const environments = ids.map((id) => {
    const env = ENVIRONMENTS[id];
    const targetDir = resolve(home, env.targetRelativePath);
    const commandFiles = Object.keys(readCommandTemplates());
    const installed = commandFiles.filter((file) => existsSync(resolve(targetDir, file))).length;
    return {
      id,
      label: env.label,
      targetDir,
      installed,
      total: commandFiles.length,
    };
  });

  return {
    environments,
    totalInstalled: environments.reduce((acc, item) => acc + item.installed, 0),
    totalExpected: environments.reduce((acc, item) => acc + item.total, 0),
  };
}

// ─── Agents par repo ────────────────────────────────────────────────────────

function getEnvironmentStatus(repoPath: string, id: AgentEnvironmentId): AgentEnvironmentStatus {
  const env = ENVIRONMENTS[id];
  const markerExists = existsSync(resolve(repoPath, env.markerRelativePath));
  const targetPath = resolve(repoPath, env.targetRelativePath);
  const commandFiles = Object.keys(readCommandTemplates());
  const installedCount = commandFiles.filter((file) =>
    existsSync(resolve(targetPath, file))).length;

  return {
    id,
    label: env.label,
    targetPath,
    markerExists,
    installedCount,
    totalExpected: commandFiles.length,
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
    environments,
  };
}
