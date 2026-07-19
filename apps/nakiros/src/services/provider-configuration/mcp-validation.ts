import type {
  CanonicalMcpConfiguration,
  ConfigurationDiagnostic,
} from '@nakiros/shared';

const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const TRANSPORTS = new Set(['stdio', 'http', 'sse']);

function isStringMap(value: unknown): boolean {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.values(value as Record<string, unknown>).every((item) => typeof item === 'string');
}

export function validateCanonicalMcp(
  configuration: CanonicalMcpConfiguration,
): ConfigurationDiagnostic[] {
  const diagnostics: ConfigurationDiagnostic[] = [];
  const rawConfiguration = configuration as unknown as Record<string, unknown>;
  if (rawConfiguration.artifact !== 'mcp') {
    diagnostics.push({
      code: 'invalid-artifact',
      severity: 'error',
      message: 'Canonical MCP configuration must declare the mcp artifact.',
      path: 'artifact',
    });
  }
  if (!Array.isArray(rawConfiguration.servers)) {
    diagnostics.push({
      code: 'invalid-servers',
      severity: 'error',
      message: 'Canonical MCP configuration servers must be an array.',
      path: 'servers',
    });
    return diagnostics;
  }
  const names = new Set<string>();

  for (const [index, server] of rawConfiguration.servers.entries()) {
    const path = `servers[${index}]`;
    if (server === null || typeof server !== 'object' || Array.isArray(server)) {
      diagnostics.push({
        code: 'invalid-server-object',
        severity: 'error',
        message: 'Canonical MCP servers must be objects.',
        path,
      });
      continue;
    }
    const raw = server as Record<string, unknown>;
    const name = typeof raw.name === 'string' ? raw.name : '';
    const transport = typeof raw.transport === 'string' ? raw.transport : '';
    if (!NAME_PATTERN.test(name)) {
      diagnostics.push({
        code: 'invalid-server-name',
        severity: 'error',
        message: 'MCP server names must use letters, digits, dashes and underscores.',
        path: `${path}.name`,
      });
    } else if (names.has(name)) {
      diagnostics.push({
        code: 'duplicate-server-name',
        severity: 'error',
        message: `MCP server "${name}" is declared more than once.`,
        path: `${path}.name`,
      });
    }
    names.add(name);

    if (!TRANSPORTS.has(transport)) {
      diagnostics.push({
        code: 'invalid-transport',
        severity: 'error',
        message: `MCP server "${name}" has an unsupported transport.`,
        path: `${path}.transport`,
      });
    }
    if (raw.command !== undefined && typeof raw.command !== 'string') {
      diagnostics.push({
        code: 'invalid-command',
        severity: 'error',
        message: `MCP server "${name}" command must be a string.`,
        path: `${path}.command`,
      });
    }
    if (raw.url !== undefined && typeof raw.url !== 'string') {
      diagnostics.push({
        code: 'invalid-url',
        severity: 'error',
        message: `MCP server "${name}" URL must be a string.`,
        path: `${path}.url`,
      });
    }
    if (raw.args !== undefined
      && (!Array.isArray(raw.args) || !raw.args.every((item) => typeof item === 'string'))) {
      diagnostics.push({
        code: 'invalid-args',
        severity: 'error',
        message: `MCP server "${name}" args must be strings.`,
        path: `${path}.args`,
      });
    }
    for (const key of ['env', 'headers'] as const) {
      if (raw[key] !== undefined && !isStringMap(raw[key])) {
        diagnostics.push({
          code: `invalid-${key}`,
          severity: 'error',
          message: `MCP server "${name}" ${key} values must be strings.`,
          path: `${path}.${key}`,
        });
      }
    }

    if (transport === 'stdio' && (typeof raw.command !== 'string' || !raw.command.trim())) {
      diagnostics.push({
        code: 'stdio-command-required',
        severity: 'error',
        message: `stdio MCP server "${name}" requires a command.`,
        path: `${path}.command`,
      });
    }
    if ((transport === 'http' || transport === 'sse')
      && (typeof raw.url !== 'string' || !raw.url.trim())) {
      diagnostics.push({
        code: 'remote-url-required',
        severity: 'error',
        message: `${transport} MCP server "${name}" requires a URL.`,
        path: `${path}.url`,
      });
    }
  }

  return diagnostics;
}

export function hasErrors(diagnostics: ConfigurationDiagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === 'error');
}
