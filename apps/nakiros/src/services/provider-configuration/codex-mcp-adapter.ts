import type {
  CanonicalMcpConfiguration,
  CanonicalMcpServer,
  ConfigurationAdapterResult,
  ConfigurationDiagnostic,
} from '@nakiros/shared';
import { parseTOML } from 'confbox';

import type { McpConfigurationAdapter } from './adapter.js';
import { hasErrors, validateCanonicalMcp } from './mcp-validation.js';

const SERVER_KEYS = new Set(['command', 'args', 'env', 'url', 'http_headers']);

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readStringArray(
  serverName: string,
  key: string,
  value: unknown,
  diagnostics: ConfigurationDiagnostic[],
): string[] | undefined {
  if (value === undefined) return undefined;
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    return value as string[];
  }
  diagnostics.push({
    code: `invalid-${key}`,
    severity: 'error',
    message: `Codex MCP server "${serverName}" ${key} must be an array of strings.`,
    path: `mcp_servers.${serverName}.${key}`,
  });
  return undefined;
}

function readStringMap(
  serverName: string,
  key: 'env' | 'http_headers',
  value: unknown,
  diagnostics: ConfigurationDiagnostic[],
): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  const record = object(value);
  if (record && Object.values(record).every((item) => typeof item === 'string')) {
    return record as Record<string, string>;
  }
  diagnostics.push({
    code: `invalid-${key}`,
    severity: 'error',
    message: `Codex MCP server "${serverName}" ${key} values must be strings.`,
    path: `mcp_servers.${serverName}.${key}`,
  });
  return undefined;
}

function parseServer(
  name: string,
  value: unknown,
  diagnostics: ConfigurationDiagnostic[],
): CanonicalMcpServer | null {
  const source = object(value);
  if (!source) {
    diagnostics.push({
      code: 'invalid-server-object',
      severity: 'error',
      message: `Codex MCP server "${name}" must be a TOML table.`,
      path: `mcp_servers.${name}`,
    });
    return null;
  }
  if (source.command !== undefined && typeof source.command !== 'string') {
    diagnostics.push({
      code: 'invalid-command',
      severity: 'error',
      message: `Codex MCP server "${name}" command must be a string.`,
      path: `mcp_servers.${name}.command`,
    });
  }
  if (source.url !== undefined && typeof source.url !== 'string') {
    diagnostics.push({
      code: 'invalid-url',
      severity: 'error',
      message: `Codex MCP server "${name}" url must be a string.`,
      path: `mcp_servers.${name}.url`,
    });
  }
  const args = readStringArray(name, 'args', source.args, diagnostics);
  const env = readStringMap(name, 'env', source.env, diagnostics);
  const headers = readStringMap(name, 'http_headers', source.http_headers, diagnostics);
  const unknown = Object.fromEntries(
    Object.entries(source).filter(([key]) => !SERVER_KEYS.has(key)),
  );
  const hasUrl = typeof source.url === 'string';
  return {
    name,
    transport: hasUrl ? 'http' : 'stdio',
    ...(typeof source.command === 'string' ? { command: source.command } : {}),
    ...(args ? { args } : {}),
    ...(env ? { env } : {}),
    ...(hasUrl ? { url: source.url as string } : {}),
    ...(headers ? { headers } : {}),
    ...(Object.keys(unknown).length > 0 ? { extensions: { codex: unknown } } : {}),
  };
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function tomlKey(value: string): string {
  return /^[A-Za-z0-9_-]+$/.test(value) ? value : tomlString(value);
}

function tomlValue(
  value: unknown,
  path: string,
  diagnostics: ConfigurationDiagnostic[],
): string | null {
  if (typeof value === 'string') return tomlString(value);
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    return `[${value.map((item) => tomlString(item)).join(', ')}]`;
  }
  diagnostics.push({
    code: 'unsupported-codex-extension',
    severity: 'error',
    message: 'Codex extension values must be strings, finite numbers, booleans or string arrays.',
    path,
  });
  return null;
}

function renderTable(
  path: string[],
  values: Record<string, unknown>,
  diagnostics: ConfigurationDiagnostic[],
): string[] {
  const scalars: string[] = [];
  const nested: Array<[string, Record<string, unknown>]> = [];
  for (const key of Object.keys(values).sort()) {
    const value = values[key];
    const record = object(value);
    if (record) {
      nested.push([key, record]);
      continue;
    }
    const rendered = tomlValue(value, [...path, key].join('.'), diagnostics);
    if (rendered !== null) scalars.push(`${tomlKey(key)} = ${rendered}`);
  }
  const lines = [`[${path.map(tomlKey).join('.')}]`, ...scalars];
  for (const [key, record] of nested) {
    lines.push('', ...renderTable([...path, key], record, diagnostics));
  }
  return lines;
}

export const codexMcpConfigurationAdapter: McpConfigurationAdapter = {
  provider: 'codex',
  artifact: 'mcp',

  parse(source): ConfigurationAdapterResult<CanonicalMcpConfiguration> {
    let rootValue: unknown;
    try {
      rootValue = parseTOML(source || '');
    } catch (error) {
      return {
        ok: false,
        diagnostics: [{
          code: 'invalid-codex-toml',
          severity: 'error',
          message: error instanceof Error ? error.message : 'Invalid Codex MCP TOML.',
        }],
      };
    }
    const root = object(rootValue);
    const servers = object(root?.mcp_servers);
    if (!root || (root.mcp_servers !== undefined && !servers)) {
      return {
        ok: false,
        diagnostics: [{
          code: 'invalid-codex-mcp-root',
          severity: 'error',
          message: 'Codex MCP configuration must contain an mcp_servers table.',
        }],
      };
    }
    const unexpectedRootKeys = Object.keys(root).filter((key) => key !== 'mcp_servers');
    if (unexpectedRootKeys.length > 0) {
      return {
        ok: false,
        diagnostics: unexpectedRootKeys.map((key) => ({
          code: 'unexpected-codex-root-key',
          severity: 'error' as const,
          message: `The MCP slice contains the unrelated Codex key "${key}".`,
          path: key,
        })),
      };
    }
    const diagnostics: ConfigurationDiagnostic[] = [];
    const configuration: CanonicalMcpConfiguration = {
      artifact: 'mcp',
      servers: Object.entries(servers ?? {})
        .map(([name, value]) => parseServer(name, value, diagnostics))
        .filter((server): server is CanonicalMcpServer => server !== null),
    };
    diagnostics.push(...validateCanonicalMcp(configuration));
    return hasErrors(diagnostics)
      ? { ok: false, diagnostics }
      : { ok: true, value: configuration, diagnostics };
  },

  render(configuration): ConfigurationAdapterResult<string> {
    const diagnostics = validateCanonicalMcp(configuration);
    if (hasErrors(diagnostics)) return { ok: false, diagnostics };
    const sections: string[] = [];
    for (const [index, server] of [...configuration.servers]
      .sort((a, b) => a.name.localeCompare(b.name)).entries()) {
      if (server.transport === 'sse') {
        diagnostics.push({
          code: 'unsupported-codex-transport',
          severity: 'error',
          message: 'Codex MCP configuration cannot represent the legacy SSE transport explicitly.',
          path: `servers[${index}].transport`,
        });
      }
      const reserved = Object.keys(server.extensions?.codex ?? {})
        .filter((key) => SERVER_KEYS.has(key));
      for (const key of reserved) {
        diagnostics.push({
          code: 'reserved-codex-extension-key',
          severity: 'error',
          message: `Codex extension key "${key}" belongs in the canonical MCP fields.`,
          path: `servers[${index}].extensions.codex.${key}`,
        });
      }
      const values: Record<string, unknown> = {
        ...(server.extensions?.codex ?? {}),
        ...(server.command ? { command: server.command } : {}),
        ...(server.args ? { args: server.args } : {}),
        ...(server.env ? { env: server.env } : {}),
        ...(server.url ? { url: server.url } : {}),
        ...(server.headers ? { http_headers: server.headers } : {}),
      };
      sections.push(renderTable(['mcp_servers', server.name], values, diagnostics).join('\n'));
    }
    if (hasErrors(diagnostics)) return { ok: false, diagnostics };
    const value = sections.length > 0 ? `${sections.join('\n\n')}\n` : '';
    return { ok: true, value, diagnostics };
  },
};
