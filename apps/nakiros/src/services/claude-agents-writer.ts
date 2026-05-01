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

import { parse as parseYaml } from 'yaml';

import type {
  AgentFileContent,
  AgentMutationErrorCode,
  AgentMutationResult,
  AgentParsedEssentials,
  CreateAgentRequest,
  SaveAgentRequest,
} from '@nakiros/shared';

/**
 * Write side of the `.claude/agents/` editor (Module 2 V2). Reads / creates /
 * saves / deletes subagent markdown files with optimistic-lock guard via
 * mtime. The backend stores the **raw** frontmatter as a string + body; the
 * frontend uses `yaml`'s Document API to expose structured + raw views.
 *
 * On save we validate the supplied frontmatter parses as YAML so we never
 * write a broken file. Beyond that, we don't enforce shape — power users
 * can use any frontmatter field the doc supports (memory / hooks / mcpServers
 * / permissionMode / …) without backend changes.
 */

const NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

function agentsDir(projectPath: string): string {
  return join(projectPath, '.claude', 'agents');
}

function agentFilePath(projectPath: string, name: string): string {
  return join(agentsDir(projectPath), `${name}.md`);
}

function err(
  code: AgentMutationErrorCode,
  message: string,
  currentMtime?: string,
): AgentMutationResult {
  return { ok: false, code, message, currentMtime };
}

export function readAgentForEditor(
  projectPath: string,
  name: string,
): AgentFileContent | null {
  if (!NAME_PATTERN.test(name)) return null;
  const filePath = agentFilePath(projectPath, name);
  if (!existsSync(filePath)) return null;
  let raw = '';
  let mtime: string;
  try {
    raw = readFileSync(filePath, 'utf8');
    mtime = statSync(filePath).mtime.toISOString();
  } catch {
    return null;
  }
  const { frontmatterRaw, body } = decomposeAgentFile(raw);
  const parsed = parseEssentials(frontmatterRaw);
  return {
    name,
    relativePath: `.claude/agents/${name}.md`,
    mtime,
    frontmatterRaw,
    body,
    parsed,
  };
}

export function createAgent(
  projectPath: string,
  request: CreateAgentRequest,
): AgentMutationResult {
  const name = request.name.trim();
  if (!NAME_PATTERN.test(name)) {
    return err(
      'invalid-name',
      'Subagent name must start with a lowercase letter and use lowercase letters, digits and dashes only.',
    );
  }
  const filePath = agentFilePath(projectPath, name);
  if (existsSync(filePath)) {
    return err('already-exists', `A subagent named "${name}" already exists.`);
  }
  const description = (request.description ?? '').trim();
  const initialContent = renderInitialAgentFile(name, description);
  try {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileAtomic(filePath, initialContent);
  } catch (e) {
    return err('write-failed', e instanceof Error ? e.message : String(e));
  }
  const mtime = statSync(filePath).mtime.toISOString();
  const { frontmatterRaw, body } = decomposeAgentFile(initialContent);
  return {
    ok: true,
    file: {
      name,
      relativePath: `.claude/agents/${name}.md`,
      mtime,
      frontmatterRaw,
      body,
      parsed: parseEssentials(frontmatterRaw),
    },
  };
}

export function saveAgent(
  projectPath: string,
  request: SaveAgentRequest,
): AgentMutationResult {
  const { name, mtimeAtRead, frontmatterRaw, body } = request;
  if (!NAME_PATTERN.test(name)) {
    return err(
      'invalid-name',
      'Subagent name must start with a lowercase letter and use lowercase letters, digits and dashes only.',
    );
  }
  const filePath = agentFilePath(projectPath, name);
  if (!existsSync(filePath)) {
    return err('not-found', `Subagent "${name}" no longer exists on disk.`);
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
      'This subagent was modified outside Nakiros while you were editing. Reload to see the latest version.',
      currentMtime,
    );
  }

  // Reject malformed YAML up-front so we never write a broken file.
  try {
    parseYaml(frontmatterRaw);
  } catch (e) {
    return err('invalid-yaml', `Frontmatter is not valid YAML: ${e instanceof Error ? e.message : String(e)}`);
  }

  const content = serializeAgentFile(frontmatterRaw, body);
  try {
    writeFileAtomic(filePath, content);
  } catch (e) {
    return err('write-failed', e instanceof Error ? e.message : String(e));
  }
  const mtime = statSync(filePath).mtime.toISOString();
  return {
    ok: true,
    file: {
      name,
      relativePath: `.claude/agents/${name}.md`,
      mtime,
      frontmatterRaw,
      body,
      parsed: parseEssentials(frontmatterRaw),
    },
  };
}

export function deleteAgent(projectPath: string, name: string): AgentMutationResult {
  if (!NAME_PATTERN.test(name)) {
    return err('invalid-name', 'Invalid subagent name.');
  }
  const filePath = agentFilePath(projectPath, name);
  if (!existsSync(filePath)) {
    return err('not-found', `Subagent "${name}" does not exist.`);
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
      relativePath: `.claude/agents/${name}.md`,
      mtime: '',
      frontmatterRaw: '',
      body: '',
      parsed: { description: null, model: null, tools: [], color: null },
    },
  };
}

// ── Frontmatter handling ───────────────────────────────────────────────────-

interface DecomposedAgent {
  /** Raw frontmatter content WITHOUT the surrounding `---` markers. */
  frontmatterRaw: string;
  body: string;
}

function decomposeAgentFile(raw: string): DecomposedAgent {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!m) return { frontmatterRaw: '', body: raw };
  return { frontmatterRaw: m[1] ?? '', body: m[2] ?? '' };
}

function serializeAgentFile(frontmatterRaw: string, body: string): string {
  const fm = frontmatterRaw.endsWith('\n') ? frontmatterRaw.slice(0, -1) : frontmatterRaw;
  const normalizedBody = body.endsWith('\n') ? body : body + '\n';
  return `---\n${fm}\n---\n${normalizedBody}`;
}

function renderInitialAgentFile(name: string, description: string): string {
  const desc = description.length > 0 ? description : `Briefly describe when Claude should delegate to ${name}.`;
  const fm = ['name: ' + name, 'description: ' + JSON.stringify(desc)].join('\n');
  const body = `You are a specialized subagent. Describe the role, expected output, and any constraints below.\n`;
  return `---\n${fm}\n---\n${body}`;
}

function parseEssentials(frontmatterRaw: string): AgentParsedEssentials {
  let parsed: unknown;
  try {
    parsed = parseYaml(frontmatterRaw);
  } catch {
    return { description: null, model: null, tools: [], color: null };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { description: null, model: null, tools: [], color: null };
  }
  const obj = parsed as Record<string, unknown>;
  return {
    description: stringField(obj.description),
    model: stringField(obj.model),
    tools: parseToolsField(obj.tools),
    color: stringField(obj.color),
  };
}

function parseToolsField(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  return [];
}

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function writeFileAtomic(filePath: string, content: string): void {
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, filePath);
}
