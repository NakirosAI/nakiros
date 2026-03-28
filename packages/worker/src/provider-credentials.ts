import { z } from 'zod';
import type {
  ProviderCredentialRow,
  WorkspaceProviderBindingRow,
} from './storage.js';

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

export interface ProviderCredentialDeleteImpact {
  credential: ProviderCredentialSummary;
  canDelete: boolean;
  impactedWorkspaces: ProviderCredentialUsage[];
}

export interface SecretStoreBinding {
  get(): Promise<string>;
}

export interface ProviderCredentialsEnv {
  PROVIDER_CREDENTIALS_MASTER_KEY?: SecretStoreBinding | string;
}

const providerSchema = z.enum(['jira', 'github', 'gitlab']);

const jiraMetadataSchema = z.object({
  baseUrl: z.string().url(),
  email: z.string().email().optional(),
});

const gitHubMetadataSchema = z.object({
  baseUrl: z.string().url().optional(),
});

const gitLabMetadataSchema = z.object({
  baseUrl: z.string().url(),
});

const createProviderCredentialSchema = z.object({
  provider: providerSchema,
  label: z.string().trim().min(1).max(80),
  secret: z.string().min(1).max(4096),
  metadata: z.unknown(),
});

const updateProviderCredentialSchema = z.object({
  label: z.string().trim().min(1).max(80).optional(),
  secret: z.string().min(1).max(4096).optional(),
  metadata: z.unknown().optional(),
});

const bindWorkspaceCredentialSchema = z.object({
  provider: providerSchema,
  credentialId: z.string().trim().min(1),
  isDefault: z.boolean().optional(),
});

const setWorkspaceDefaultSchema = z.object({
  provider: providerSchema,
  credentialId: z.string().trim().min(1),
});

const CURRENT_KEY_VERSION = 1;
let cachedMasterKey: Promise<CryptoKey> | null = null;

function normalizeUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.trim().replace(/\/+$/, '');
}

export function parseProviderCredentialMetadata(
  provider: ProviderCredentialProvider,
  input: unknown,
): ProviderCredentialMetadata {
  switch (provider) {
    case 'jira': {
      const parsed = jiraMetadataSchema.parse(input);
      return {
        baseUrl: normalizeUrl(parsed.baseUrl)!,
        ...(parsed.email ? { email: parsed.email.trim().toLowerCase() } : {}),
      };
    }
    case 'github': {
      const parsed = gitHubMetadataSchema.parse(input);
      return {
        ...(parsed.baseUrl ? { baseUrl: normalizeUrl(parsed.baseUrl) } : {}),
      };
    }
    case 'gitlab': {
      const parsed = gitLabMetadataSchema.parse(input);
      return {
        baseUrl: normalizeUrl(parsed.baseUrl)!,
      };
    }
  }
}

export function parseCreateProviderCredentialInput(input: unknown): {
  provider: ProviderCredentialProvider;
  label: string;
  secret: string;
  metadata: ProviderCredentialMetadata;
} {
  const parsed = createProviderCredentialSchema.parse(input);
  return {
    provider: parsed.provider,
    label: parsed.label.trim(),
    secret: parsed.secret,
    metadata: parseProviderCredentialMetadata(parsed.provider, parsed.metadata),
  };
}

export function parseUpdateProviderCredentialInput(
  provider: ProviderCredentialProvider,
  input: unknown,
): {
  label?: string;
  secret?: string;
  metadata?: ProviderCredentialMetadata;
} {
  const parsed = updateProviderCredentialSchema.parse(input);
  return {
    ...(parsed.label ? { label: parsed.label.trim() } : {}),
    ...(parsed.secret ? { secret: parsed.secret } : {}),
    ...(parsed.metadata !== undefined
      ? { metadata: parseProviderCredentialMetadata(provider, parsed.metadata) }
      : {}),
  };
}

export function parseBindWorkspaceCredentialInput(input: unknown): {
  provider: ProviderCredentialProvider;
  credentialId: string;
  isDefault: boolean;
} {
  const parsed = bindWorkspaceCredentialSchema.parse(input);
  return {
    provider: parsed.provider,
    credentialId: parsed.credentialId,
    isDefault: parsed.isDefault ?? false,
  };
}

export function parseSetWorkspaceDefaultInput(input: unknown): {
  provider: ProviderCredentialProvider;
  credentialId: string;
} {
  return setWorkspaceDefaultSchema.parse(input);
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

async function getMasterKey(env: ProviderCredentialsEnv): Promise<CryptoKey> {
  if (!cachedMasterKey) {
    const binding = env.PROVIDER_CREDENTIALS_MASTER_KEY;
    if (!binding) {
      throw new Error(
        'Provider credentials master key is not configured. Bind PROVIDER_CREDENTIALS_MASTER_KEY via Cloudflare Secrets Store before creating credentials.',
      );
    }

    const secretPromise =
      typeof binding === 'string'
        ? Promise.resolve(binding)
        : typeof binding.get === 'function'
          ? binding.get()
          : Promise.reject(
            new Error(
              'Provider credentials master key binding is invalid. Expected a Cloudflare Secrets Store binding or Worker secret.',
            ),
          );

    cachedMasterKey = secretPromise.then(async (secret) => {
      const secretBytes = decodeBase64(secret.trim());
      if (secretBytes.byteLength !== 32) {
        throw new Error('Provider credentials master key must be a base64-encoded 32-byte value');
      }
      return crypto.subtle.importKey(
        'raw',
        secretBytes,
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt'],
      );
    });
  }
  return cachedMasterKey;
}

export async function encryptProviderSecret(
  env: ProviderCredentialsEnv,
  secret: string,
): Promise<{ secretCiphertext: string; iv: string; authTag: string; keyVersion: number }> {
  const key = await getMasterKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encodedSecret = new TextEncoder().encode(secret);
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encodedSecret),
  );
  const authTagLength = 16;
  return {
    secretCiphertext: encodeBase64(encrypted.slice(0, encrypted.length - authTagLength)),
    iv: encodeBase64(iv),
    authTag: encodeBase64(encrypted.slice(encrypted.length - authTagLength)),
    keyVersion: CURRENT_KEY_VERSION,
  };
}

export async function decryptProviderSecret(
  env: ProviderCredentialsEnv,
  row: Pick<ProviderCredentialRow, 'secretCiphertext' | 'iv' | 'authTag'>,
): Promise<string> {
  const key = await getMasterKey(env);
  const combined = new Uint8Array([
    ...decodeBase64(row.secretCiphertext),
    ...decodeBase64(row.authTag),
  ]);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: decodeBase64(row.iv) },
    key,
    combined,
  );
  return new TextDecoder().decode(decrypted);
}

export function toProviderCredentialSummary(
  row: ProviderCredentialRow,
  usage: ProviderCredentialUsage[],
): ProviderCredentialSummary {
  return {
    id: row.id,
    provider: row.provider as ProviderCredentialProvider,
    label: row.label,
    metadata: JSON.parse(row.metadata) as ProviderCredentialMetadata,
    isRevoked: row.revokedAt !== null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    usage,
  };
}

export function toWorkspaceBinding(
  row: WorkspaceProviderBindingRow,
  credential: ProviderCredentialSummary,
): WorkspaceProviderBinding {
  return {
    workspaceId: row.workspaceId,
    credentialId: row.credentialId,
    provider: row.provider as ProviderCredentialProvider,
    isDefault: row.isDefault,
    createdAt: row.createdAt,
    credential,
  };
}
