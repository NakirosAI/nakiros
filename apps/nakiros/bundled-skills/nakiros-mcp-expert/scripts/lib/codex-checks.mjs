/**
 * Deterministic Codex `.codex/config.toml` audit checks.
 *
 * Reads the `[mcp_servers.*]` slice using the bounded, dependency-free
 * ./toml-reader.mjs (no `confbox`, no daemon dependency — this skill runs
 * standalone). Taxonomy and rubrics: audit-manifest.codex.json and
 * references/codex/mcp-checklist.md.
 *
 * 6 of the 14 checks (`security.no_alwaysLoad_overuse`,
 * `security.oauth_or_auth_documented`, and all 4 `crossref.*`) are marked
 * `alwaysNa: true` in the manifest — they have no Codex equivalent yet (see
 * references/codex/mcp-spec.md). This module always emits them as `na` with
 * their manifest-declared reason, regardless of file content, so the report
 * is consistent even when the audit short-circuits early (missing file,
 * invalid TOML, etc.).
 */

import { readFileSync, existsSync } from 'node:fs';
import { parseTomlSubset } from './toml-reader.mjs';

const KNOWN_SERVER_KEYS = new Set(['command', 'args', 'env', 'url', 'http_headers']);
const SECRET_KEY_PATTERN = /(token|key|secret|password)/i;

/**
 * @param {string} configPath Absolute path to `.codex/config.toml`.
 * @param {{ checks: Array<{ id: string, alwaysNa?: boolean, alwaysNaReason?: string }> }} manifest
 * @returns {Array<{ checkId: string, result: 'pass'|'fail'|'na', detail: string }>}
 */
export function runCodexChecks(configPath, manifest) {
  const outcomes = [];
  const record = (checkId, result, detail) => outcomes.push({ checkId, result, detail });
  const ALL_CHECKS = manifest.checks.map((c) => c.id);
  const alwaysNaReason = (id) => manifest.checks.find((c) => c.id === id)?.alwaysNaReason;

  /** Emits `na` for every id in `ids`, preferring each check's manifest-declared alwaysNa reason. */
  const naRemaining = (ids, genericReason) => {
    for (const id of ids) {
      const reason = alwaysNaReason(id);
      record(id, 'na', reason ?? genericReason);
    }
  };

  if (!existsSync(configPath)) {
    record('structure.valid_toml', 'pass', 'No .codex/config.toml file — project uses no MCP servers');
    naRemaining(ALL_CHECKS.filter((id) => id !== 'structure.valid_toml'), 'No .codex/config.toml file — not applicable');
    return outcomes;
  }

  let raw;
  try {
    raw = readFileSync(configPath, 'utf8');
  } catch (err) {
    record('structure.valid_toml', 'fail', `Cannot read .codex/config.toml: ${err.message}`);
    naRemaining(ALL_CHECKS.filter((id) => id !== 'structure.valid_toml'), '.codex/config.toml unreadable');
    return outcomes;
  }

  const parsed = parseTomlSubset(raw);
  if (!parsed.ok) {
    record('structure.valid_toml', 'fail',
      `Could not parse with the bounded TOML reader (${parsed.error}). This may mean the file uses TOML features ` +
      'outside this skill\'s supported subset (multi-line arrays, inline tables, array-of-tables) rather than being ' +
      'truly invalid — read the file directly to confirm before reporting a hard failure.');
    naRemaining(ALL_CHECKS.filter((id) => id !== 'structure.valid_toml'), 'TOML not parseable by the bounded reader — remaining checks not evaluable');
    return outcomes;
  }

  const root = parsed.value;
  const unexpectedRootKeys = Object.keys(root).filter((k) => k !== 'mcp_servers');
  if (unexpectedRootKeys.length > 0) {
    record('structure.valid_toml', 'fail',
      `The MCP slice contains unrelated root key(s): ${unexpectedRootKeys.join(', ')}. Per the Codex adapter, the ` +
      'MCP slice of .codex/config.toml must only contain mcp_servers — this expert only audits that slice.');
    naRemaining(ALL_CHECKS.filter((id) => id !== 'structure.valid_toml'), 'Unrelated root key present — remaining checks not evaluable');
    return outcomes;
  }
  record('structure.valid_toml', 'pass', '.codex/config.toml MCP slice is valid TOML with only the mcp_servers root key');

  const remainingAfterStructure = [
    'structure.no_unknown_server_keys', 'server.transport_resolvable', 'server.required_fields',
    'server.no_sse', 'server.env_no_plain_secrets', 'security.https_for_remote_servers',
  ];

  const mcpServers = root.mcp_servers;
  if (mcpServers === undefined || mcpServers === null) {
    record('structure.mcp_servers_table', 'fail', 'mcp_servers key missing from .codex/config.toml');
    naRemaining(remainingAfterStructure, 'mcp_servers key missing');
    naRemaining(['security.no_alwaysLoad_overuse', 'security.oauth_or_auth_documented',
      'crossref.referenced_in_hooks', 'crossref.referenced_in_subagents',
      'crossref.referenced_in_permissions', 'crossref.unused_servers'], 'mcp_servers key missing');
    return outcomes;
  }
  if (Array.isArray(mcpServers) || typeof mcpServers !== 'object') {
    record('structure.mcp_servers_table', 'fail', `mcp_servers is not a table (got: ${Array.isArray(mcpServers) ? 'array' : typeof mcpServers})`);
    naRemaining(remainingAfterStructure, 'mcp_servers is not a table');
    naRemaining(['security.no_alwaysLoad_overuse', 'security.oauth_or_auth_documented',
      'crossref.referenced_in_hooks', 'crossref.referenced_in_subagents',
      'crossref.referenced_in_permissions', 'crossref.unused_servers'], 'mcp_servers is not a table');
    return outcomes;
  }
  record('structure.mcp_servers_table', 'pass', 'mcp_servers is a valid table');

  const serverEntries = Object.entries(mcpServers);
  if (serverEntries.length === 0) {
    naRemaining(remainingAfterStructure, 'mcp_servers is empty — no servers to validate');
    naRemaining(['security.no_alwaysLoad_overuse', 'security.oauth_or_auth_documented',
      'crossref.referenced_in_hooks', 'crossref.referenced_in_subagents',
      'crossref.referenced_in_permissions', 'crossref.unused_servers'], 'mcp_servers is empty');
    return outcomes;
  }

  // structure.no_unknown_server_keys
  {
    const violations = [];
    for (const [name, def] of serverEntries) {
      if (!def || typeof def !== 'object') continue;
      const unknownKeys = Object.keys(def).filter((k) => !KNOWN_SERVER_KEYS.has(k));
      if (unknownKeys.length > 0) violations.push(`server '${name}' has unknown key(s): ${unknownKeys.join(', ')}`);
    }
    record('structure.no_unknown_server_keys', violations.length === 0 ? 'pass' : 'fail',
      violations.length === 0 ? `All ${serverEntries.length} server(s) use only recognised keys` : violations.join('; '));
  }

  // server.transport_resolvable
  {
    const violations = [];
    for (const [name, def] of serverEntries) {
      if (!def || typeof def !== 'object') continue;
      const hasUrl = typeof def.url === 'string' && def.url.length > 0;
      const hasCommand = typeof def.command === 'string' && def.command.length > 0;
      if (hasUrl && hasCommand) {
        violations.push(`server '${name}' declares both url and command — transport resolves to http, command is ignored`);
      } else if (!hasUrl && !hasCommand) {
        violations.push(`server '${name}' declares neither url nor command — resolves to stdio with no command`);
      }
    }
    record('server.transport_resolvable', violations.length === 0 ? 'pass' : 'fail',
      violations.length === 0 ? `All ${serverEntries.length} server(s) have an unambiguous transport signal` : violations.join('; '));
  }

  // server.required_fields
  {
    const missing = [];
    for (const [name, def] of serverEntries) {
      if (!def || typeof def !== 'object') continue;
      const hasUrl = typeof def.url === 'string' && def.url.length > 0;
      if (hasUrl) continue; // url present and non-empty → http, satisfied
      if (typeof def.url === 'string' && def.url.length === 0) {
        missing.push(`server '${name}' has an empty url`);
        continue;
      }
      if (!def.command || typeof def.command !== 'string' || def.command.trim() === '') {
        missing.push(`server '${name}' (inferred stdio) missing required field: command`);
      }
    }
    record('server.required_fields', missing.length === 0 ? 'pass' : 'fail',
      missing.length === 0 ? 'All servers have the required field for their inferred transport' : missing.join('; '));
  }

  // server.no_sse
  {
    const sseServers = [];
    for (const [name, def] of serverEntries) {
      if (!def || typeof def !== 'object') continue;
      const typeLike = def.type ?? def.transport;
      if (typeof typeLike === 'string' && typeLike.toLowerCase() === 'sse') sseServers.push(name);
    }
    record('server.no_sse', sseServers.length === 0 ? 'pass' : 'fail',
      sseServers.length === 0
        ? 'No server requests the unrepresentable sse transport'
        : `Server(s) requesting the unsupported sse transport (Codex cannot represent it): ${sseServers.join(', ')}`);
  }

  // server.env_no_plain_secrets
  {
    const violations = [];
    for (const [name, def] of serverEntries) {
      if (!def || typeof def !== 'object') continue;
      const plainKeys = [];
      for (const mapKey of ['env', 'http_headers']) {
        if (def[mapKey] && typeof def[mapKey] === 'object') {
          for (const [k, v] of Object.entries(def[mapKey])) {
            if (SECRET_KEY_PATTERN.test(k) && typeof v === 'string' && !v.includes('${')) plainKeys.push(`${mapKey}.${k}`);
          }
        }
      }
      if (plainKeys.length > 0) violations.push(`server '${name}': plain-text value for key(s): ${plainKeys.join(', ')}`);
    }
    record('server.env_no_plain_secrets', violations.length === 0 ? 'pass' : 'fail',
      violations.length === 0 ? 'No plain-text secrets found in env or http_headers' : violations.join('; '));
  }

  // security.https_for_remote_servers
  {
    const remoteServers = serverEntries.filter(([, def]) => typeof def?.url === 'string' && def.url.length > 0);
    if (remoteServers.length === 0) {
      record('security.https_for_remote_servers', 'na', 'No servers declare a url — HTTPS check not applicable');
    } else {
      const violations = remoteServers.filter(([, def]) => /^http:\/\//i.test(def.url)).map(([name, def]) => `server '${name}' (${def.url})`);
      record('security.https_for_remote_servers', violations.length === 0 ? 'pass' : 'fail',
        violations.length === 0
          ? `All ${remoteServers.length} remote server(s) use HTTPS`
          : `Server(s) using non-HTTPS URL: ${violations.join(', ')}`);
    }
  }

  // Structurally always-N/A checks (no Codex equivalent yet) — driven by the manifest so the
  // taxonomy stays the single source of truth for which checks these are and why.
  naRemaining(['security.no_alwaysLoad_overuse', 'security.oauth_or_auth_documented',
    'crossref.referenced_in_hooks', 'crossref.referenced_in_subagents',
    'crossref.referenced_in_permissions', 'crossref.unused_servers'], 'No Codex equivalent');

  return outcomes;
}
