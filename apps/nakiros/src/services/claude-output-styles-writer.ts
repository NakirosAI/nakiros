import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs';
import { dirname, join } from 'path';

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

import type {
  CreateOutputStyleRequest,
  OutputStyleFileContent,
  OutputStyleMutationErrorCode,
  OutputStyleMutationResult,
  OutputStylesListResult,
  SaveOutputStyleRequest,
} from '@nakiros/shared';

import { scanClaudeConfig } from './claude-config-reader.js';

/**
 * Write side of the `.claude/output-styles/` editor (Module 3 V2). Same
 * pattern as rules / agents writers (mtime guard, atomic write, name
 * validation) but the surface is smaller: only `description` and
 * `keep-coding-instructions` are editable in the frontmatter, plus the
 * markdown body.
 *
 * Built-in styles (`Default`, `Explanatory`, `Learning`) are not stored on
 * disk — they're shipped with Claude Code itself. We surface them in
 * `listOutputStyles().activeName` when they're selected, but never edit them.
 */

const NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

function outputStylesDir(projectPath: string): string {
  return join(projectPath, '.claude', 'output-styles');
}

function outputStyleFilePath(projectPath: string, name: string): string {
  return join(outputStylesDir(projectPath), `${name}.md`);
}

function err(
  code: OutputStyleMutationErrorCode,
  message: string,
  currentMtime?: string,
): OutputStyleMutationResult {
  return { ok: false, code, message, currentMtime };
}

/**
 * List custom output styles + report which style is currently selected.
 * The active selection is read from `settings.local.json` first, then
 * `settings.json`. Returns `activeSource: 'none'` when neither sets it.
 */
export function listOutputStyles(projectPath: string): OutputStylesListResult {
  const snapshot = scanClaudeConfig(projectPath);
  const items = snapshot.outputStyles.items;

  const localStyle = snapshot.settings.local.data?.outputStyle;
  const projectStyle = snapshot.settings.project.data?.outputStyle;

  if (typeof localStyle === 'string' && localStyle.length > 0) {
    return { items, activeName: localStyle, activeSource: 'local' };
  }
  if (typeof projectStyle === 'string' && projectStyle.length > 0) {
    return { items, activeName: projectStyle, activeSource: 'project' };
  }
  return { items, activeName: null, activeSource: 'none' };
}

/**
 * Read a single output style for the editor: parses the frontmatter into
 * structured fields and returns the body separately.
 */
export function readOutputStyleForEditor(
  projectPath: string,
  name: string,
): OutputStyleFileContent | null {
  if (!NAME_PATTERN.test(name)) return null;
  const filePath = outputStyleFilePath(projectPath, name);
  if (!existsSync(filePath)) return null;
  let raw = '';
  let mtime: string;
  try {
    raw = readFileSync(filePath, 'utf8');
    mtime = statSync(filePath).mtime.toISOString();
  } catch {
    return null;
  }
  const { fm, body } = decompose(raw);
  const parsed = parseFrontmatter(fm);
  return {
    name,
    relativePath: `.claude/output-styles/${name}.md`,
    mtime,
    frontmatterName: parsed.name,
    description: parsed.description,
    keepCodingInstructions: parsed.keepCodingInstructions,
    body,
  };
}

export function createOutputStyle(
  projectPath: string,
  request: CreateOutputStyleRequest,
): OutputStyleMutationResult {
  const name = request.name.trim();
  if (!NAME_PATTERN.test(name)) {
    return err(
      'invalid-name',
      'Output style name must use lowercase letters, digits and dashes only.',
    );
  }
  const filePath = outputStyleFilePath(projectPath, name);
  if (existsSync(filePath)) {
    return err('already-exists', `An output style named "${name}" already exists.`);
  }
  const description = (request.description ?? '').trim();
  const initialContent = serialize({
    name: null,
    description: description.length > 0 ? description : `Describe how Claude should respond when this style is active.`,
    keepCodingInstructions: false,
    body: `# Custom output style\n\nDescribe how Claude should adapt its tone, format and behaviour when this style is selected.\n`,
  });
  try {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileAtomic(filePath, initialContent);
  } catch (e) {
    return err('write-failed', e instanceof Error ? e.message : String(e));
  }
  const mtime = statSync(filePath).mtime.toISOString();
  return {
    ok: true,
    file: readOutputStyleForEditor(projectPath, name) ?? {
      name,
      relativePath: `.claude/output-styles/${name}.md`,
      mtime,
      frontmatterName: null,
      description: description.length > 0 ? description : null,
      keepCodingInstructions: false,
      body: '',
    },
  };
}

export function saveOutputStyle(
  projectPath: string,
  request: SaveOutputStyleRequest,
): OutputStyleMutationResult {
  const { name, mtimeAtRead, description, keepCodingInstructions, body } = request;
  if (!NAME_PATTERN.test(name)) {
    return err(
      'invalid-name',
      'Output style name must use lowercase letters, digits and dashes only.',
    );
  }
  const filePath = outputStyleFilePath(projectPath, name);
  if (!existsSync(filePath)) {
    return err('not-found', `Output style "${name}" no longer exists on disk.`);
  }
  let currentMtime: string;
  try {
    currentMtime = statSync(filePath).mtime.toISOString();
  } catch (e) {
    return err('write-failed', e instanceof Error ? e.message : String(e));
  }
  if (currentMtime !== mtimeAtRead) {
    return err(
      'conflict',
      'This output style was modified outside Nakiros while you were editing. Reload to see the latest version.',
      currentMtime,
    );
  }

  const content = serialize({ name: null, description, keepCodingInstructions, body });
  try {
    writeFileAtomic(filePath, content);
  } catch (e) {
    return err('write-failed', e instanceof Error ? e.message : String(e));
  }
  return {
    ok: true,
    file: readOutputStyleForEditor(projectPath, name) ?? {
      name,
      relativePath: `.claude/output-styles/${name}.md`,
      mtime: '',
      frontmatterName: null,
      description: description.length > 0 ? description : null,
      keepCodingInstructions,
      body,
    },
  };
}

export function deleteOutputStyle(projectPath: string, name: string): OutputStyleMutationResult {
  if (!NAME_PATTERN.test(name)) {
    return err('invalid-name', 'Invalid output style name.');
  }
  const filePath = outputStyleFilePath(projectPath, name);
  if (!existsSync(filePath)) {
    return err('not-found', `Output style "${name}" does not exist.`);
  }
  try {
    rmSync(filePath, { force: true });
  } catch (e) {
    return err('write-failed', e instanceof Error ? e.message : String(e));
  }
  return {
    ok: true,
    file: {
      name,
      relativePath: `.claude/output-styles/${name}.md`,
      mtime: '',
      frontmatterName: null,
      description: null,
      keepCodingInstructions: false,
      body: '',
    },
  };
}

// ── Frontmatter (de)serializer ─────────────────────────────────────────────-

interface ParsedFrontmatter {
  name: string | null;
  description: string | null;
  keepCodingInstructions: boolean;
}

function decompose(raw: string): { fm: string; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!m) return { fm: '', body: raw };
  return { fm: m[1] ?? '', body: m[2] ?? '' };
}

function parseFrontmatter(fm: string): ParsedFrontmatter {
  if (fm.trim() === '') {
    return { name: null, description: null, keepCodingInstructions: false };
  }
  let parsed: unknown;
  try {
    parsed = parseYaml(fm);
  } catch {
    return { name: null, description: null, keepCodingInstructions: false };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { name: null, description: null, keepCodingInstructions: false };
  }
  const obj = parsed as Record<string, unknown>;
  return {
    name: typeof obj.name === 'string' && obj.name.length > 0 ? obj.name : null,
    description:
      typeof obj.description === 'string' && obj.description.length > 0 ? obj.description : null,
    keepCodingInstructions: obj['keep-coding-instructions'] === true,
  };
}

interface SerializeOptions {
  name: string | null;
  description: string;
  keepCodingInstructions: boolean;
  body: string;
}

function serialize({ name, description, keepCodingInstructions, body }: SerializeOptions): string {
  const fm: Record<string, unknown> = {};
  if (name && name.length > 0) fm.name = name;
  if (description.length > 0) fm.description = description;
  if (keepCodingInstructions) fm['keep-coding-instructions'] = true;
  const fmStr = stringifyYaml(fm).trimEnd();
  const normalizedBody = body.endsWith('\n') ? body : body + '\n';
  return `---\n${fmStr}\n---\n${normalizedBody}`;
}

function writeFileAtomic(filePath: string, content: string): void {
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, filePath);
}
