// Melody Auth S2S client — OAuth2 client credentials + admin API

const MELODY_AUTH_BASE = 'https://auth.nakiros.com';
const TOKEN_ENDPOINT = `${MELODY_AUTH_BASE}/oauth2/v1/token`;

export interface MelodyUser {
  authId: string;
  email: string | null;
  emailVerified: boolean;
  firstName: string | null;
  lastName: string | null;
}

interface S2SToken {
  access_token: string;
  expires_at: number; // unix seconds
}

// Module-level cache — lives for the worker instance lifetime
let cachedToken: S2SToken | null = null;

async function getS2SToken(clientId: string, clientSecret: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expires_at > now + 60) {
    return cachedToken.access_token;
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'read_user',
  });

  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) throw new Error(`S2S token fetch failed: ${res.status}`);

  const data = (await res.json()) as { access_token: string; expires_in?: number };
  cachedToken = {
    access_token: data.access_token,
    expires_at: now + (data.expires_in ?? 3600),
  };
  return cachedToken.access_token;
}

/**
 * Looks up a user by email (exact match). Returns null if not found or on error.
 */
export async function lookupUserByEmail(
  email: string,
  clientId: string,
  clientSecret: string,
): Promise<MelodyUser | null> {
  try {
    const token = await getS2SToken(clientId, clientSecret);
    const url = new URL(`${MELODY_AUTH_BASE}/api/v1/users`);
    url.searchParams.set('search', email);
    url.searchParams.set('page_size', '10');
    url.searchParams.set('page_number', '1');

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;

    const data = (await res.json()) as { users?: MelodyUser[] };
    const users = data.users ?? [];
    return users.find((u) => u.email != null && u.email.toLowerCase() === email.toLowerCase()) ?? null;
  } catch {
    return null;
  }
}
