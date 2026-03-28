CREATE TABLE IF NOT EXISTS provider_credentials (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  label TEXT NOT NULL,
  metadata TEXT NOT NULL,
  secret_ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  key_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_provider_credentials_owner ON provider_credentials(owner_id);
CREATE INDEX IF NOT EXISTS idx_provider_credentials_provider ON provider_credentials(provider);

CREATE TABLE IF NOT EXISTS workspace_provider_bindings (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  credential_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  is_default TEXT NOT NULL DEFAULT '0',
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_provider_binding_unique
  ON workspace_provider_bindings(workspace_id, credential_id);

CREATE INDEX IF NOT EXISTS idx_workspace_provider_binding_workspace
  ON workspace_provider_bindings(workspace_id);

CREATE INDEX IF NOT EXISTS idx_workspace_provider_binding_credential
  ON workspace_provider_bindings(credential_id);

CREATE INDEX IF NOT EXISTS idx_workspace_provider_binding_provider
  ON workspace_provider_bindings(provider);
