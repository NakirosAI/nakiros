import {
  existsSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'fs';
import { dirname, join } from 'path';
import { mkdirSync } from 'fs';

import type {
  CreateMcpServerRequest,
  McpMutationErrorCode,
  McpMutationResult,
  McpServerForEditor,
  McpTransport,
  SaveMcpServerRequest,
} from '@nakiros/shared';

/**
 * Write side of the `.mcp.json` editor (Module 5 V2). One file per project,
 * holds a `mcpServers` object keyed by server name. The editor surface is
 * per-server: list / read / create / save / delete operate on one entry,
 * but the file is rewritten as a whole with a top-level mtime guard so
 * concurrent edits to other servers are still detected.
 *
 * The structured editor exposes the most common stdio fields (command,
 * args, env) plus url for http/sse. Anything else (headers, custom keys)
 * is round-tripped via opaque JSON blobs (`headersJson`, `restJson`) so
 * power-user configs survive a structured save unchanged.
 */

const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

function mcpFilePath(projectPath: string): string {
  return join(projectPath, '.mcp.json');
}

function err(
  code: McpMutationErrorCode,
  message: string,
  currentMtime?: string,
): McpMutationResult {
  return { ok: false, code, message, currentMtime };
}

interface ParsedFile {
  exists: boolean;
  mtime: string;
  obj: Record<string, unknown>;
  /** True when the file existed but failed to parse — `obj` is `{}` then. */
  parseError: boolean;
}

function readFile(projectPath: string): ParsedFile {
  const path = mcpFilePath(projectPath);
  if (!existsSync(path)) {
    return { exists: false, mtime: '', obj: {}, parseError: false };
  }
  let raw = '';
  let mtime = '';
  try {
    raw = readFileSync(path, 'utf8');
    mtime = statSync(path).mtime.toISOString();
  } catch {
    return { exists: false, mtime: '', obj: {}, parseError: false };
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { exists: true, mtime, obj: parsed as Record<string, unknown>, parseError: false };
    }
    return { exists: true, mtime, obj: {}, parseError: true };
  } catch {
    return { exists: true, mtime, obj: {}, parseError: true };
  }
}

function getServersMap(file: ParsedFile): Record<string, unknown> {
  const servers = file.obj.mcpServers;
  if (servers && typeof servers === 'object' && !Array.isArray(servers)) {
    return { ...(servers as Record<string, unknown>) };
  }
  return {};
}

function detectTransport(cfg: Record<string, unknown>): McpTransport {
  const explicit = cfg.type ?? cfg.transport;
  if (explicit === 'sse' || explicit === 'http' || explicit === 'stdio') return explicit;
  if (typeof cfg.url === 'string') return 'http';
  return 'stdio';
}

/**
 * Build an editor view of a single server. Returns null when the file
 * doesn't have that server.
 */
export function readMcpServerForEditor(
  projectPath: string,
  serverName: string,
): McpServerForEditor | null {
  if (!NAME_PATTERN.test(serverName)) return null;
  const file = readFile(projectPath);
  if (file.parseError) return null;
  const servers = getServersMap(file);
  const cfg = servers[serverName];
  if (!cfg || typeof cfg !== 'object') return null;
  return buildEditorView(serverName, cfg as Record<string, unknown>, file.mtime, true);
}

function buildEditorView(
  name: string,
  cfg: Record<string, unknown>,
  mtime: string,
  exists: boolean,
): McpServerForEditor {
  const transport = detectTransport(cfg);

  const command = typeof cfg.command === 'string' ? cfg.command : '';
  const args = Array.isArray(cfg.args) ? cfg.args.filter((v): v is string => typeof v === 'string') : [];
  const env =
    cfg.env && typeof cfg.env === 'object' && !Array.isArray(cfg.env)
      ? Object.entries(cfg.env as Record<string, unknown>).map(([key, value]) => ({
          key,
          value: typeof value === 'string' ? value : JSON.stringify(value),
        }))
      : [];
  const url = typeof cfg.url === 'string' ? cfg.url : '';
  const headers =
    cfg.headers && typeof cfg.headers === 'object' && !Array.isArray(cfg.headers)
      ? (cfg.headers as Record<string, unknown>)
      : null;

  // Anything not surfaced structurally is preserved in restJson.
  const known = new Set(['command', 'args', 'env', 'url', 'headers', 'type', 'transport']);
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(cfg)) {
    if (!known.has(key)) rest[key] = value;
  }

  return {
    name,
    exists,
    mtimeAtRead: mtime,
    transport,
    command,
    args,
    env,
    url,
    headersJson: headers && Object.keys(headers).length > 0 ? JSON.stringify(headers, null, 2) : '',
    restJson: Object.keys(rest).length > 0 ? JSON.stringify(rest, null, 2) : '',
  };
}

/**
 * Build a fresh editor view for a brand-new server (used by the create flow
 * before the server is on disk).
 */
export function emptyServerForEditor(
  projectPath: string,
  request: CreateMcpServerRequest,
): McpServerForEditor {
  const file = readFile(projectPath);
  return {
    name: request.name,
    exists: false,
    mtimeAtRead: file.mtime,
    transport: request.transport,
    command: request.command ?? '',
    args: request.args ?? [],
    env: request.env ?? [],
    url: request.url ?? '',
    headersJson: '',
    restJson: '',
  };
}

export function createMcpServer(
  projectPath: string,
  request: CreateMcpServerRequest,
): McpMutationResult {
  const name = request.name.trim();
  if (!NAME_PATTERN.test(name)) {
    return err('invalid-name', 'MCP server name must use letters, digits, dashes and underscores only.');
  }
  const file = readFile(projectPath);
  const servers = getServersMap(file);
  if (servers[name] !== undefined) {
    return err('already-exists', `An MCP server named "${name}" already exists.`);
  }
  const cfg = serverConfigFromRequest({
    transport: request.transport,
    command: request.command ?? '',
    args: request.args ?? [],
    env: request.env ?? [],
    url: request.url ?? '',
    headersJson: '',
    restJson: '',
  });
  servers[name] = cfg;

  return writeServers(projectPath, file, servers);
}

export function saveMcpServer(
  projectPath: string,
  request: SaveMcpServerRequest,
): McpMutationResult {
  const trimmedNew = (request.newName ?? request.name).trim();
  if (!NAME_PATTERN.test(trimmedNew)) {
    return err('invalid-name', 'MCP server name must use letters, digits, dashes and underscores only.');
  }

  // Validate optional JSON blobs up-front so we never write partial state.
  let headersObj: Record<string, unknown> | null = null;
  if (request.headersJson.trim().length > 0) {
    try {
      const parsed = JSON.parse(request.headersJson) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return err('invalid-json', 'Headers must be a JSON object (e.g. `{"Authorization": "Bearer …"}`).');
      }
      headersObj = parsed as Record<string, unknown>;
    } catch (e) {
      return err('invalid-json', `Headers JSON is invalid: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  let restObj: Record<string, unknown> = {};
  if (request.restJson.trim().length > 0) {
    try {
      const parsed = JSON.parse(request.restJson) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return err('invalid-json', 'Other config must be a JSON object.');
      }
      restObj = parsed as Record<string, unknown>;
    } catch (e) {
      return err('invalid-json', `Other config JSON is invalid: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const file = readFile(projectPath);
  if (request.mtimeAtRead && file.exists && file.mtime !== request.mtimeAtRead) {
    return err(
      'conflict',
      'This .mcp.json was modified outside Nakiros while you were editing. Reload to see the latest version.',
      file.mtime,
    );
  }

  const servers = getServersMap(file);
  if (!servers[request.name]) {
    return err('not-found', `MCP server "${request.name}" does not exist.`);
  }
  if (trimmedNew !== request.name && servers[trimmedNew] !== undefined) {
    return err('already-exists', `An MCP server named "${trimmedNew}" already exists.`);
  }

  delete servers[request.name];
  servers[trimmedNew] = serverConfigFromRequest({
    transport: request.transport,
    command: request.command,
    args: request.args,
    env: request.env,
    url: request.url,
    headersJson: '', // already parsed
    restJson: '', // already parsed
    headersObj,
    restObj,
  });

  return writeServers(projectPath, file, servers);
}

export function deleteMcpServer(
  projectPath: string,
  serverName: string,
  mtimeAtRead: string,
): McpMutationResult {
  if (!NAME_PATTERN.test(serverName)) {
    return err('invalid-name', 'Invalid MCP server name.');
  }
  const file = readFile(projectPath);
  if (!file.exists) {
    return err('not-found', `MCP server "${serverName}" does not exist.`);
  }
  if (mtimeAtRead && file.mtime !== mtimeAtRead) {
    return err('conflict', 'This .mcp.json was modified outside Nakiros.', file.mtime);
  }
  const servers = getServersMap(file);
  if (!servers[serverName]) {
    return err('not-found', `MCP server "${serverName}" does not exist.`);
  }
  delete servers[serverName];
  return writeServers(projectPath, file, servers);
}

interface ServerConfigBuildArgs {
  transport: McpTransport;
  command: string;
  args: string[];
  env: Array<{ key: string; value: string }>;
  url: string;
  headersJson: string;
  restJson: string;
  /** Pre-parsed alternatives so save/create can share the builder. */
  headersObj?: Record<string, unknown> | null;
  restObj?: Record<string, unknown>;
}

function serverConfigFromRequest(args: ServerConfigBuildArgs): Record<string, unknown> {
  const cfg: Record<string, unknown> = { ...(args.restObj ?? {}) };
  cfg.type = args.transport;

  if (args.transport === 'stdio') {
    if (args.command.trim().length > 0) cfg.command = args.command;
    else delete cfg.command;
    if (args.args.length > 0) cfg.args = args.args;
    else delete cfg.args;
    delete cfg.url;
    delete cfg.headers;
  } else {
    if (args.url.trim().length > 0) cfg.url = args.url;
    else delete cfg.url;
    if (args.headersObj && Object.keys(args.headersObj).length > 0) cfg.headers = args.headersObj;
    else delete cfg.headers;
    delete cfg.command;
    delete cfg.args;
  }

  if (args.env.length > 0) {
    const envOut: Record<string, string> = {};
    for (const { key, value } of args.env) {
      const k = key.trim();
      if (k.length > 0) envOut[k] = value;
    }
    if (Object.keys(envOut).length > 0) cfg.env = envOut;
    else delete cfg.env;
  } else {
    delete cfg.env;
  }

  return cfg;
}

function writeServers(
  projectPath: string,
  file: ParsedFile,
  servers: Record<string, unknown>,
): McpMutationResult {
  const path = mcpFilePath(projectPath);
  const finalObj: Record<string, unknown> = { ...file.obj };
  if (Object.keys(servers).length > 0) {
    finalObj.mcpServers = servers;
  } else {
    delete finalObj.mcpServers;
  }
  const content = JSON.stringify(finalObj, null, 2) + '\n';
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileAtomic(path, content);
  } catch (e) {
    return err('write-failed', e instanceof Error ? e.message : String(e));
  }
  let mtime = '';
  try {
    mtime = statSync(path).mtime.toISOString();
  } catch {
    // ignore — caller will get an empty mtime, which simply skips the
    // mtime-guard on the next save (acceptable for a fresh write).
  }
  return { ok: true, mtime };
}

function writeFileAtomic(filePath: string, content: string): void {
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, filePath);
}
