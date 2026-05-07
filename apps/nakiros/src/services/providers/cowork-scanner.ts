import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { homedir } from 'os';
import { join, basename } from 'path';

import type { DetectedProject } from '@nakiros/shared';

/**
 * Root directory where Cowork stores its session data. Each child is a
 * `<spaceId>` UUID directory; under it sits one or more `<userId>` UUID dirs,
 * each containing a `spaces.json` and one `local_<uuid>/` directory per
 * session group.
 */
const COWORK_ROOT = join(
  homedir(),
  'Library',
  'Application Support',
  'Claude',
  'local-agent-mode-sessions',
);

const INACTIVITY_THRESHOLD_DAYS = 30;

const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface CoworkSpaceFolder {
  path: string;
}

interface CoworkSpace {
  id: string;
  name: string;
  folders: CoworkSpaceFolder[];
}

interface CoworkSpacesJson {
  spaces: CoworkSpace[];
}

interface CoworkGroupSidecar {
  sessionId?: string;
  cwd?: string;
  userSelectedFolders?: string[];
  lastActivityAt?: string;
  title?: string;
}

function readJsonSafe<T>(filePath: string): T | null {
  try {
    const raw = readFileSync(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * List `local_<uuid>` subdirectory names inside a user directory. Also
 * returns the group names without the `.json` extension for sidecar files.
 */
function listGroupNames(userDir: string): string[] {
  try {
    return readdirSync(userDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name.startsWith('local_'))
      .map((e) => e.name);
  } catch {
    return [];
  }
}

/**
 * Count `.jsonl` session files aggregated from all matching group directories
 * for a space, and find the latest mtime across them.
 */
function countSessionsAndMtime(
  userDir: string,
  groupNames: string[],
): { sessionCount: number; lastMtime: number } {
  let sessionCount = 0;
  let lastMtime = 0;

  for (const groupName of groupNames) {
    const projectsBase = join(userDir, groupName, '.claude', 'projects');
    if (!existsSync(projectsBase)) continue;

    let encodedDirs: string[];
    try {
      encodedDirs = readdirSync(projectsBase, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name);
    } catch {
      continue;
    }

    for (const enc of encodedDirs) {
      const sessDir = join(projectsBase, enc);
      let files: string[];
      try {
        files = readdirSync(sessDir).filter((f) => f.endsWith('.jsonl'));
      } catch {
        continue;
      }
      sessionCount += files.length;
      for (const f of files) {
        try {
          const mtime = statSync(join(sessDir, f)).mtime.getTime();
          if (mtime > lastMtime) lastMtime = mtime;
        } catch {
          // ignore
        }
      }
    }
  }

  return { sessionCount, lastMtime };
}

/**
 * Scan `~/Library/Application Support/Claude/local-agent-mode-sessions/` for
 * Cowork spaces. Each `spaces.json` found under `<spaceId>/<userId>/` is the
 * authority for that user's spaces. All `local_<uuid>` session groups are
 * matched to spaces via their `userSelectedFolders` sidecar field.
 *
 * One space = one Nakiros project. The stable id is `cowork:<spaceId>`.
 * Sessions from all matched groups are aggregated under the space.
 *
 * @param onProgress - optional progress callback: `(current, total, name)`
 */
export function scanCoworkProjects(
  onProgress?: (current: number, total: number, name: string | null) => void,
): DetectedProject[] {
  if (!existsSync(COWORK_ROOT)) return [];

  // Enumerate all <spaceId>/<userId> pairs that contain a spaces.json.
  const userDirCandidates: { spaceId: string; userId: string; userDir: string }[] = [];

  let spaceIdDirs: string[];
  try {
    spaceIdDirs = readdirSync(COWORK_ROOT, { withFileTypes: true })
      .filter((e) => e.isDirectory() && isUuid.test(e.name))
      .map((e) => e.name);
  } catch {
    return [];
  }

  for (const spaceId of spaceIdDirs) {
    const spaceDir = join(COWORK_ROOT, spaceId);
    let userIdDirs: string[];
    try {
      userIdDirs = readdirSync(spaceDir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && isUuid.test(e.name))
        .map((e) => e.name);
    } catch {
      continue;
    }
    for (const userId of userIdDirs) {
      const userDir = join(spaceDir, userId);
      const spacesJson = join(userDir, 'spaces.json');
      if (existsSync(spacesJson)) {
        userDirCandidates.push({ spaceId, userId, userDir });
      }
    }
  }

  // Gather all spaces across all user dirs. Use a map keyed on spaceId to
  // deduplicate (multiple userId dirs can reference the same space).
  const spaceMap = new Map<
    string,
    {
      space: CoworkSpace;
      userDir: string;
    }
  >();

  for (const { userDir } of userDirCandidates) {
    const spacesJson = join(userDir, 'spaces.json');
    const parsed = readJsonSafe<CoworkSpacesJson>(spacesJson);
    if (!parsed || !Array.isArray(parsed.spaces)) continue;

    for (const space of parsed.spaces) {
      if (!space.id || !Array.isArray(space.folders) || space.folders.length === 0) continue;
      if (!spaceMap.has(space.id)) {
        spaceMap.set(space.id, { space, userDir });
      }
    }
  }

  const spacesArray = Array.from(spaceMap.values());
  const total = spacesArray.length;
  const projects: DetectedProject[] = [];

  for (let i = 0; i < spacesArray.length; i++) {
    const { space, userDir } = spacesArray[i];

    onProgress?.(i + 1, total, space.name ?? null);

    const projectPath = space.folders[0].path;

    // Find all local_<uuid> groups in this userDir whose sidecar includes
    // at least one of the space's folder paths.
    const spaceFolderPaths = new Set(space.folders.map((f) => f.path));
    const groupNames = listGroupNames(userDir);
    const matchedGroups: string[] = [];

    for (const groupName of groupNames) {
      const sidecarPath = join(userDir, `${groupName}.json`);
      const sidecar = readJsonSafe<CoworkGroupSidecar>(sidecarPath);
      if (!sidecar) continue;
      const selected = sidecar.userSelectedFolders ?? [];
      if (selected.some((f) => spaceFolderPaths.has(f))) {
        matchedGroups.push(groupName);
      }
    }

    const { sessionCount, lastMtime } = countSessionsAndMtime(userDir, matchedGroups);

    // Skip spaces that have no sessions recorded yet.
    if (sessionCount === 0) continue;

    const lastActivityAt = lastMtime > 0 ? new Date(lastMtime).toISOString() : null;

    let status: 'active' | 'inactive' = 'active';
    if (lastActivityAt) {
      const daysSinceActivity =
        (Date.now() - new Date(lastActivityAt).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceActivity > INACTIVITY_THRESHOLD_DAYS) {
        status = 'inactive';
      }
    }

    projects.push({
      id: `cowork:${space.id}`,
      name: space.name ?? basename(projectPath) ?? space.id,
      projectPath,
      provider: 'cowork',
      providerProjectDir: userDir,
      lastActivityAt,
      sessionCount,
      // Cowork projects don't store skills inside space.folders[0]; skill audits
      // will only find skills if the user happens to have a .claude/skills/ dir there.
      skillCount: 0,
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
