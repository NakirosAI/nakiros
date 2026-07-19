/**
 * Deterministic (10/14) Claude `.mcp.json` audit checks.
 *
 * Extracted from the original monolithic run-static-checks.mjs so the
 * provider dispatcher in scripts/run-static-checks.mjs can pick this module
 * or ./codex-checks.mjs based on --provider. Behavior is unchanged from the
 * pre-existing Claude-only script — see audit-manifest.json for the full
 * 14-check taxonomy and references/claude/mcp-checklist.md for rubrics.
 *
 * Judgement checks left for the agent (4/14): crossref.referenced_in_hooks,
 * crossref.referenced_in_subagents, crossref.referenced_in_permissions,
 * crossref.unused_servers.
 */

import { readFileSync, existsSync } from 'node:fs';

const CROSSREF_CHECKS = [
  'crossref.referenced_in_hooks',
  'crossref.referenced_in_subagents',
  'crossref.referenced_in_permissions',
  'crossref.unused_servers',
];

const KNOWN_SERVER_KEYS = new Set(['type', 'url', 'command', 'args', 'env', 'headers', 'oauth', 'headersHelper', 'alwaysLoad']);
const VALID_TYPES = new Set(['http', 'sse', 'stdio']);
const SECRET_KEY_PATTERN = /(token|key|secret|password)/i;

/**
 * Runs every deterministic Claude check against the `.mcp.json` at
 * `mcpConfigPath`. Mirrors the na-cascading behavior of the daemon's own
 * adapter without importing it (this skill runs standalone).
 *
 * @param {string} mcpConfigPath
 * @param {{ checks: Array<{ id: string }> }} manifest
 * @returns {Array<{ checkId: string, result: 'pass'|'fail'|'na', detail: string }>}
 */
export function runClaudeChecks(mcpConfigPath, manifest) {
  const outcomes = [];
  const record = (checkId, result, detail) => outcomes.push({ checkId, result, detail });
  const naAll = (ids, reason) => ids.forEach((id) => record(id, 'na', reason));
  const ALL_CHECKS = manifest.checks.map((c) => c.id);

  if (!existsSync(mcpConfigPath)) {
    record('structure.valid_json', 'pass', 'No .mcp.json file — project uses no MCP servers');
    naAll(ALL_CHECKS.filter((id) => id !== 'structure.valid_json'), 'No .mcp.json file — not applicable');
    return outcomes;
  }

  let raw;
  try {
    raw = readFileSync(mcpConfigPath, 'utf8');
  } catch (err) {
    record('structure.valid_json', 'fail', `Cannot read .mcp.json: ${err.message}`);
    naAll(ALL_CHECKS.filter((id) => id !== 'structure.valid_json'), '.mcp.json unreadable');
    return outcomes;
  }

  let config;
  try {
    config = JSON.parse(raw);
    record('structure.valid_json', 'pass', '.mcp.json is valid JSON');
  } catch (err) {
    record('structure.valid_json', 'fail', `Invalid JSON: ${err.message}`);
    naAll(ALL_CHECKS.filter((id) => id !== 'structure.valid_json'), 'Invalid JSON — remaining checks not evaluable');
    return outcomes;
  }

  const remainingAfterStructure = [
    'structure.no_unknown_server_keys', 'server.type_valid', 'server.required_fields',
    'server.no_deprecated_sse', 'server.env_no_plain_secrets',
    'security.https_for_remote_servers', 'security.no_alwaysLoad_overuse',
    'security.oauth_or_auth_documented',
  ];

  const val = config.mcpServers;
  if (val === undefined || val === null) {
    record('structure.mcp_servers_object', 'fail', 'mcpServers key missing from .mcp.json');
    naAll(remainingAfterStructure, 'mcpServers key missing');
    naAll(CROSSREF_CHECKS, 'mcpServers key missing — agent should still check snapshot consistency');
    return outcomes;
  }
  if (Array.isArray(val) || typeof val !== 'object') {
    record('structure.mcp_servers_object', 'fail', `mcpServers is not a plain object (got: ${Array.isArray(val) ? 'array' : typeof val})`);
    naAll(remainingAfterStructure, 'mcpServers is not a plain object');
    naAll(CROSSREF_CHECKS, 'mcpServers is not a plain object — agent should still check snapshot consistency');
    return outcomes;
  }
  record('structure.mcp_servers_object', 'pass', 'mcpServers is a valid object');

  const serverEntries = Object.entries(val);
  if (serverEntries.length === 0) {
    naAll(remainingAfterStructure, 'mcpServers is empty — no servers to validate');
    naAll(CROSSREF_CHECKS, 'mcpServers is empty — agent should verify snapshot has no stale references');
    return outcomes;
  }

  // structure.no_unknown_server_keys
  {
    const violations = [];
    for (const [name, serverDef] of serverEntries) {
      if (!serverDef || typeof serverDef !== 'object') continue;
      const unknownKeys = Object.keys(serverDef).filter((k) => !KNOWN_SERVER_KEYS.has(k));
      if (unknownKeys.length > 0) violations.push(`server '${name}' has unknown key(s): ${unknownKeys.join(', ')}`);
    }
    record('structure.no_unknown_server_keys', violations.length === 0 ? 'pass' : 'fail',
      violations.length === 0 ? `All ${serverEntries.length} server(s) use only recognised keys` : violations.join('; '));
  }

  // server.type_valid
  {
    const invalid = [];
    for (const [name, serverDef] of serverEntries) {
      if (!serverDef || typeof serverDef !== 'object') { invalid.push(`server '${name}' is not an object`); continue; }
      if (!VALID_TYPES.has(serverDef.type)) {
        invalid.push(`server '${name}' has invalid type: '${serverDef.type ?? '(missing)'}' (expected http|sse|stdio)`);
      }
    }
    record('server.type_valid', invalid.length === 0 ? 'pass' : 'fail',
      invalid.length === 0 ? `All ${serverEntries.length} server(s) have a valid type` : invalid.join('; '));
  }

  // server.required_fields
  {
    const missing = [];
    for (const [name, serverDef] of serverEntries) {
      if (!serverDef || typeof serverDef !== 'object' || !VALID_TYPES.has(serverDef.type)) continue;
      if (serverDef.type === 'stdio') {
        if (!serverDef.command || typeof serverDef.command !== 'string' || serverDef.command.trim() === '') {
          missing.push(`server '${name}' (type=stdio) missing required field: command`);
        }
      } else if (!serverDef.url || typeof serverDef.url !== 'string' || serverDef.url.trim() === '') {
        missing.push(`server '${name}' (type=${serverDef.type}) missing required field: url`);
      }
    }
    record('server.required_fields', missing.length === 0 ? 'pass' : 'fail',
      missing.length === 0 ? 'All servers have the required fields for their transport type' : missing.join('; '));
  }

  // server.no_deprecated_sse
  {
    const sseServers = serverEntries.filter(([, def]) => def?.type === 'sse').map(([name]) => name);
    record('server.no_deprecated_sse', sseServers.length === 0 ? 'pass' : 'fail',
      sseServers.length === 0
        ? 'No servers use the deprecated SSE transport'
        : `Server(s) using deprecated SSE transport (migrate to http): ${sseServers.join(', ')}`);
  }

  // server.env_no_plain_secrets
  {
    const violations = [];
    for (const [name, serverDef] of serverEntries) {
      if (!serverDef || typeof serverDef !== 'object') continue;
      const plainKeys = [];
      for (const mapKey of ['env', 'headers']) {
        if (serverDef[mapKey] && typeof serverDef[mapKey] === 'object') {
          for (const [k, v] of Object.entries(serverDef[mapKey])) {
            if (SECRET_KEY_PATTERN.test(k) && typeof v === 'string' && !v.includes('${')) plainKeys.push(`${mapKey}.${k}`);
          }
        }
      }
      if (plainKeys.length > 0) violations.push(`server '${name}': plain-text value for key(s): ${plainKeys.join(', ')}`);
    }
    record('server.env_no_plain_secrets', violations.length === 0 ? 'pass' : 'fail',
      violations.length === 0 ? 'No plain-text secrets found in env or headers' : violations.join('; '));
  }

  // security.https_for_remote_servers
  {
    const remoteServers = serverEntries.filter(([, def]) => def?.type === 'http' || def?.type === 'sse');
    if (remoteServers.length === 0) {
      record('security.https_for_remote_servers', 'na', 'No http/sse servers — HTTPS check not applicable');
    } else {
      const httpViolations = remoteServers
        .filter(([, def]) => def.url && /^http:\/\//i.test(def.url))
        .map(([name, def]) => `server '${name}' (${def.url})`);
      record('security.https_for_remote_servers', httpViolations.length === 0 ? 'pass' : 'fail',
        httpViolations.length === 0
          ? `All ${remoteServers.length} remote server(s) use HTTPS`
          : `Server(s) using non-HTTPS URL: ${httpViolations.join(', ')}`);
    }
  }

  // security.no_alwaysLoad_overuse
  {
    const alwaysLoadServers = serverEntries.filter(([, def]) => def?.alwaysLoad === true).map(([name]) => name);
    record('security.no_alwaysLoad_overuse', alwaysLoadServers.length <= 2 ? 'pass' : 'fail',
      alwaysLoadServers.length <= 2
        ? (alwaysLoadServers.length === 0
          ? 'No servers have alwaysLoad: true'
          : `${alwaysLoadServers.length} server(s) with alwaysLoad:true (within limit): ${alwaysLoadServers.join(', ')}`)
        : `${alwaysLoadServers.length} servers have alwaysLoad:true (max recommended: 2): ${alwaysLoadServers.join(', ')}`);
  }

  // security.oauth_or_auth_documented
  {
    const remoteServers = serverEntries.filter(([, def]) => def?.type === 'http' || def?.type === 'sse');
    if (remoteServers.length === 0) {
      record('security.oauth_or_auth_documented', 'na', 'No http/sse servers — auth check not applicable');
    } else {
      const noAuth = remoteServers.filter(([, def]) => {
        const hasOauth = def.oauth && typeof def.oauth === 'object';
        const hasHeadersHelper = def.headersHelper && typeof def.headersHelper === 'string';
        const hasAuthHeader = def.headers && typeof def.headers === 'object'
          && Object.keys(def.headers).some((k) => k.toLowerCase() === 'authorization');
        return !hasOauth && !hasHeadersHelper && !hasAuthHeader;
      }).map(([name]) => name);
      record('security.oauth_or_auth_documented', noAuth.length === 0 ? 'pass' : 'fail',
        noAuth.length === 0
          ? `All ${remoteServers.length} remote server(s) have auth configured`
          : `Server(s) with no auth configured (no oauth, headersHelper, or Authorization header): ${noAuth.join(', ')}`);
    }
  }

  // crossref checks — left for the agent (require dot-claude-snapshot.json)
  naAll(CROSSREF_CHECKS, 'Cross-entity check — requires dot-claude-snapshot.json (agent evaluates)');

  return outcomes;
}
