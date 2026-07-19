import { randomUUID } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import type {
  CodexResourceFile,
  CodexResourceKind,
  CodexResourceMutationResult,
  CodexResourceReadResult,
  CodexResourceSummary,
} from '@nakiros/shared';
import { parseTOML } from 'confbox';

import { codexMcpConfigurationAdapter } from './provider-configuration/index.js';

const SKIPPED_DIRECTORIES = new Set(['.git', '.turbo', 'dist', 'node_modules']);
const SIMPLE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

interface ResourceLocation {
  id: string;
  path: string;
  name: string;
}

function slash(path: string): string {
  return path.split(sep).join('/');
}

function fail(
  code: Exclude<CodexResourceReadResult, { ok: true }>['code'],
  message: string,
  currentMtime?: string,
): CodexResourceMutationResult {
  return { ok: false, code, message, currentMtime };
}

function canonicalSingleton(kind: CodexResourceKind): ResourceLocation | null {
  if (kind === 'hooks') return { id: 'hooks', path: '.codex/hooks.json', name: 'hooks' };
  if (kind === 'native-config') {
    return { id: 'config', path: '.codex/config.toml', name: 'config' };
  }
  if (kind === 'permissions' || kind === 'mcp') {
    return { id: kind, path: '.codex/config.toml', name: kind };
  }
  return null;
}

function locationFor(kind: CodexResourceKind, id?: string): ResourceLocation | null {
  const singleton = canonicalSingleton(kind);
  if (singleton) return !id || id === singleton.id || id === singleton.path ? singleton : null;
  if (!id || isAbsolute(id) || id.includes('\\') || id.split('/').includes('..')) return null;

  const normalized = id.replace(/^\.\//, '');
  if (kind === 'instructions') {
    const file = basename(normalized);
    if (file !== 'AGENTS.md' && file !== 'AGENTS.override.md') return null;
    return { id: normalized, path: normalized, name: file };
  }

  if (kind === 'rules') {
    const name = normalized.startsWith('.codex/rules/')
      ? basename(normalized, '.rules')
      : normalized.replace(/\.rules$/, '');
    if (!SIMPLE_NAME.test(name)) return null;
    return { id: `.codex/rules/${name}.rules`, path: `.codex/rules/${name}.rules`, name };
  }

  if (kind === 'subagents') {
    const name = normalized.startsWith('.codex/agents/')
      ? basename(normalized, '.toml')
      : normalized.replace(/\.toml$/, '');
    if (!SIMPLE_NAME.test(name)) return null;
    return { id: `.codex/agents/${name}.toml`, path: `.codex/agents/${name}.toml`, name };
  }

  if (kind === 'skills') {
    const match = /^(?:\.agents\/skills\/)?([^/]+)(?:\/SKILL\.md)?$/.exec(normalized);
    const name = match?.[1];
    if (!name || !SIMPLE_NAME.test(name)) return null;
    const path = `.agents/skills/${name}/SKILL.md`;
    return { id: path, path, name };
  }
  return null;
}

function safeAbsolute(projectPath: string, projectRelativePath: string): string | null {
  const root = resolve(projectPath);
  const target = resolve(root, projectRelativePath);
  if (target !== root && !target.startsWith(root + sep)) return null;

  let cursor = root;
  for (const component of relative(root, target).split(sep).filter(Boolean)) {
    cursor = join(cursor, component);
    try {
      if (lstatSync(cursor).isSymbolicLink()) return null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') break;
      throw error;
    }
  }
  return target;
}

function summary(kind: CodexResourceKind, location: ResourceLocation): CodexResourceSummary {
  return { kind, id: location.id, name: location.name, path: location.path };
}

const PERMISSION_KEYS = new Set(['approval_policy', 'sandbox_mode']);

function isTableHeader(line: string): boolean {
  return /^\s*\[\[?[^\]]+\]\]?\s*(?:#.*)?$/.test(line);
}

function tableName(line: string): string | null {
  const match = /^\s*\[\[?([^\]]+)\]\]?\s*(?:#.*)?$/.exec(line);
  return match?.[1]?.trim() ?? null;
}

/** Split config.toml into a provider-specific editable slice and preserved remainder. */
function splitConfigSection(content: string, kind: 'permissions' | 'mcp'): {
  selected: string;
  preserved: string;
} {
  const lines = content.split(/(?<=\n)/);
  const selected: string[] = [];
  const preserved: string[] = [];
  let selectedTable = false;
  for (const line of lines) {
    const table = tableName(line);
    if (table !== null) {
      selectedTable = kind === 'mcp'
        ? table === 'mcp_servers' || table.startsWith('mcp_servers.')
        : table === 'sandbox_workspace_write';
    }
    const topLevelPermission =
      kind === 'permissions' &&
      !selectedTable &&
      !isTableHeader(line) &&
      PERMISSION_KEYS.has(/^\s*([A-Za-z0-9_-]+)\s*=/.exec(line)?.[1] ?? '');
    (selectedTable || topLevelPermission ? selected : preserved).push(line);
  }
  return { selected: selected.join('').trim(), preserved: preserved.join('').trimEnd() };
}

function mergeConfigSection(
  original: string,
  kind: 'permissions' | 'mcp',
  replacement: string,
): string {
  const { preserved } = splitConfigSection(original, kind);
  const parts = [preserved.trimEnd(), replacement.trim()].filter(Boolean);
  return parts.length === 0 ? '' : `${parts.join('\n\n')}\n`;
}

function walkInstructions(projectPath: string, directory = projectPath): ResourceLocation[] {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  const found: ResourceLocation[] = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) found.push(...walkInstructions(projectPath, absolute));
    } else if (entry.isFile() && (entry.name === 'AGENTS.md' || entry.name === 'AGENTS.override.md')) {
      const id = slash(relative(projectPath, absolute));
      found.push({ id, path: id, name: entry.name });
    }
  }
  return found;
}

function listFiles(
  projectPath: string,
  kind: 'rules' | 'subagents',
  directory: string,
  extension: string,
): ResourceLocation[] {
  let entries;
  try {
    entries = readdirSync(join(projectPath, directory), { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => !entry.isSymbolicLink() && entry.isFile() && entry.name.endsWith(extension))
    .map((entry) => locationFor(kind, `${directory}/${entry.name}`))
    .filter((entry): entry is ResourceLocation => entry !== null);
}

function listSkills(projectPath: string): ResourceLocation[] {
  const root = join(projectPath, '.agents', 'skills');
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => !entry.isSymbolicLink() && entry.isDirectory())
    .map((entry) => locationFor('skills', entry.name))
    .filter((entry): entry is ResourceLocation => {
      if (!entry) return false;
      const absolute = safeAbsolute(projectPath, entry.path);
      return absolute !== null && existsSync(absolute);
    });
}

/** List provider-native resources without following symbolic links. */
export function listCodexResources(
  projectPath: string,
  kind: CodexResourceKind,
): CodexResourceSummary[] {
  let locations: ResourceLocation[];
  if (kind === 'instructions') locations = walkInstructions(projectPath);
  else if (kind === 'rules') locations = listFiles(projectPath, kind, '.codex/rules', '.rules');
  else if (kind === 'subagents') locations = listFiles(projectPath, kind, '.codex/agents', '.toml');
  else if (kind === 'skills') locations = listSkills(projectPath);
  else locations = [canonicalSingleton(kind)].filter((item): item is ResourceLocation => item !== null);
  return locations.map((item) => summary(kind, item)).sort((a, b) => a.path.localeCompare(b.path));
}

export function readCodexResource(
  projectPath: string,
  kind: CodexResourceKind,
  id?: string,
): CodexResourceReadResult {
  const location = locationFor(kind, id);
  if (!location) return fail('invalid-id', 'Invalid Codex resource identifier.');
  const absolute = safeAbsolute(projectPath, location.path);
  if (!absolute) return fail('unsafe-path', 'Codex resource paths must not contain symbolic links.');
  if (!existsSync(absolute)) {
    return { ok: true, file: { ...summary(kind, location), content: '', exists: false, mtime: '' } };
  }
  try {
    const rawContent = readFileSync(absolute, 'utf8');
    const section = kind === 'permissions' || kind === 'mcp'
      ? splitConfigSection(rawContent, kind).selected
      : rawContent;
    return {
      ok: true,
      file: {
        ...summary(kind, location),
        content: section,
        exists: kind === 'permissions' || kind === 'mcp' ? section.length > 0 : true,
        mtime: statSync(absolute).mtime.toISOString(),
      },
    };
  } catch (error) {
    return fail('read-failed', error instanceof Error ? error.message : 'Unable to read Codex resource.');
  }
}

function validateContent(kind: CodexResourceKind, content: string): CodexResourceMutationResult | null {
  if (kind === 'hooks') {
    try {
      JSON.parse(content);
    } catch (error) {
      return fail('invalid-json', error instanceof Error ? error.message : 'Invalid JSON.');
    }
  }
  if (kind === 'subagents' || kind === 'native-config' || kind === 'permissions' || kind === 'mcp') {
    try {
      parseTOML(content);
    } catch (error) {
      return fail('invalid-toml', error instanceof Error ? error.message : 'Invalid TOML.');
    }
  }
  if (kind === 'mcp') {
    const parsed = codexMcpConfigurationAdapter.parse(content);
    if (!parsed.ok) {
      return fail(
        'invalid-configuration',
        parsed.diagnostics.map((diagnostic) => diagnostic.message).join('\n'),
      );
    }
  }
  return null;
}

function lockedMtime(path: string, mtimeAtRead: string): string | null {
  if (!existsSync(path)) return mtimeAtRead === '' ? null : '__conflict__';
  const current = statSync(path).mtime.toISOString();
  return current === mtimeAtRead ? null : current;
}

/** Create or replace a resource atomically with an optimistic mtime guard. */
export function saveCodexResource(
  projectPath: string,
  kind: CodexResourceKind,
  id: string | undefined,
  content: string,
  mtimeAtRead: string,
): CodexResourceMutationResult {
  const location = locationFor(kind, id);
  if (!location) return fail('invalid-id', 'Invalid Codex resource identifier.');
  let absolute: string | null;
  try {
    absolute = safeAbsolute(projectPath, location.path);
  } catch (error) {
    return fail('write-failed', error instanceof Error ? error.message : 'Unable to inspect resource path.');
  }
  if (!absolute) return fail('unsafe-path', 'Codex resource paths must not contain symbolic links.');
  let conflict: string | null;
  try {
    conflict = lockedMtime(absolute, mtimeAtRead);
  } catch (error) {
    return fail('write-failed', error instanceof Error ? error.message : 'Unable to inspect resource.');
  }
  if (conflict !== null) return fail('conflict', 'Codex resource was modified externally.', conflict);
  const validation = validateContent(kind, content);
  if (validation) return validation;

  let contentToWrite = content;
  if (kind === 'permissions' || kind === 'mcp') {
    let original = '';
    try {
      if (existsSync(absolute)) original = readFileSync(absolute, 'utf8');
      contentToWrite = mergeConfigSection(original, kind, content);
      parseTOML(contentToWrite);
    } catch (error) {
      return fail('invalid-toml', error instanceof Error ? error.message : 'Invalid merged TOML.');
    }
  }

  let temporaryPath = '';
  try {
    mkdirSync(dirname(absolute), { recursive: true });
    if (!safeAbsolute(projectPath, location.path)) {
      return fail('unsafe-path', 'Codex resource paths must not contain symbolic links.');
    }
    temporaryPath = join(dirname(absolute), `.${basename(absolute)}.${randomUUID()}.tmp`);
    writeFileSync(temporaryPath, contentToWrite, { encoding: 'utf8', flag: 'wx' });
    renameSync(temporaryPath, absolute);
    temporaryPath = '';
  } catch (error) {
    return fail('write-failed', error instanceof Error ? error.message : 'Unable to write resource.');
  } finally {
    if (temporaryPath) {
      try { unlinkSync(temporaryPath); } catch { /* best-effort cleanup */ }
    }
  }
  return readCodexResource(projectPath, kind, location.id);
}

export function deleteCodexResource(
  projectPath: string,
  kind: CodexResourceKind,
  id: string | undefined,
  mtimeAtRead?: string,
): CodexResourceMutationResult {
  const location = locationFor(kind, id);
  if (!location) return fail('invalid-id', 'Invalid Codex resource identifier.');
  const absolute = safeAbsolute(projectPath, location.path);
  if (!absolute) return fail('unsafe-path', 'Codex resource paths must not contain symbolic links.');
  if (!existsSync(absolute)) return fail('not-found', 'Codex resource does not exist.');
  if (mtimeAtRead) {
    const current = statSync(absolute).mtime.toISOString();
    if (current !== mtimeAtRead) return fail('conflict', 'Codex resource was modified externally.', current);
  }
  try {
    if (kind === 'permissions' || kind === 'mcp') {
      const original = readFileSync(absolute, 'utf8');
      const content = mergeConfigSection(original, kind, '');
      const temporaryPath = join(dirname(absolute), `.${basename(absolute)}.${randomUUID()}.tmp`);
      writeFileSync(temporaryPath, content, { encoding: 'utf8', flag: 'wx' });
      renameSync(temporaryPath, absolute);
    } else {
      rmSync(absolute, { force: true });
    }
  } catch (error) {
    return fail('write-failed', error instanceof Error ? error.message : 'Unable to delete resource.');
  }
  return { ok: true, file: { ...summary(kind, location), content: '', exists: false, mtime: '' } };
}
