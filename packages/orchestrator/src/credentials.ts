import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const CREDENTIALS_PATH = join(homedir(), '.nakiros', 'credentials.json');
const REFRESH_WINDOW_MS = 5 * 60 * 1000;

const AUTH_SERVER = 'https://auth.nakiros.com';
const CLIENT_ID = 'A4ec21b4916aD9b4C5a682C29A6D8747b0966e657704C5bfbd73137Ba8276cDB';

interface CliCredentials {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  apiUrl: string;
  email?: string | null;
}

function readCredentials(): CliCredentials | null {
  if (!existsSync(CREDENTIALS_PATH)) return null;
  try {
    return JSON.parse(readFileSync(CREDENTIALS_PATH, 'utf-8')) as CliCredentials;
  } catch {
    return null;
  }
}

function writeCredentials(creds: CliCredentials): void {
  mkdirSync(join(homedir(), '.nakiros'), { recursive: true });
  writeFileSync(CREDENTIALS_PATH, JSON.stringify(creds), { encoding: 'utf-8', mode: 0o600 });
  try { chmodSync(CREDENTIALS_PATH, 0o600); } catch { /* best effort */ }
}

async function refreshToken(refreshToken: string, currentCreds: CliCredentials): Promise<CliCredentials | null> {
  try {
    const response = await fetch(`${AUTH_SERVER}/oauth2/v1/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: CLIENT_ID,
      }).toString(),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
      refresh_token?: string;
    };

    if (!data.access_token) return null;

    const updated: CliCredentials = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? currentCreds.refreshToken,
      expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
      apiUrl: currentCreds.apiUrl,
    };

    writeCredentials(updated);
    return updated;
  } catch {
    return null;
  }
}

/**
 * Decode a JWT payload without verifying the signature.
 * Only use this for claims we already trust (our own stored credentials).
 */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1]!;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function getAccessToken(): Promise<{ token: string; apiUrl: string; email?: string } | null> {
  const creds = readCredentials();

  if (!creds) {
    process.stderr.write('[nakiros] Not authenticated. Open the Nakiros Desktop app and sign in first.\n');
    return null;
  }

  const storedEmail = creds.email ?? undefined;
  function withEmail(token: string, apiUrl: string) {
    // Prefer stored email (written by Desktop at sign-in) over JWT claims
    // since Melody Auth access tokens only contain `sub` (userId)
    if (storedEmail) return { token, apiUrl, email: storedEmail };
    const payload = decodeJwtPayload(token);
    const email = (payload?.['email'] ?? payload?.['preferred_username']) as string | undefined;
    return { token, apiUrl, email };
  }

  // Token still valid
  if (!creds.expiresAt || creds.expiresAt - Date.now() > REFRESH_WINDOW_MS) {
    return withEmail(creds.accessToken, creds.apiUrl);
  }

  // Token expiring soon — try refresh
  if (creds.refreshToken) {
    const refreshed = await refreshToken(creds.refreshToken, creds);
    if (refreshed) return withEmail(refreshed.accessToken, refreshed.apiUrl);
  }

  // Token expired and refresh failed
  if (creds.expiresAt > Date.now()) {
    // Still usable, just couldn't refresh
    return withEmail(creds.accessToken, creds.apiUrl);
  }

  process.stderr.write('[nakiros] Session expired. Open the Nakiros Desktop app and sign in again.\n');
  return null;
}
