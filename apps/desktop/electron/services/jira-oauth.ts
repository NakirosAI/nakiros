import { createHash, randomBytes } from 'crypto';
import { shell } from 'electron';

const JIRA_CLIENT_ID = 'Ue1CTYdgjQhaJMhNt7ICf7aIm72IzOFL';
const JIRA_CLIENT_SECRET = 'ATOA8WyH72Ns19FdL3IWeFMbN0xHy3SeRTrwZz3f2LMJpSgVOO-if6rrLFWVbnMDBlM42DCA78ED';
const JIRA_REDIRECT_URI = 'nakiros://oauth/jira';
const JIRA_SCOPES = 'read:jira-user read:jira-work offline_access';

export function generateState(): string {
  return randomBytes(16).toString('hex');
}

export function generatePKCE(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = randomBytes(48).toString('base64url');
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}

export function buildAuthUrl(state: string, codeChallenge: string): string {
  const params = new URLSearchParams({
    audience: 'api.atlassian.com',
    client_id: JIRA_CLIENT_ID,
    scope: JIRA_SCOPES,
    redirect_uri: JIRA_REDIRECT_URI,
    state,
    response_type: 'code',
    prompt: 'consent',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  return `https://auth.atlassian.com/authorize?${params.toString()}`;
}

export function openAuthUrl(state: string, codeChallenge: string): void {
  void shell.openExternal(buildAuthUrl(state, codeChallenge));
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
): Promise<TokenResponse> {
  const response = await fetch('https://auth.atlassian.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: JIRA_CLIENT_ID,
      client_secret: JIRA_CLIENT_SECRET,
      code,
      redirect_uri: JIRA_REDIRECT_URI,
      code_verifier: codeVerifier,
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token exchange failed (${response.status}): ${text}`);
  }
  return response.json() as Promise<TokenResponse>;
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const response = await fetch('https://auth.atlassian.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: JIRA_CLIENT_ID,
      client_secret: JIRA_CLIENT_SECRET,
      refresh_token: refreshToken,
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token refresh failed (${response.status}): ${text}`);
  }
  return response.json() as Promise<TokenResponse>;
}

export interface AccessibleResource {
  id: string;
  name: string;
  url: string;
  scopes: string[];
  avatarUrl: string;
}

export async function getAccessibleResources(accessToken: string): Promise<AccessibleResource[]> {
  const response = await fetch('https://api.atlassian.com/oauth/token/accessible-resources', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to get accessible resources (${response.status})`);
  }
  return response.json() as Promise<AccessibleResource[]>;
}

export async function getJiraUserInfo(
  accessToken: string,
  cloudId: string,
): Promise<{ displayName: string; emailAddress: string }> {
  const response = await fetch(
    `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/myself`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    },
  );
  if (!response.ok) {
    throw new Error(`Failed to get user info (${response.status})`);
  }
  return response.json() as Promise<{ displayName: string; emailAddress: string }>;
}
