import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type {
  AgentCapability,
  Project,
  ProjectAgentInstallation,
  ProviderType,
} from '@nakiros/shared';

import { nakirosFile } from '../utils/nakiros-dir.js';
import { isProjectVisible } from './project-activity.js';
import { scanClaudeProjects } from './providers/claude-scanner.js';
import { scanCoworkProjects } from './providers/cowork-scanner.js';
import { scanCodexProjects } from './providers/codex-scanner.js';

type StoredProject = Project;

const CLAUDE_CAPABILITIES: AgentCapability[] = [
  'instructions',
  'skills',
  'rules',
  'subagents',
  'hooks',
  'permissions',
  'mcp',
  'output-styles',
  'conversations',
];

const CODEX_CAPABILITIES: AgentCapability[] = [
  'instructions',
  'skills',
  'rules',
  'subagents',
  'hooks',
  'permissions',
  'mcp',
  'native-config',
  'conversations',
];

function isProvider(value: unknown): value is ProviderType {
  return (
    value === 'claude' ||
    value === 'cowork' ||
    value === 'codex' ||
    value === 'gemini' ||
    value === 'cursor'
  );
}

function isCapability(value: unknown): value is AgentCapability {
  return (
    value === 'instructions' ||
    value === 'skills' ||
    value === 'rules' ||
    value === 'subagents' ||
    value === 'hooks' ||
    value === 'permissions' ||
    value === 'mcp' ||
    value === 'output-styles' ||
    value === 'native-config' ||
    value === 'conversations'
  );
}

function installationFor(
  provider: ProviderType,
  providerProjectDir: string,
): ProjectAgentInstallation | null {
  if (provider === 'claude' || provider === 'cowork') {
    const isCowork = provider === 'cowork';
    return {
      provider: 'claude',
      surface: isCowork ? 'cowork' : 'cli',
      providerProjectDir,
      capabilities: isCowork ? ['conversations'] : CLAUDE_CAPABILITIES,
    };
  }
  if (provider === 'codex') {
    return {
      provider: 'codex',
      surface: 'cli',
      providerProjectDir,
      capabilities: CODEX_CAPABILITIES,
    };
  }
  return null;
}

/** Build the additive installation list for legacy single-provider records. */
function legacyInstallation(
  project: Pick<StoredProject, 'provider' | 'providerProjectDir'>,
): ProjectAgentInstallation | null {
  return installationFor(project.provider, project.providerProjectDir);
}

function hasProjectCodexSignal(projectPath: string): boolean {
  return (
    existsSync(resolve(projectPath, '.codex', 'config.toml')) ||
    existsSync(resolve(projectPath, '.codex', 'rules')) ||
    existsSync(resolve(projectPath, '.codex', 'agents')) ||
    existsSync(resolve(projectPath, '.codex', 'hooks.json')) ||
    existsSync(resolve(projectPath, '.agents', 'skills')) ||
    existsSync(resolve(projectPath, 'AGENTS.md'))
  );
}

/**
 * Add or refresh the Codex installation inferred from project-native files.
 * This lets projects without rollout sessions expose native Codex settings.
 */
export function enrichProjectCodexInstallation<
  T extends { projectPath: string; agents?: ProjectAgentInstallation[] },
>(project: T): T {
  const agents = project.agents ?? [];
  const hasCodexInstallation = agents.some((agent) => agent.provider === 'codex');

  if (hasCodexInstallation) {
    return {
      ...project,
      agents: agents.map((agent) =>
        agent.provider === 'codex'
          ? { ...agent, capabilities: Array.from(new Set([...agent.capabilities, ...CODEX_CAPABILITIES])) }
          : agent,
      ),
    };
  }

  if (!hasProjectCodexSignal(project.projectPath)) return project;
  return {
    ...project,
    agents: [
      ...agents,
      {
        provider: 'codex',
        surface: 'cli',
        providerProjectDir: resolve(project.projectPath, '.codex'),
        capabilities: CODEX_CAPABILITIES,
      },
    ],
  };
}

function normalizeProject<
  T extends Pick<StoredProject, 'projectPath' | 'provider' | 'providerProjectDir'> & {
    agents?: ProjectAgentInstallation[];
  },
>(
  project: T,
): T {
  if (project.agents?.length) return enrichProjectCodexInstallation(project);
  const installation = legacyInstallation(project);
  return enrichProjectCodexInstallation(
    installation ? { ...project, agents: [installation] } : project,
  );
}

/**
 * Normalize persisted projects across the two historical registry schemas.
 * The intermediate multi-provider schema stored `providers` and
 * `providerProjectDirs`, but omitted the legacy primary fields still consumed
 * by the daemon. Extra persisted fields are deliberately retained.
 */
export function normalizeStoredProject(value: unknown): StoredProject | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (typeof record['id'] !== 'string' || typeof record['projectPath'] !== 'string') return null;

  const providerDirsValue = record['providerProjectDirs'];
  const providerDirs =
    providerDirsValue && typeof providerDirsValue === 'object'
      ? (providerDirsValue as Record<string, unknown>)
      : {};
  const listedProviders = Array.isArray(record['providers'])
    ? record['providers'].filter(isProvider)
    : [];

  const persistedAgents = Array.isArray(record['agents'])
    ? record['agents'].filter((agent): agent is ProjectAgentInstallation => {
        if (!agent || typeof agent !== 'object') return false;
        const candidate = agent as Record<string, unknown>;
        return (
          (candidate['provider'] === 'claude' ||
            candidate['provider'] === 'codex' ||
            candidate['provider'] === 'gemini' ||
            candidate['provider'] === 'cursor') &&
          (candidate['surface'] === 'cli' || candidate['surface'] === 'cowork') &&
          typeof candidate['providerProjectDir'] === 'string' &&
          Array.isArray(candidate['capabilities']) &&
          candidate['capabilities'].every(isCapability)
        );
      })
    : [];

  const migratedAgents: ProjectAgentInstallation[] = [];
  for (const provider of listedProviders) {
    const dir = providerDirs[provider];
    if (typeof dir !== 'string' || !dir) continue;
    const installation = installationFor(provider, dir);
    if (installation) migratedAgents.push(installation);
  }

  const explicitProvider = isProvider(record['provider']) ? record['provider'] : null;
  const explicitDir = typeof record['providerProjectDir'] === 'string' ? record['providerProjectDir'] : null;
  const firstListedWithDir = listedProviders.find(
    (provider) => typeof providerDirs[provider] === 'string' && providerDirs[provider] !== '',
  );
  const firstAgent = persistedAgents[0] ?? migratedAgents[0];
  const primaryProvider: ProviderType | null =
    explicitProvider ??
    firstListedWithDir ??
    (firstAgent
      ? firstAgent.provider === 'claude' && firstAgent.surface === 'cowork'
        ? 'cowork'
        : firstAgent.provider
      : null);
  const primaryDir =
    explicitDir ??
    (primaryProvider && typeof providerDirs[primaryProvider] === 'string'
      ? (providerDirs[primaryProvider] as string)
      : firstAgent?.providerProjectDir);
  if (!primaryProvider || !primaryDir) return null;

  const normalized = {
    ...record,
    provider: primaryProvider,
    providerProjectDir: primaryDir,
    agents: mergeInstallations(persistedAgents, migratedAgents),
  } as unknown as StoredProject;
  return normalizeProject(normalized);
}

function canonicalProjectPath(projectPath: string): string {
  try {
    return realpathSync(projectPath);
  } catch {
    return resolve(projectPath);
  }
}

function mergeInstallations(
  current: ProjectAgentInstallation[] | undefined,
  incoming: ProjectAgentInstallation[] | undefined,
): ProjectAgentInstallation[] | undefined {
  const installations = new Map<string, ProjectAgentInstallation>();
  for (const installation of [...(current ?? []), ...(incoming ?? [])]) {
    installations.set(`${installation.provider}:${installation.surface}`, installation);
  }
  return installations.size > 0 ? Array.from(installations.values()) : undefined;
}

function latestActivity(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

/**
 * Patterns of project paths to purge from the registry. Typically artifacts
 * from Nakiros eval runs auto-recorded by Claude under ~/.claude/projects/.
 */
const PURGE_PATH_PATTERNS: RegExp[] = [
  /\/evals\/workspace\/iteration-\d+\/eval-[^/]+\/(with_skill|without_skill)\/?$/,
  // Comparison evals: …/evals/comparisons/<ISO-timestamp>/<model>/eval-<name>/(with|without)_skill
  /\/evals\/comparisons\/[^/]+\/[^/]+\/eval-[^/]+\/(with_skill|without_skill)\/?$/,
];

function isObsoletePath(projectPath: string): boolean {
  return PURGE_PATH_PATTERNS.some((re) => re.test(projectPath));
}

function storagePath(): string {
  return nakirosFile('projects.json');
}

function readAll(): StoredProject[] {
  const path = storagePath();
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as unknown;
    return Array.isArray(parsed)
      ? parsed
          .map(normalizeStoredProject)
          .filter((project): project is StoredProject => project !== null)
      : [];
  } catch {
    return [];
  }
}

function writeAll(projects: StoredProject[]): void {
  writeFileSync(storagePath(), JSON.stringify(projects, null, 2), 'utf-8');
}

function stripInternal(p: StoredProject): Project {
  // `status` stays — it's part of the shared Project type
  return p;
}

/**
 * Scan every provider's project directory for tracked projects, merge with the
 * persisted registry, and write the result back. Dismissed projects stay
 * dismissed across scans; obsolete paths (eval iteration artifacts
 * auto-recorded by Claude) are purged.
 *
 * @param onProgress - optional progress callback: `(provider, current, total, projectName)`
 * @returns recent, non-dismissed projects surfaced to the UI
 */
export function scan(
  onProgress?: (provider: ProviderType, current: number, total: number, name: string | null) => void,
): Project[] {
  const now = new Date().toISOString();
  const existing = readAll();

  const kept = existing.filter((p) => !isObsoletePath(p.projectPath));
  const dismissedIds = new Set(kept.filter((p) => p.status === 'dismissed').map((p) => p.id));

  const claudeDetected = scanClaudeProjects((c, t, n) => onProgress?.('claude', c, t, n));
  const coworkDetected = scanCoworkProjects((c, t, n) => onProgress?.('cowork', c, t, n));
  const codexDetected = scanCodexProjects((c, t, n) => onProgress?.('codex', c, t, n));
  const detected = [...claudeDetected, ...coworkDetected, ...codexDetected];

  const byId = new Map<string, StoredProject>();
  for (const p of kept) byId.set(p.id, p);
  const idByPath = new Map(
    kept.map((project) => [canonicalProjectPath(project.projectPath), project.id]),
  );
  const detectedPaths = new Set<string>();

  for (const detectedProject of detected) {
    const canonicalPath = canonicalProjectPath(detectedProject.projectPath);
    const existingId = idByPath.get(canonicalPath);
    const projectId = existingId ?? detectedProject.id;
    if (dismissedIds.has(projectId) || dismissedIds.has(detectedProject.id)) continue;
    const prior = byId.get(projectId);
    const alreadyDetected = detectedPaths.has(canonicalPath);
    const normalizedDetected = normalizeProject(detectedProject);
    byId.set(projectId, {
      ...normalizedDetected,
      // Keep the stable identity and legacy primary provider fields. New
      // providers are additive installations on the same path.
      id: projectId,
      provider: prior?.provider ?? normalizedDetected.provider,
      providerProjectDir: prior?.providerProjectDir ?? normalizedDetected.providerProjectDir,
      agents: mergeInstallations(prior?.agents, normalizedDetected.agents),
      lastActivityAt: alreadyDetected
        ? latestActivity(prior?.lastActivityAt ?? null, normalizedDetected.lastActivityAt)
        : normalizedDetected.lastActivityAt,
      sessionCount: alreadyDetected
        ? (prior?.sessionCount ?? 0) + normalizedDetected.sessionCount
        : normalizedDetected.sessionCount,
      skillCount: alreadyDetected
        ? Math.max(prior?.skillCount ?? 0, normalizedDetected.skillCount)
        : normalizedDetected.skillCount,
      status:
        alreadyDetected && prior?.status === 'active' ? 'active' : normalizedDetected.status,
      lastScannedAt: now,
      createdAt: prior?.createdAt ?? now,
    });
    idByPath.set(canonicalPath, projectId);
    detectedPaths.add(canonicalPath);
  }

  const all = Array.from(byId.values());
  writeAll(all);

  return all.filter((project) => isProjectVisible(project)).map(stripInternal);
}

/** Return recent, non-dismissed projects from the persisted registry (no re-scan). */
export function listProjects(): Project[] {
  return readAll().filter((project) => isProjectVisible(project)).map(stripInternal);
}

/** Look up a project by id in the persisted registry. Returns `null` when unknown. */
export function getProject(id: string): Project | null {
  const project = readAll().find((p) => p.id === id);
  return project ? stripInternal(project) : null;
}

/** Mark a project as `dismissed` so it stops appearing in `listProjects` / `scan` results. */
export function dismissProject(id: string): void {
  const all = readAll();
  const idx = all.findIndex((p) => p.id === id);
  if (idx < 0) return;
  all[idx] = { ...all[idx], status: 'dismissed' };
  writeAll(all);
}

/**
 * Return every dismissed project from the persisted registry. Used by the home
 * screen's "Show dismissed" panel so users can restore a project they
 * previously hid.
 */
export function listDismissedProjects(): Project[] {
  return readAll().filter((p) => p.status === 'dismissed').map(stripInternal);
}

/**
 * Flip a previously-dismissed project back to `active`. Returns the restored
 * project, or `null` when the id is unknown / already active. Restoration only
 * lasts until the next scan unless the project is still detected on disk —
 * `scan()` would skip dismissed entries entirely, so undoing the dismissal is
 * the only way to make the project re-appear.
 */
export function undismissProject(id: string): Project | null {
  const all = readAll();
  const idx = all.findIndex((p) => p.id === id);
  if (idx < 0) return null;
  if (all[idx].status === 'active') return stripInternal(all[idx]);
  all[idx] = { ...all[idx], status: 'active' };
  writeAll(all);
  return stripInternal(all[idx]);
}

/** True when at least one recent, non-dismissed project exists. */
export function hasProjects(): boolean {
  return readAll().some((project) => isProjectVisible(project));
}
