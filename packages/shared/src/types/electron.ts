/** Supported editor/agent integrations the Nakiros skill-command installer targets. */
export type AgentEnvironmentId = 'cursor' | 'codex' | 'claude';

/** Install status for one environment in a single repo (marker presence + command counts). */
export interface AgentEnvironmentStatus {
  id: AgentEnvironmentId;
  label: string;
  targetPath: string;
  markerExists: boolean;
  installedCount: number;
  totalExpected: number;
}

/** Aggregate install status across every environment for one repo. */
export interface AgentInstallStatus {
  repoPath: string;
  environments: AgentEnvironmentStatus[];
}

/** Request payload for the installer IPC call — target repo + environments. */
export interface AgentInstallRequest {
  repoPath: string;
  targets: AgentEnvironmentId[];
  force?: boolean;
}

/** Summary of what the installer actually wrote / overwrote on disk after a run. */
export interface AgentInstallSummary {
  repoPath: string;
  targets: AgentEnvironmentId[];
  commandFilesCopied: number;
  commandFilesOverwritten: number;
  runtimeFilesCopied: number;
  runtimeFilesOverwritten: number;
  workspaceDirsCreated: number;
  gitignorePatched: boolean;
}
