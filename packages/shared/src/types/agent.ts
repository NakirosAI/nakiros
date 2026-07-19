/** AI coding-agent families understood by Nakiros. */
export type AgentProvider = 'claude' | 'codex' | 'gemini' | 'cursor';

/** A provider surface can have its own storage layout while sharing an agent family. */
export type AgentSurface = 'cli' | 'cowork';

/**
 * Provider features exposed to Nakiros modules. Adapters declare only the
 * capabilities they actually implement; consumers must not infer support
 * from the provider name.
 */
export type AgentCapability =
  | 'instructions'
  | 'skills'
  | 'rules'
  | 'subagents'
  | 'hooks'
  | 'permissions'
  | 'mcp'
  | 'output-styles'
  | 'native-config'
  | 'conversations';

/** One agent environment detected for a project. */
export interface ProjectAgentInstallation {
  provider: AgentProvider;
  surface: AgentSurface;
  /** Provider-owned directory containing conversations or project metadata. */
  providerProjectDir: string;
  capabilities: AgentCapability[];
}
