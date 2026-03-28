export type AgentEnvironmentId = 'cursor' | 'codex' | 'claude';

export interface AgentEnvironmentStatus {
  id: AgentEnvironmentId;
  label: string;
  targetPath: string;
  markerExists: boolean;
  installedCount: number;
  totalExpected: number;
}

export interface AgentInstallStatus {
  repoPath: string;
  environments: AgentEnvironmentStatus[];
}

export interface AgentInstallRequest {
  repoPath: string;
  targets: AgentEnvironmentId[];
  force?: boolean;
}

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
