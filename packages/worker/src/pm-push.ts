import type { D1Storage } from './storage.js';
import type { StoryRow } from './types.js';
import type { ProviderCredentialsEnv } from './provider-credentials.js';
import { decryptProviderSecret } from './provider-credentials.js';
import { buildJiraAuthHeader, buildJiraIssuePayload, createJiraIssue } from './jira-import.js';

export interface PushStoryResult {
  issueKey: string;
  provider: string;
}

export class PmNotSupportedError extends Error {
  constructor(public readonly provider: string) {
    super(`Push not yet supported for provider '${provider}'`);
    this.name = 'PmNotSupportedError';
  }
}

export async function pushStoryToProvider(args: {
  story: StoryRow;
  providerName: string;
  credentialId: string;
  storage: D1Storage;
  env: ProviderCredentialsEnv;
  projectKey: string;
}): Promise<PushStoryResult> {
  const { story, providerName, credentialId, storage, env, projectKey } = args;

  if (providerName === 'jira') {
    const credential = await storage.readProviderCredential(credentialId);
    if (!credential || credential.revokedAt) {
      throw new Error('Jira credential is revoked or missing');
    }
    const apiToken = await decryptProviderSecret(env, credential);
    const metadata = JSON.parse(credential.metadata) as { baseUrl: string; email: string };
    const authHeader = buildJiraAuthHeader(metadata.email, apiToken);
    const payload = buildJiraIssuePayload(story, projectKey);
    const { key } = await createJiraIssue(metadata.baseUrl, authHeader, payload);
    return { issueKey: key, provider: 'jira' };
  }

  // Future: case 'linear', case 'github', case 'gitlab'
  throw new PmNotSupportedError(providerName);
}
