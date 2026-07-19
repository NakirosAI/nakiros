import type {
  CanonicalMcpConfiguration,
  CanonicalMcpServer,
  ConfigurationAdapterResult,
  ConfigurationDiagnostic,
} from '@nakiros/shared';

import type { McpConfigurationAdapter } from './adapter.js';
import { hasErrors, validateCanonicalMcp } from './mcp-validation.js';

const SERVER_KEYS = new Set(['type', 'transport', 'command', 'args', 'env', 'url', 'headers']);

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringMap(value: unknown): Record<string, string> | undefined {
  const record = object(value);
  if (!record) return undefined;
  const entries = Object.entries(record);
  if (!entries.every(([, item]) => typeof item === 'string')) return undefined;
  return Object.fromEntries(entries) as Record<string, string>;
}

function readStringMap(
  serverName: string,
  key: 'env' | 'headers',
  value: unknown,
  diagnostics: ConfigurationDiagnostic[],
): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  const result = stringMap(value);
  if (!result) {
    diagnostics.push({
      code: `invalid-${key}`,
      severity: 'error',
      message: `Claude MCP server "${serverName}" ${key} values must be strings.`,
      path: `mcpServers.${serverName}.${key}`,
    });
  }
  return result;
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
      message: `Claude MCP server "${name}" must be a JSON object.`,
      path: `mcpServers.${name}`,
    });
    return null;
  }
  if (source.command !== undefined && typeof source.command !== 'string') {
    diagnostics.push({
      code: 'invalid-command',
      severity: 'error',
      message: `Claude MCP server "${name}" command must be a string.`,
      path: `mcpServers.${name}.command`,
    });
  }
  if (source.url !== undefined && typeof source.url !== 'string') {
    diagnostics.push({
      code: 'invalid-url',
      severity: 'error',
      message: `Claude MCP server "${name}" url must be a string.`,
      path: `mcpServers.${name}.url`,
    });
  }
  const explicit = source.type ?? source.transport;
  if (explicit !== undefined && explicit !== 'sse' && explicit !== 'http' && explicit !== 'stdio') {
    diagnostics.push({
      code: 'invalid-transport',
      severity: 'error',
      message: `Claude MCP server "${name}" has an unsupported transport.`,
      path: `mcpServers.${name}.type`,
    });
  }
  const transport = explicit === 'sse' || explicit === 'http' || explicit === 'stdio'
    ? explicit
    : typeof source.url === 'string' ? 'http' : 'stdio';
  const args = source.args === undefined
    ? undefined
    : Array.isArray(source.args) && source.args.every((item) => typeof item === 'string')
      ? source.args as string[]
      : null;
  if (args === null) {
    diagnostics.push({
      code: 'invalid-args',
      severity: 'error',
      message: `Claude MCP server "${name}" args must be strings.`,
      path: `mcpServers.${name}.args`,
    });
  }
  const env = readStringMap(name, 'env', source.env, diagnostics);
  const headers = readStringMap(name, 'headers', source.headers, diagnostics);
  const unknown = Object.fromEntries(
    Object.entries(source).filter(([key]) => !SERVER_KEYS.has(key)),
  );
  return {
    name,
    transport,
    ...(typeof source.command === 'string' ? { command: source.command } : {}),
    ...(args ? { args } : {}),
    ...(env ? { env } : {}),
    ...(typeof source.url === 'string' ? { url: source.url } : {}),
    ...(headers ? { headers } : {}),
    ...(Object.keys(unknown).length > 0 ? { extensions: { claude: unknown } } : {}),
  };
}

export const claudeMcpConfigurationAdapter: McpConfigurationAdapter = {
  provider: 'claude',
  artifact: 'mcp',

  parse(source): ConfigurationAdapterResult<CanonicalMcpConfiguration> {
    let rootValue: unknown;
    try {
      rootValue = JSON.parse(source || '{}');
    } catch (error) {
      return {
        ok: false,
        diagnostics: [{
          code: 'invalid-claude-json',
          severity: 'error',
          message: error instanceof Error ? error.message : 'Invalid Claude MCP JSON.',
        }],
      };
    }
    const root = object(rootValue);
    const servers = object(root?.mcpServers);
    if (!root || (root.mcpServers !== undefined && !servers)) {
      return {
        ok: false,
        diagnostics: [{
          code: 'invalid-claude-mcp-root',
          severity: 'error',
          message: 'Claude MCP configuration must contain an mcpServers object.',
        }],
      };
    }
    const diagnostics: ConfigurationDiagnostic[] = [];
    const configuration: CanonicalMcpConfiguration = {
      artifact: 'mcp',
      servers: Object.entries(servers ?? {})
        .map(([name, value]) => parseServer(name, value, diagnostics))
        .filter((server): server is CanonicalMcpServer => server !== null),
      ...(Object.keys(root).some((key) => key !== 'mcpServers')
        ? {
            extensions: {
              claude: Object.fromEntries(Object.entries(root).filter(([key]) => key !== 'mcpServers')),
            },
          }
        : {}),
    };
    diagnostics.push(...validateCanonicalMcp(configuration));
    return hasErrors(diagnostics)
      ? { ok: false, diagnostics }
      : { ok: true, value: configuration, diagnostics };
  },

  render(configuration): ConfigurationAdapterResult<string> {
    const diagnostics = validateCanonicalMcp(configuration);
    if (hasErrors(diagnostics)) return { ok: false, diagnostics };
    for (const [index, server] of configuration.servers.entries()) {
      const reserved = Object.keys(server.extensions?.claude ?? {})
        .filter((key) => SERVER_KEYS.has(key));
      for (const key of reserved) {
        diagnostics.push({
          code: 'reserved-claude-extension-key',
          severity: 'error',
          message: `Claude extension key "${key}" belongs in the canonical MCP fields.`,
          path: `servers[${index}].extensions.claude.${key}`,
        });
      }
    }
    if (hasErrors(diagnostics)) return { ok: false, diagnostics };
    const mcpServers: Record<string, unknown> = {};
    for (const server of configuration.servers) {
      mcpServers[server.name] = {
        ...(server.extensions?.claude ?? {}),
        type: server.transport,
        ...(server.command ? { command: server.command } : {}),
        ...(server.args ? { args: server.args } : {}),
        ...(server.env ? { env: server.env } : {}),
        ...(server.url ? { url: server.url } : {}),
        ...(server.headers ? { headers: server.headers } : {}),
      };
    }
    const root = { ...(configuration.extensions?.claude ?? {}), mcpServers };
    return { ok: true, value: `${JSON.stringify(root, null, 2)}\n`, diagnostics };
  },
};
