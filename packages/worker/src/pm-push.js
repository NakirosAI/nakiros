import { decryptProviderSecret } from './provider-credentials.js';
import { buildJiraAuthHeader, buildJiraIssuePayload, createJiraIssue } from './jira-import.js';
export class PmNotSupportedError extends Error {
    provider;
    constructor(provider) {
        super(`Push not yet supported for provider '${provider}'`);
        this.provider = provider;
        this.name = 'PmNotSupportedError';
    }
}
export async function pushStoryToProvider(args) {
    const { story, providerName, credentialId, storage, env, projectKey } = args;
    if (providerName === 'jira') {
        const credential = await storage.readProviderCredential(credentialId);
        if (!credential || credential.revokedAt) {
            throw new Error('Jira credential is revoked or missing');
        }
        const apiToken = await decryptProviderSecret(env, credential);
        const metadata = JSON.parse(credential.metadata);
        const authHeader = buildJiraAuthHeader(metadata.email, apiToken);
        const payload = buildJiraIssuePayload(story, projectKey);
        const { key } = await createJiraIssue(metadata.baseUrl, authHeader, payload);
        return { issueKey: key, provider: 'jira' };
    }
    // Future: case 'linear', case 'github', case 'gitlab'
    throw new PmNotSupportedError(providerName);
}
