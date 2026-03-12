// Auth helpers — Melody Auth JWT verification
//
// The Desktop app performs PKCE directly with auth.nakiros.com and sends the
// resulting access_token (RS256 JWT) as a Bearer token. The Worker verifies it
// using the public JWKS endpoint — no secret key required.

const OIDC_ISSUER = 'https://auth.nakiros.com';
const JWKS_URI = 'https://auth.nakiros.com/.well-known/jwks.json';

export interface AuthContext {
  userId: string;
  email?: string;
  orgId?: string;
  orgRole?: string;
}

// ─── JWKS cache (module-level, lives for worker instance lifetime) ────────────

interface JwkKey {
  kty: string;
  n: string;
  e: string;
  alg: string;
  use: string;
  kid: string;
}

let cachedKeys: JwkKey[] | null = null;

async function getJwks(): Promise<JwkKey[]> {
  if (cachedKeys) return cachedKeys;
  const res = await fetch(JWKS_URI);
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const data = (await res.json()) as { keys: JwkKey[] };
  cachedKeys = data.keys;
  return cachedKeys;
}

// ─── Base64url helpers ────────────────────────────────────────────────────────

function base64urlToUint8Array(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const binary = atob(padded);
  return new Uint8Array(binary.length).map((_, i) => binary.charCodeAt(i));
}

function base64urlDecode(str: string): string {
  return new TextDecoder().decode(base64urlToUint8Array(str));
}

// ─── RS256 JWT verification ───────────────────────────────────────────────────

async function verifyJwt(token: string): Promise<Record<string, unknown> | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

  let header: { alg?: string; kid?: string };
  let payload: Record<string, unknown>;
  try {
    header = JSON.parse(base64urlDecode(headerB64)) as { alg?: string; kid?: string };
    payload = JSON.parse(base64urlDecode(payloadB64)) as Record<string, unknown>;
  } catch {
    return null;
  }

  if (header.alg !== 'RS256') return null;

  // Validate standard claims
  if (payload.iss !== OIDC_ISSUER) return null;
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === 'number' && payload.exp < now) return null;

  // Find matching JWK
  let keys: JwkKey[];
  try {
    keys = await getJwks();
  } catch {
    // If JWKS is unreachable, invalidate cache so next request retries
    cachedKeys = null;
    return null;
  }

  const jwk = keys.find((k) => !header.kid || k.kid === header.kid);
  if (!jwk) return null;

  // Import RSA public key and verify signature
  try {
    const cryptoKey = await crypto.subtle.importKey(
      'jwk',
      jwk as unknown as JsonWebKey,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );

    const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const signature = base64urlToUint8Array(signatureB64);
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', cryptoKey, signature, signingInput);
    if (!valid) return null;
  } catch {
    return null;
  }

  return payload;
}

// ─── Public API ───────────────────────────────────────────────────────────────

function extractBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice(7);
}

/**
 * Verifies a Melody Auth JWT obtained via PKCE by the Desktop app.
 * Returns AuthContext if valid, null otherwise.
 */
export async function verifyAuth(request: Request): Promise<AuthContext | null> {
  const token = extractBearerToken(request);
  if (!token) return null;

  try {
    const payload = await verifyJwt(token);
    if (!payload) return null;

    const userId = payload.sub as string | undefined;
    if (!userId) return null;

    return {
      userId,
      email: payload['email'] as string | undefined,
      orgId: (payload['org_id'] ?? payload['organization_id']) as string | undefined,
      orgRole: payload['org_role'] as string | undefined,
    };
  } catch (err) {
    console.error('[verifyAuth] token verification failed:', err);
    return null;
  }
}
