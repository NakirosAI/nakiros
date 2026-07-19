import { randomUUID } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

import type {
  CodexConfigFile,
  CodexConfigMutationResult,
  CodexConfigReadResult,
} from '@nakiros/shared';
import { parseTOML } from 'confbox';

/** Resolve the project-scoped Codex configuration path. */
export function codexConfigPath(projectPath: string): string {
  return join(projectPath, '.codex', 'config.toml');
}

function absentConfig(path: string): CodexConfigFile {
  return {
    content: '',
    mtime: '',
    exists: false,
    path,
  };
}

function isSymbolicLink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

function hasUnsafeConfigPath(path: string): boolean {
  return isSymbolicLink(dirname(path)) || isSymbolicLink(path);
}

/** Read `.codex/config.toml` without normalising its TOML source. */
export function readCodexConfig(projectPath: string): CodexConfigReadResult {
  const path = codexConfigPath(projectPath);

  try {
    if (hasUnsafeConfigPath(path)) {
      return {
        ok: false,
        code: 'unsafe-path',
        message: 'Codex config path must not contain symbolic links.',
      };
    }
    if (!existsSync(path)) return { ok: true, file: absentConfig(path) };

    return {
      ok: true,
      file: {
        content: readFileSync(path, 'utf8'),
        mtime: statSync(path).mtime.toISOString(),
        exists: true,
        path,
      },
    };
  } catch (error) {
    return {
      ok: false,
      code: 'read-failed',
      message: error instanceof Error ? error.message : 'Unable to read Codex config.',
    };
  }
}

/**
 * Validate and save `.codex/config.toml`, preserving the submitted TOML text.
 *
 * An empty `mtimeAtRead` represents an absent file. It conflicts if another
 * process creates the file before save, just as a non-empty token conflicts
 * when the file is changed or removed after read.
 */
export function saveCodexConfig(
  projectPath: string,
  content: string,
  mtimeAtRead: string,
): CodexConfigMutationResult {
  const path = codexConfigPath(projectPath);
  let exists: boolean;
  try {
    if (hasUnsafeConfigPath(path)) {
      return {
        ok: false,
        code: 'unsafe-path',
        message: 'Codex config path must not contain symbolic links.',
      };
    }
    exists = existsSync(path);
  } catch (error) {
    return {
      ok: false,
      code: 'write-failed',
      message: error instanceof Error ? error.message : 'Unable to inspect Codex config path.',
    };
  }

  if (exists !== Boolean(mtimeAtRead)) {
    return {
      ok: false,
      code: 'conflict',
      message: 'Codex config was modified externally.',
    };
  }

  if (exists) {
    try {
      if (statSync(path).mtime.toISOString() !== mtimeAtRead) {
        return {
          ok: false,
          code: 'conflict',
          message: 'Codex config was modified externally.',
        };
      }
    } catch {
      return {
        ok: false,
        code: 'conflict',
        message: 'Codex config was modified externally.',
      };
    }
  }

  try {
    parseTOML(content);
  } catch (error) {
    return {
      ok: false,
      code: 'invalid-toml',
      message: error instanceof Error ? error.message : 'Invalid TOML in Codex config.',
    };
  }

  let temporaryPath = '';
  try {
    mkdirSync(dirname(path), { recursive: true });
    if (hasUnsafeConfigPath(path)) {
      return {
        ok: false,
        code: 'unsafe-path',
        message: 'Codex config path must not contain symbolic links.',
      };
    }
    temporaryPath = join(dirname(path), `.config.toml.${randomUUID()}.tmp`);
    writeFileSync(temporaryPath, content, { encoding: 'utf8', flag: 'wx' });
    renameSync(temporaryPath, path);
    temporaryPath = '';
  } catch (error) {
    return {
      ok: false,
      code: 'write-failed',
      message: error instanceof Error ? error.message : 'Unable to write Codex config.',
    };
  } finally {
    if (temporaryPath) {
      try {
        unlinkSync(temporaryPath);
      } catch {
        // Best-effort cleanup after a failed atomic replacement.
      }
    }
  }

  const result = readCodexConfig(projectPath);
  if (!result.ok) {
    return { ok: false, code: 'write-failed', message: result.message };
  }
  return result;
}
