import { createHash } from 'node:crypto';
import { closeSync, existsSync, openSync, readSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';

import type { AgentCapability, DetectedProject } from '@nakiros/shared';

import { projectStatusFromActivity } from '../project-activity.js';
import { isCodexSubagentThreadSource } from './codex-session.js';

const CODEX_SESSIONS_DIR = join(homedir(), '.codex', 'sessions');
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

interface CodexSessionMeta {
  cwd: string;
}

function listJsonlFiles(dir: string): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const files: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listJsonlFiles(path));
    else if (entry.isFile() && entry.name.endsWith('.jsonl')) files.push(path);
  }
  return files;
}

function readSessionMeta(path: string): CodexSessionMeta | null {
  let fd: number | null = null;
  try {
    fd = openSync(path, 'r');
    const buffer = Buffer.alloc(64 * 1024);
    const bytesRead = readSync(fd, buffer, 0, buffer.length, 0);
    const firstLine = buffer.toString('utf8', 0, bytesRead).split('\n', 1)[0];
    if (!firstLine) return null;
    const entry = JSON.parse(firstLine) as Record<string, unknown>;
    if (entry['type'] !== 'session_meta') return null;
    const payload = entry['payload'];
    if (!payload || typeof payload !== 'object') return null;
    const cwd = (payload as Record<string, unknown>)['cwd'];
    if (typeof cwd !== 'string' || !cwd) return null;
    const threadSource = (payload as Record<string, unknown>)['thread_source'];
    if (isCodexSubagentThreadSource(threadSource)) return null;
    return { cwd };
  } catch {
    return null;
  } finally {
    if (fd !== null) closeSync(fd);
  }
}

function codexProjectId(projectPath: string): string {
  const digest = createHash('sha256').update(projectPath).digest('hex').slice(0, 16);
  return `codex-${digest}`;
}

/**
 * Scan Codex rollout files and group sessions by their session metadata cwd.
 * Codex stores all projects below one global sessions tree, so the installation
 * points at that tree; individual transcript paths remain authoritative later.
 */
export function scanCodexProjects(
  onProgress?: (current: number, total: number, name: string | null) => void,
): DetectedProject[] {
  if (!existsSync(CODEX_SESSIONS_DIR)) return [];

  const files = listJsonlFiles(CODEX_SESSIONS_DIR);
  const grouped = new Map<string, { count: number; latest: string | null }>();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const meta = readSessionMeta(file);
    onProgress?.(i + 1, files.length, meta ? basename(meta.cwd) : null);
    if (!meta || !existsSync(meta.cwd)) continue;
    if (meta.cwd.startsWith(join(homedir(), '.nakiros'))) continue;
    if (meta.cwd.startsWith(join(homedir(), '.codex', 'tmp'))) continue;

    let timestamp: string | null = null;
    try {
      timestamp = statSync(file).mtime.toISOString();
    } catch {
      timestamp = null;
    }

    const prior = grouped.get(meta.cwd);
    grouped.set(meta.cwd, {
      count: (prior?.count ?? 0) + 1,
      latest:
        !prior?.latest || (timestamp && new Date(timestamp).getTime() > new Date(prior.latest).getTime())
          ? timestamp
          : prior.latest,
    });
  }

  return Array.from(grouped, ([projectPath, activity]): DetectedProject => {
    return {
      id: codexProjectId(projectPath),
      name: basename(projectPath) || projectPath,
      projectPath,
      provider: 'codex',
      providerProjectDir: CODEX_SESSIONS_DIR,
      agents: [
        {
          provider: 'codex',
          surface: 'cli',
          providerProjectDir: CODEX_SESSIONS_DIR,
          capabilities: CODEX_CAPABILITIES,
        },
      ],
      lastActivityAt: activity.latest,
      sessionCount: activity.count,
      skillCount: 0,
      status: projectStatusFromActivity(activity.latest),
    };
  }).sort((a, b) => {
    if (!a.lastActivityAt) return 1;
    if (!b.lastActivityAt) return -1;
    return new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime();
  });
}
