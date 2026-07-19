import type { AgentProvider } from './agent.js';

/** Providers with a native project-configuration adapter in Hestia. */
export type ConfigurationProvider = Extract<AgentProvider, 'claude' | 'codex'>;

/** Provider-neutral artefact families understood by configuration experts. */
export type ConfigurationArtifactKind =
  | 'instructions'
  | 'rules'
  | 'subagents'
  | 'hooks'
  | 'permissions'
  | 'mcp'
  | 'native-config';

/** Explicit run target. The provider must never be inferred from file content. */
export interface ProviderConfigurationTarget {
  provider: ConfigurationProvider;
  artifact: ConfigurationArtifactKind;
  scope: 'project';
  projectId: string;
  resourceId: string;
}

export interface ConfigurationDiagnostic {
  code: string;
  severity: 'error' | 'warning';
  message: string;
  path?: string;
}

export type ConfigurationAdapterResult<T> =
  | { ok: true; value: T; diagnostics: ConfigurationDiagnostic[] }
  | { ok: false; diagnostics: ConfigurationDiagnostic[] };

export type CanonicalMcpTransport = 'stdio' | 'http' | 'sse';

/**
 * Provider-neutral MCP intent consumed by the shared expert.
 * Provider-only keys stay namespaced and are only emitted by their adapter.
 */
export interface CanonicalMcpServer {
  name: string;
  transport: CanonicalMcpTransport;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  extensions?: {
    claude?: Record<string, unknown>;
    codex?: Record<string, unknown>;
  };
}

export interface CanonicalMcpConfiguration {
  artifact: 'mcp';
  servers: CanonicalMcpServer[];
  extensions?: {
    /** Unknown top-level keys from Claude's standalone `.mcp.json`. */
    claude?: Record<string, unknown>;
  };
}
