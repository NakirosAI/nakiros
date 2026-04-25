import type { AgentProfile } from './workspace.js';
import type { WorkspaceMCP, WorkspaceDoc } from './workspace-settings.js';
import type { WorkspaceContext } from './server.js';

/**
 * One Nakiros command file already installed on disk (under `~/.claude/commands`,
 * `~/.cursor/commands`, or `~/.codex/commands`). Returned by
 * `agents:installed-commands` to drive the "Already installed" panel of the UI.
 */
export interface InstalledCommand {
  id: string;
  command: string;
  kind: 'agent' | 'workflow';
  fileName: string;
}

/** Persisted repo entry inside a {@link StoredWorkspace}. */
export interface StoredRepo {
  name: string;
  localPath: string;
  url?: string;
  role: string;
  profile: AgentProfile;
  llmDocs: string[];
}

/**
 * Workspace record persisted on disk (under `~/.nakiros/`). Holds the repos,
 * optional PM tool integration, workspace-level docs, MCPs, and rendered
 * workspace context.
 */
export interface StoredWorkspace {
  id: string;
  name: string;
  workspacePath?: string;
  repos: StoredRepo[];
  pmTool?: 'github' | 'gitlab' | 'linear';
  projectKey?: string;
  createdAt: string;
  lastOpenedAt: string;
  topology?: 'mono' | 'multi';
  ticketPrefix?: string;
  ticketCounter?: number;
  mcps?: WorkspaceMCP[];
  projectDocs?: WorkspaceDoc[];
  documentLanguage?: string;
  branchPattern?: string;
  pmBoardId?: string;
  context?: WorkspaceContext;
}
