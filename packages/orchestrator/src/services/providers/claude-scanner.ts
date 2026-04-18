import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { homedir } from 'os';
import { join, basename } from 'path';

import type { DetectedProject } from '@nakiros/shared';

const CLAUDE_PROJECTS_DIR = join(homedir(), '.claude', 'projects');

const INACTIVITY_THRESHOLD_DAYS = 30;

/**
 * Decode a Claude project folder name back to a filesystem path.
 * e.g. "-Users-foo-bar" → "/Users/foo/bar"
 */
function decodeProjectPath(encoded: string): string {
  const parts = encoded.split('-').filter(Boolean);
  return '/' + parts.join('/');
}

function projectNameFromPath(projectPath: string): string {
  return basename(projectPath) || projectPath;
}

function getLastConversationInfo(projectDir: string): { cwd: string | null; timestamp: string | null } {
  let jsonlFiles: string[];
  try {
    jsonlFiles = readdirSync(projectDir).filter((f) => f.endsWith('.jsonl'));
  } catch {
    return { cwd: null, timestamp: null };
  }

  if (jsonlFiles.length === 0) return { cwd: null, timestamp: null };

  const sorted = jsonlFiles
    .map((f) => {
      const full = join(projectDir, f);
      try {
        return { file: full, mtime: statSync(full).mtime.getTime() };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b!.mtime - a!.mtime) as { file: string; mtime: number }[];

  if (sorted.length === 0) return { cwd: null, timestamp: null };

  const latestFile = sorted[0].file;
  const timestamp = new Date(sorted[0].mtime).toISOString();

  try {
    const raw = readFileSync(latestFile, 'utf8');
    const firstLines = raw.split('\n').slice(0, 10);
    for (const line of firstLines) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line) as Record<string, unknown>;
        if (entry['cwd'] && typeof entry['cwd'] === 'string') {
          return { cwd: entry['cwd'], timestamp };
        }
      } catch {
        continue;
      }
    }
  } catch {
    // ignore
  }

  return { cwd: null, timestamp };
}

function countSessions(projectDir: string): number {
  try {
    return readdirSync(projectDir).filter((f) => f.endsWith('.jsonl')).length;
  } catch {
    return 0;
  }
}

function isEvalWorkspaceArtifact(projectPath: string): boolean {
  return /\/evals\/workspace\/iteration-\d+\/eval-[^/]+\/(with_skill|without_skill)\/?$/.test(projectPath);
}

function countSkills(projectPath: string): number {
  const skillsDir = join(projectPath, '.claude', 'skills');
  if (!existsSync(skillsDir)) return 0;
  try {
    return readdirSync(skillsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).length;
  } catch {
    return 0;
  }
}

export function scanClaudeProjects(
  onProgress?: (current: number, total: number, name: string | null) => void,
): DetectedProject[] {
  if (!existsSync(CLAUDE_PROJECTS_DIR)) return [];

  let entries: string[];
  try {
    entries = readdirSync(CLAUDE_PROJECTS_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return [];
  }

  const projects: DetectedProject[] = [];
  const total = entries.length;

  for (let i = 0; i < entries.length; i++) {
    const encoded = entries[i];
    const projectDir = join(CLAUDE_PROJECTS_DIR, encoded);

    onProgress?.(i + 1, total, encoded);

    const { cwd, timestamp } = getLastConversationInfo(projectDir);

    const projectPath = cwd ?? decodeProjectPath(encoded);

    if (!existsSync(projectPath)) continue;
    if (isEvalWorkspaceArtifact(projectPath)) continue;

    const sessionCount = countSessions(projectDir);
    const skillCount = countSkills(projectPath);

    if (sessionCount === 0 && skillCount === 0) continue;

    let status: 'active' | 'inactive' = 'active';
    if (timestamp) {
      const daysSinceActivity = (Date.now() - new Date(timestamp).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceActivity > INACTIVITY_THRESHOLD_DAYS) {
        status = 'inactive';
      }
    }

    projects.push({
      id: encoded,
      name: projectNameFromPath(projectPath),
      projectPath,
      provider: 'claude',
      providerProjectDir: projectDir,
      lastActivityAt: timestamp,
      sessionCount,
      skillCount,
      status,
    });
  }

  projects.sort((a, b) => {
    if (!a.lastActivityAt && !b.lastActivityAt) return 0;
    if (!a.lastActivityAt) return 1;
    if (!b.lastActivityAt) return -1;
    return new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime();
  });

  return projects;
}
