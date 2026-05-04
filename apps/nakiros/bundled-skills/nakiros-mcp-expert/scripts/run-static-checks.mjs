#!/usr/bin/env node
/**
 * Static (deterministic) audit checks for nakiros-mcp-expert.
 *
 * Run by the agent at the START of an audit, before doing any judgement-based
 * checks. Produces:
 *
 *   <output-dir>/audit-manifest.json   — copy of the static manifest with target filled in
 *   <output-dir>/audit-progress.jsonl  — one line per check this script can decide
 *                                         (10/14). The agent fills the remaining 4
 *                                         cross-entity checks by appending more lines.
 *
 * Usage:
 *   node scripts/run-static-checks.mjs --mcp-config <path-to-.mcp.json> --output-dir <path>
 *
 * Exit code is always 0 — a failed check is an audit signal, not a script error.
 * Real errors (manifest missing, output-dir cannot be created) exit non-zero.
 *
 * Handles these cases gracefully:
 *   - .mcp.json does not exist → structure.valid_json: pass (detail: "no .mcp.json file"),
 *     all 13 other checks: na
 *   - .mcp.json exists but is invalid JSON → structure.valid_json: fail, rest: na
 *   - mcpServers is empty ({}) → all server.* and security.* checks: na
 *
 * Deterministic checks handled (10/14):
 *   structure.valid_json, structure.mcp_servers_object, structure.no_unknown_server_keys,
 *   server.type_valid, server.required_fields, server.no_deprecated_sse,
 *   server.env_no_plain_secrets,
 *   security.https_for_remote_servers, security.no_alwaysLoad_overuse,
 *   security.oauth_or_auth_documented
 *
 * Judgement checks left for the agent (4/14):
 *   crossref.referenced_in_hooks, crossref.referenced_in_subagents,
 *   crossref.referenced_in_permissions, crossref.unused_servers
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = resolve(SCRIPT_DIR, '..');

// ─── arg parsing ────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = { mcpConfigPath: null, outputDir: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--mcp-config') args.mcpConfigPath = argv[++i];
    else if (argv[i] === '--output-dir') args.outputDir = argv[++i];
  }
  if (!args.mcpConfigPath || !args.outputDir) {
    console.error('Usage: run-static-checks.mjs --mcp-config <path> --output-dir <path>');
    process.exit(2);
  }
  return args;
}

const { mcpConfigPath, outputDir } = parseArgs(process.argv.slice(2));
mkdirSync(outputDir, { recursive: true });

// ─── manifest copy ──────────────────────────────────────────────────────────
const manifestSrc = join(SKILL_ROOT, 'audit-manifest.json');
if (!existsSync(manifestSrc)) {
  console.error(`Static manifest not found at ${manifestSrc}`);
  process.exit(2);
}
const manifest = JSON.parse(readFileSync(manifestSrc, 'utf8'));
manifest.target = mcpConfigPath;
writeFileSync(join(outputDir, 'audit-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

// ─── per-check result helpers ────────────────────────────────────────────────
const outcomes = [];
const record = (checkId, result, detail) => outcomes.push({ checkId, result, detail });
const naAll = (ids, reason) => ids.forEach((id) => record(id, 'na', reason));

// All check IDs for convenience
const ALL_CHECKS = manifest.checks.map((c) => c.id);
const CROSSREF_CHECKS = ['crossref.referenced_in_hooks', 'crossref.referenced_in_subagents', 'crossref.referenced_in_permissions', 'crossref.unused_servers'];

// Known valid server keys
const KNOWN_SERVER_KEYS = new Set(['type', 'url', 'command', 'args', 'env', 'headers', 'oauth', 'headersHelper', 'alwaysLoad']);

// Valid transport types
const VALID_TYPES = new Set(['http', 'sse', 'stdio']);

// Secret key heuristic pattern
const SECRET_KEY_PATTERN = /(token|key|secret|password)/i;

// ─── handle absent file ──────────────────────────────────────────────────────
if (!existsSync(mcpConfigPath)) {
  record('structure.valid_json', 'pass', 'No .mcp.json file — project uses no MCP servers');
  naAll(ALL_CHECKS.filter((id) => id !== 'structure.valid_json'), 'No .mcp.json file — not applicable');
  flush();
  process.exit(0);
}

// ─── load .mcp.json ──────────────────────────────────────────────────────────
let raw;
try {
  raw = readFileSync(mcpConfigPath, 'utf8');
} catch (err) {
  record('structure.valid_json', 'fail', `Cannot read .mcp.json: ${err.message}`);
  naAll(ALL_CHECKS.filter((id) => id !== 'structure.valid_json'), '.mcp.json unreadable');
  flush();
  process.exit(0);
}

let config;
try {
  config = JSON.parse(raw);
  record('structure.valid_json', 'pass', '.mcp.json is valid JSON');
} catch (err) {
  record('structure.valid_json', 'fail', `Invalid JSON: ${err.message}`);
  naAll(ALL_CHECKS.filter((id) => id !== 'structure.valid_json'), 'Invalid JSON — remaining checks not evaluable');
  flush();
  process.exit(0);
}

// ─── structure.mcp_servers_object ────────────────────────────────────────────
{
  const val = config.mcpServers;
  if (val === undefined || val === null) {
    record('structure.mcp_servers_object', 'fail', 'mcpServers key missing from .mcp.json');
    // Remaining structure + server + security checks are na; crossref left for agent
    naAll(['structure.no_unknown_server_keys', 'server.type_valid', 'server.required_fields',
      'server.no_deprecated_sse', 'server.env_no_plain_secrets',
      'security.https_for_remote_servers', 'security.no_alwaysLoad_overuse',
      'security.oauth_or_auth_documented'], 'mcpServers key missing');
    naAll(CROSSREF_CHECKS, 'mcpServers key missing — agent should still check snapshot consistency');
    flush();
    process.exit(0);
  }
  if (Array.isArray(val) || typeof val !== 'object') {
    record('structure.mcp_servers_object', 'fail', `mcpServers is not a plain object (got: ${Array.isArray(val) ? 'array' : typeof val})`);
    naAll(['structure.no_unknown_server_keys', 'server.type_valid', 'server.required_fields',
      'server.no_deprecated_sse', 'server.env_no_plain_secrets',
      'security.https_for_remote_servers', 'security.no_alwaysLoad_overuse',
      'security.oauth_or_auth_documented'], 'mcpServers is not a plain object');
    naAll(CROSSREF_CHECKS, 'mcpServers is not a plain object — agent should still check snapshot consistency');
    flush();
    process.exit(0);
  }
  record('structure.mcp_servers_object', 'pass', `mcpServers is a valid object`);
}

const servers = config.mcpServers;
const serverEntries = Object.entries(servers);

// Empty mcpServers → all server/security checks are na
if (serverEntries.length === 0) {
  naAll(['structure.no_unknown_server_keys', 'server.type_valid', 'server.required_fields',
    'server.no_deprecated_sse', 'server.env_no_plain_secrets',
    'security.https_for_remote_servers', 'security.no_alwaysLoad_overuse',
    'security.oauth_or_auth_documented'], 'mcpServers is empty — no servers to validate');
  naAll(CROSSREF_CHECKS, 'mcpServers is empty — agent should verify snapshot has no stale references');
  flush();
  process.exit(0);
}

// ─── structure.no_unknown_server_keys ────────────────────────────────────────
{
  const violations = [];
  for (const [name, serverDef] of serverEntries) {
    if (!serverDef || typeof serverDef !== 'object') continue;
    const unknownKeys = Object.keys(serverDef).filter((k) => !KNOWN_SERVER_KEYS.has(k));
    if (unknownKeys.length > 0) {
      violations.push(`server '${name}' has unknown key(s): ${unknownKeys.join(', ')}`);
    }
  }
  if (violations.length === 0) {
    record('structure.no_unknown_server_keys', 'pass', `All ${serverEntries.length} server(s) use only recognised keys`);
  } else {
    record('structure.no_unknown_server_keys', 'fail', violations.join('; '));
  }
}

// ─── server.type_valid ───────────────────────────────────────────────────────
{
  const invalid = [];
  for (const [name, serverDef] of serverEntries) {
    if (!serverDef || typeof serverDef !== 'object') {
      invalid.push(`server '${name}' is not an object`);
      continue;
    }
    if (!VALID_TYPES.has(serverDef.type)) {
      invalid.push(`server '${name}' has invalid type: '${serverDef.type ?? '(missing)'}' (expected http|sse|stdio)`);
    }
  }
  if (invalid.length === 0) {
    record('server.type_valid', 'pass', `All ${serverEntries.length} server(s) have a valid type`);
  } else {
    record('server.type_valid', 'fail', invalid.join('; '));
  }
}

// ─── server.required_fields ──────────────────────────────────────────────────
{
  const missing = [];
  for (const [name, serverDef] of serverEntries) {
    if (!serverDef || typeof serverDef !== 'object' || !VALID_TYPES.has(serverDef.type)) continue;
    if (serverDef.type === 'stdio') {
      if (!serverDef.command || typeof serverDef.command !== 'string' || serverDef.command.trim() === '') {
        missing.push(`server '${name}' (type=stdio) missing required field: command`);
      }
    } else {
      // http or sse
      if (!serverDef.url || typeof serverDef.url !== 'string' || serverDef.url.trim() === '') {
        missing.push(`server '${name}' (type=${serverDef.type}) missing required field: url`);
      }
    }
  }
  if (missing.length === 0) {
    record('server.required_fields', 'pass', 'All servers have the required fields for their transport type');
  } else {
    record('server.required_fields', 'fail', missing.join('; '));
  }
}

// ─── server.no_deprecated_sse ────────────────────────────────────────────────
{
  const sseServers = serverEntries.filter(([, def]) => def?.type === 'sse').map(([name]) => name);
  if (sseServers.length === 0) {
    record('server.no_deprecated_sse', 'pass', 'No servers use the deprecated SSE transport');
  } else {
    record('server.no_deprecated_sse', 'fail',
      `Server(s) using deprecated SSE transport (migrate to http): ${sseServers.join(', ')}`);
  }
}

// ─── server.env_no_plain_secrets ─────────────────────────────────────────────
{
  const violations = [];
  for (const [name, serverDef] of serverEntries) {
    if (!serverDef || typeof serverDef !== 'object') continue;
    const plainKeys = [];

    // Check env map
    if (serverDef.env && typeof serverDef.env === 'object') {
      for (const [k, v] of Object.entries(serverDef.env)) {
        if (SECRET_KEY_PATTERN.test(k) && typeof v === 'string' && !v.includes('${')) {
          plainKeys.push(`env.${k}`);
        }
      }
    }

    // Check headers map
    if (serverDef.headers && typeof serverDef.headers === 'object') {
      for (const [k, v] of Object.entries(serverDef.headers)) {
        if (SECRET_KEY_PATTERN.test(k) && typeof v === 'string' && !v.includes('${')) {
          plainKeys.push(`headers.${k}`);
        }
      }
    }

    if (plainKeys.length > 0) {
      violations.push(`server '${name}': plain-text value for key(s): ${plainKeys.join(', ')}`);
    }
  }
  if (violations.length === 0) {
    record('server.env_no_plain_secrets', 'pass', 'No plain-text secrets found in env or headers');
  } else {
    record('server.env_no_plain_secrets', 'fail', violations.join('; '));
  }
}

// ─── security.https_for_remote_servers ───────────────────────────────────────
{
  const httpViolations = [];
  for (const [name, serverDef] of serverEntries) {
    if (!serverDef || typeof serverDef !== 'object') continue;
    if ((serverDef.type === 'http' || serverDef.type === 'sse') && serverDef.url) {
      if (/^http:\/\//i.test(serverDef.url)) {
        httpViolations.push(`server '${name}' (${serverDef.url})`);
      }
    }
  }
  const remoteServers = serverEntries.filter(([, def]) => def?.type === 'http' || def?.type === 'sse');
  if (remoteServers.length === 0) {
    record('security.https_for_remote_servers', 'na', 'No http/sse servers — HTTPS check not applicable');
  } else if (httpViolations.length === 0) {
    record('security.https_for_remote_servers', 'pass', `All ${remoteServers.length} remote server(s) use HTTPS`);
  } else {
    record('security.https_for_remote_servers', 'fail',
      `Server(s) using non-HTTPS URL: ${httpViolations.join(', ')}`);
  }
}

// ─── security.no_alwaysLoad_overuse ──────────────────────────────────────────
{
  const alwaysLoadServers = serverEntries.filter(([, def]) => def?.alwaysLoad === true).map(([name]) => name);
  if (alwaysLoadServers.length <= 2) {
    record('security.no_alwaysLoad_overuse', 'pass',
      alwaysLoadServers.length === 0
        ? 'No servers have alwaysLoad: true'
        : `${alwaysLoadServers.length} server(s) with alwaysLoad:true (within limit): ${alwaysLoadServers.join(', ')}`);
  } else {
    record('security.no_alwaysLoad_overuse', 'fail',
      `${alwaysLoadServers.length} servers have alwaysLoad:true (max recommended: 2): ${alwaysLoadServers.join(', ')}`);
  }
}

// ─── security.oauth_or_auth_documented ───────────────────────────────────────
{
  const remoteServers = serverEntries.filter(([, def]) => def?.type === 'http' || def?.type === 'sse');
  if (remoteServers.length === 0) {
    record('security.oauth_or_auth_documented', 'na', 'No http/sse servers — auth check not applicable');
  } else {
    const noAuth = [];
    for (const [name, serverDef] of remoteServers) {
      const hasOauth = serverDef.oauth && typeof serverDef.oauth === 'object';
      const hasHeadersHelper = serverDef.headersHelper && typeof serverDef.headersHelper === 'string';
      const hasAuthHeader = serverDef.headers && typeof serverDef.headers === 'object' &&
        Object.keys(serverDef.headers).some((k) => k.toLowerCase() === 'authorization');
      if (!hasOauth && !hasHeadersHelper && !hasAuthHeader) {
        noAuth.push(name);
      }
    }
    if (noAuth.length === 0) {
      record('security.oauth_or_auth_documented', 'pass',
        `All ${remoteServers.length} remote server(s) have auth configured`);
    } else {
      record('security.oauth_or_auth_documented', 'fail',
        `Server(s) with no auth configured (no oauth, headersHelper, or Authorization header): ${noAuth.join(', ')}`);
    }
  }
}

// ─── crossref checks (left for the agent) ────────────────────────────────────
// These 4 checks require reading dot-claude-snapshot.json which the agent does.
// Emit na with a clear message so the agent knows to evaluate them.
naAll(CROSSREF_CHECKS, 'Cross-entity check — requires dot-claude-snapshot.json (agent evaluates)');

// ─── flush to JSONL ──────────────────────────────────────────────────────────
function flush() {
  const jsonlPath = join(outputDir, 'audit-progress.jsonl');
  const out = outcomes.map((o) => JSON.stringify(o)).join('\n') + '\n';
  writeFileSync(jsonlPath, out);

  const passed = outcomes.filter((o) => o.result === 'pass').length;
  const failed = outcomes.filter((o) => o.result === 'fail').length;
  const na = outcomes.filter((o) => o.result === 'na').length;
  console.log(`run-static-checks: ${outcomes.length} checks emitted (${passed} pass, ${failed} fail, ${na} na). Wrote ${jsonlPath}.`);
  console.log(`run-static-checks: ${manifest.totalChecks - outcomes.length} check(s) remain for the agent to evaluate.`);
}

flush();
