export type ProviderCredentialProvider = 'jira' | 'github' | 'gitlab';

export interface JiraProviderCredentialMetadata {
  baseUrl: string;
  email?: string;
}

export interface GitHubProviderCredentialMetadata {
  baseUrl?: string;
}

export interface GitLabProviderCredentialMetadata {
  baseUrl: string;
}

export type ProviderCredentialMetadata =
  | JiraProviderCredentialMetadata
  | GitHubProviderCredentialMetadata
  | GitLabProviderCredentialMetadata;

export interface ProviderCredentialUsage {
  workspaceId: string;
  workspaceName: string;
  isDefault: boolean;
}

export interface ProviderCredentialSummary {
  id: string;
  provider: ProviderCredentialProvider;
  label: string;
  metadata: ProviderCredentialMetadata;
  isRevoked: boolean;
  createdAt: string;
  updatedAt: string;
  usage: ProviderCredentialUsage[];
}

export interface CreateProviderCredentialInput {
  provider: ProviderCredentialProvider;
  label: string;
  secret: string;
  metadata: ProviderCredentialMetadata;
}

export interface UpdateProviderCredentialInput {
  label?: string;
  secret?: string;
  metadata?: ProviderCredentialMetadata;
}

export interface ProviderCredentialDeleteImpact {
  credential: ProviderCredentialSummary;
  canDelete: boolean;
  impactedWorkspaces: ProviderCredentialUsage[];
}

export interface WorkspaceProviderBinding {
  workspaceId: string;
  credentialId: string;
  provider: ProviderCredentialProvider;
  isDefault: boolean;
  createdAt: string;
  credential: ProviderCredentialSummary;
}

export interface WorkspaceProviderCredentialsPayload {
  workspaceId: string;
  bindings: WorkspaceProviderBinding[];
  availableCredentials: ProviderCredentialSummary[];
}

export interface BindWorkspaceProviderCredentialInput {
  provider: ProviderCredentialProvider;
  credentialId: string;
  isDefault?: boolean;
}

export interface SetWorkspaceProviderDefaultInput {
  provider: ProviderCredentialProvider;
  credentialId: string;
}
