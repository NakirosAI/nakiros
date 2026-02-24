import { app, safeStorage } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { refreshAccessToken } from './jira-oauth.js';

export interface StoredTokenEntry {
  accessToken: string;   // encrypted (base64) or plain
  refreshToken: string;  // encrypted (base64) or plain
  cloudId: string;
  cloudUrl: string;
  displayName: string;
  expiresAt: number;     // unix ms timestamp
}

type TokenStore = Record<string, StoredTokenEntry>;

function getStorePath(): string {
  return join(app.getPath('userData'), 'jira-tokens.json');
}

function readStore(): TokenStore {
  const path = getStorePath();
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as TokenStore;
  } catch {
    return {};
  }
}

function writeStore(store: TokenStore): void {
  writeFileSync(getStorePath(), JSON.stringify(store, null, 2), 'utf-8');
}

function encrypt(text: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(text).toString('base64');
  }
  return text;
}

function decrypt(stored: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(Buffer.from(stored, 'base64'));
    } catch {
      // Fallback if stored as plain text (migration)
      return stored;
    }
  }
  return stored;
}

export function saveTokens(
  wsId: string,
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    cloudId: string;
    cloudUrl: string;
    displayName: string;
  },
): void {
  const store = readStore();
  store[wsId] = {
    accessToken: encrypt(tokens.accessToken),
    refreshToken: encrypt(tokens.refreshToken),
    cloudId: tokens.cloudId,
    cloudUrl: tokens.cloudUrl,
    displayName: tokens.displayName,
    expiresAt: Date.now() + tokens.expiresIn * 1000,
  };
  writeStore(store);
}

export function loadTokens(wsId: string): StoredTokenEntry | null {
  const store = readStore();
  return store[wsId] ?? null;
}

export function clearTokens(wsId: string): void {
  const store = readStore();
  delete store[wsId];
  writeStore(store);
}

export function getTokenMeta(wsId: string): {
  connected: boolean;
  cloudUrl?: string;
  displayName?: string;
} {
  const entry = loadTokens(wsId);
  if (!entry) return { connected: false };
  return { connected: true, cloudUrl: entry.cloudUrl, displayName: entry.displayName };
}

export async function getValidAccessToken(wsId: string): Promise<string> {
  const entry = loadTokens(wsId);
  if (!entry) throw new Error('Not connected to Jira. Please reconnect.');

  const accessToken = decrypt(entry.accessToken);

  // Return token if still valid (5 min safety margin)
  if (Date.now() < entry.expiresAt - 5 * 60 * 1000) {
    return accessToken;
  }

  // Refresh the token
  const refreshToken = decrypt(entry.refreshToken);
  const refreshed = await refreshAccessToken(refreshToken);

  // Persist updated tokens
  const store = readStore();
  if (store[wsId]) {
    store[wsId].accessToken = encrypt(refreshed.access_token);
    if (refreshed.refresh_token) {
      store[wsId].refreshToken = encrypt(refreshed.refresh_token);
    }
    store[wsId].expiresAt = Date.now() + refreshed.expires_in * 1000;
    writeStore(store);
  }

  return refreshed.access_token;
}
