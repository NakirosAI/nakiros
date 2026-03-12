import { app, BrowserWindow, safeStorage, session } from 'electron';
import { createHash, randomBytes } from 'crypto';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { AuthState } from '@nakiros/shared';

const AUTH_SERVER = 'https://auth.nakiros.com';
const CLIENT_ID = 'A4ec21b4916aD9b4C5a682C29A6D8747b0966e657704C5bfbd73137Ba8276cDB';
const REDIRECT_URI = 'nakiros://auth/callback';
const AUTH_SESSION_PARTITION = 'persist:nakiros-auth';

const TOKEN_PATH = join(app.getPath('userData'), 'nakiros-auth.bin');
const AUTH_META_PATH = join(app.getPath('userData'), 'nakiros-auth-meta.json');
const REFRESH_WINDOW_MS = 5 * 60 * 1000;

interface AuthMeta {
  email?: string;
  expiresAt?: string;
  refreshToken?: string;
}

// ─── PKCE helpers ─────────────────────────────────────────────────────────────

function generateCodeVerifier(): string {
  return randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

// ─── Secure token storage ─────────────────────────────────────────────────────

export function getStoredToken(): string | null {
  if (!existsSync(TOKEN_PATH)) return null;
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    return safeStorage.decryptString(readFileSync(TOKEN_PATH));
  } catch {
    return null;
  }
}

function readAuthMeta(): AuthMeta {
  if (!existsSync(AUTH_META_PATH)) return {};
  try {
    return JSON.parse(readFileSync(AUTH_META_PATH, 'utf-8')) as AuthMeta;
  } catch {
    return {};
  }
}

function writeAuthMeta(meta: AuthMeta): void {
  writeFileSync(AUTH_META_PATH, JSON.stringify(meta), 'utf-8');
}

function storeAuth(accessToken: string, meta: AuthMeta): void {
  if (safeStorage.isEncryptionAvailable()) {
    writeFileSync(TOKEN_PATH, safeStorage.encryptString(accessToken));
  }
  writeAuthMeta(meta);
}

function clearAuthFiles(): void {
  if (existsSync(TOKEN_PATH)) unlinkSync(TOKEN_PATH);
  if (existsSync(AUTH_META_PATH)) unlinkSync(AUTH_META_PATH);
}

async function clearAuthBrowserSession(): Promise<void> {
  const authSession = session.fromPartition(AUTH_SESSION_PARTITION);
  await Promise.all([
    authSession.clearCache(),
    authSession.clearStorageData({
      storages: ['cookies', 'localstorage', 'indexdb', 'serviceworkers', 'cachestorage'],
    }),
  ]);
}

// ─── JWT helpers ──────────────────────────────────────────────────────────────

function parseJwtClaim<T>(token: string, claim: string): T | undefined {
  try {
    const part = token.split('.')[1];
    if (!part) return undefined;
    const payload = JSON.parse(Buffer.from(part, 'base64url').toString()) as Record<string, unknown>;
    return payload[claim] as T | undefined;
  } catch {
    return undefined;
  }
}

// ─── Token exchange ───────────────────────────────────────────────────────────

async function exchangeCode(code: string, verifier: string): Promise<{ email?: string }> {
  const response = await fetch(`${AUTH_SERVER}/oauth2/v1/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier,
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
    }).toString(),
  });

  if (!response.ok) throw new Error(`Token exchange failed (${response.status})`);

  const data = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    id_token?: string;
    refresh_token?: string;
  };

  const accessToken = data.access_token;
  if (!accessToken) throw new Error('No access token in response');

  const email = parseJwtClaim<string>(data.id_token ?? '', 'email');
  const expClaim = parseJwtClaim<number>(accessToken, 'exp');
  const expiresAt = data.expires_in
    ? new Date(Date.now() + data.expires_in * 1000).toISOString()
    : expClaim
      ? new Date(expClaim * 1000).toISOString()
      : undefined;

  storeAuth(accessToken, { email, expiresAt, refreshToken: data.refresh_token });
  return { email };
}

// ─── Token refresh ────────────────────────────────────────────────────────────

async function refreshAccessToken(token: string, email?: string): Promise<AuthState | null> {
  try {
    const response = await fetch(`${AUTH_SERVER}/oauth2/v1/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: token,
        client_id: CLIENT_ID,
      }).toString(),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
      id_token?: string;
      refresh_token?: string;
    };

    const accessToken = data.access_token;
    if (!accessToken) return null;

    const nextEmail = parseJwtClaim<string>(data.id_token ?? '', 'email') ?? email;
    const expiresAt = data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000).toISOString()
      : undefined;

    storeAuth(accessToken, { email: nextEmail, expiresAt, refreshToken: data.refresh_token ?? token });
    return { email: nextEmail, isAuthenticated: true };
  } catch {
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getAuthState(): Promise<AuthState> {
  const token = getStoredToken();
  const meta = readAuthMeta();

  if (!token) return { isAuthenticated: false };

  const userId = parseJwtClaim<string>(token, 'sub');

  if (!meta.expiresAt) return { email: meta.email, userId, isAuthenticated: true };

  const expiresAtMs = Date.parse(meta.expiresAt);
  if (Number.isNaN(expiresAtMs) || expiresAtMs - Date.now() > REFRESH_WINDOW_MS) {
    return { email: meta.email, userId, isAuthenticated: true };
  }

  if (meta.refreshToken) {
    const refreshed = await refreshAccessToken(meta.refreshToken, meta.email);
    if (refreshed) return { ...refreshed, userId };
  }

  clearAuthFiles();
  return { email: meta.email, userId, isAuthenticated: false, sessionExpired: true };
}

export async function signIn(parentWindow?: BrowserWindow): Promise<{ email?: string }> {
  const verifier = generateCodeVerifier();
  const challenge = generateCodeChallenge(verifier);
  const state = randomBytes(16).toString('base64url');

  const authorizeUrl = `${AUTH_SERVER}/oauth2/v1/authorize?${new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    scope: 'openid profile email',
    state,
  }).toString()}`;

  return new Promise((resolve, reject) => {
    let settled = false;

    const popup = new BrowserWindow({
      width: 480,
      height: 680,
      parent: parentWindow,
      modal: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        partition: AUTH_SESSION_PARTITION,
      },
    });

    const settle = (result: { email?: string } | Error) => {
      if (settled) return;
      settled = true;
      if (!popup.isDestroyed()) popup.close();
      if (result instanceof Error) reject(result);
      else resolve(result);
    };

    const checkUrl = (navUrl: string) => {
      try {
        if (!navUrl.startsWith('nakiros://auth/')) return;
        const parsed = new URL(navUrl);
        const error = parsed.searchParams.get('error');
        if (error) { settle(new Error(error)); return; }
        const code = parsed.searchParams.get('code');
        if (!code) { settle(new Error('Missing code in callback')); return; }
        exchangeCode(code, verifier)
          .then((result) => settle(result))
          .catch((err: unknown) => settle(err instanceof Error ? err : new Error(String(err))));
      } catch { /* not a valid URL */ }
    };

    popup.webContents.on('will-navigate', (_, navUrl) => checkUrl(navUrl));
    popup.webContents.on('will-redirect', (_, navUrl) => checkUrl(navUrl));
    popup.webContents.on('did-fail-load', (_, __, ___, validatedUrl) => {
      if (validatedUrl?.startsWith('nakiros://auth/')) checkUrl(validatedUrl);
    });
    popup.on('closed', () => settle(new Error('Cancelled')));
    popup.loadURL(authorizeUrl).catch((err: unknown) => settle(new Error(String(err))));
  });
}

export async function signOut(): Promise<void> {
  clearAuthFiles();
  await clearAuthBrowserSession();
}
