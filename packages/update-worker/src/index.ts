/**
 * Nakiros Update Worker — Cloudflare Worker
 *
 * Exposes a secured API for the Nakiros app to check and download agent/workflow bundle updates.
 *
 * Endpoints:
 *   GET /manifest?channel=stable&app_version=1.0.0[&features=saas,rag]
 *   GET /download/:version/:path?channel=stable
 *
 * Auth:
 *   X-Nakiros-Key: {api_key}
 *   User-Agent: Nakiros/{app_version} ({platform}; {arch})
 */

export interface Env {
  R2_BUCKET: R2Bucket;
  NAKIROS_API_KEY_STABLE: string;
  NAKIROS_API_KEY_BETA: string;
}

interface ManifestFile {
  type: string;
  name: string;
  filename: string;
  path: string;
  hash: string;
}

interface Manifest {
  version: string;
  channel: string;
  released_at: string;
  min_app_version: string;
  required_features: string[];
  changelog: string;
  files: ManifestFile[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const VALID_CHANNELS = new Set(['stable', 'beta']);
const USER_AGENT_RE = /^Nakiros\/\d+\.\d+\.\d+ \(.+;\s*.+\)$/;

const CONTENT_TYPES: Record<string, string> = {
  md: 'text/markdown',
  yaml: 'application/yaml',
  xml: 'application/xml',
  json: 'application/json',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function semverLt(a: string, b: string): boolean {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const va = pa[i] ?? 0;
    const vb = pb[i] ?? 0;
    if (va < vb) return true;
    if (va > vb) return false;
  }
  return false;
}

function getContentType(filename: string): string {
  const ext = filename.split('.').pop() ?? '';
  return CONTENT_TYPES[ext] ?? 'application/octet-stream';
}

function log(data: Record<string, unknown>): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...data }));
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

function validateAuth(request: Request, env: Env, channel: string): Response | null {
  // Level 1 — API key
  const providedKey = request.headers.get('X-Nakiros-Key');
  const expectedKey = channel === 'beta' ? env.NAKIROS_API_KEY_BETA : env.NAKIROS_API_KEY_STABLE;
  if (!providedKey || providedKey !== expectedKey) {
    return json({ error: 'UNAUTHORIZED', message: 'Invalid or missing API key' }, 401);
  }

  // Level 2 — User-Agent
  const ua = request.headers.get('User-Agent') ?? '';
  if (!USER_AGENT_RE.test(ua)) {
    return json({ error: 'FORBIDDEN', message: 'Invalid User-Agent format' }, 403);
  }

  return null;
}

// ─── Compatibility check ──────────────────────────────────────────────────────

function checkCompatibility(
  manifest: Manifest,
  appVersion: string,
  appFeatures: string[],
): { compatible: boolean; reason?: string; missing_features?: string[]; message?: string } {
  if (semverLt(appVersion, manifest.min_app_version)) {
    return {
      compatible: false,
      reason: 'min_app_version',
      message: `Cette mise à jour requiert Nakiros v${manifest.min_app_version} minimum. Mettez à jour l'application.`,
    };
  }

  const missingFeatures = manifest.required_features.filter((f) => !appFeatures.includes(f));
  if (missingFeatures.length > 0) {
    return {
      compatible: false,
      reason: 'required_features',
      missing_features: missingFeatures,
      message: `Cette mise à jour requiert les features : ${missingFeatures.join(', ')}.`,
    };
  }

  return { compatible: true };
}

// ─── Handler: GET /manifest ───────────────────────────────────────────────────

async function handleManifest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const channel = url.searchParams.get('channel') ?? 'stable';
  const appVersion = url.searchParams.get('app_version');
  const featuresParam = url.searchParams.get('features') ?? '';
  const appFeatures = featuresParam ? featuresParam.split(',').map((f) => f.trim()) : [];

  if (!VALID_CHANNELS.has(channel)) {
    return json({ error: 'INVALID_CHANNEL', message: 'Channel must be "stable" or "beta"' }, 400);
  }

  if (!appVersion) {
    return json({ error: 'BAD_REQUEST', message: 'Missing required parameter: app_version' }, 400);
  }

  const authError = validateAuth(request, env, channel);
  if (authError) return authError;

  // Fetch manifest from R2
  const r2Key = `channels/${channel}/manifest.json`;
  let manifestObj: R2ObjectBody | null;
  try {
    manifestObj = await env.R2_BUCKET.get(r2Key);
  } catch {
    log({ endpoint: '/manifest', channel, appVersion, error: 'R2_FETCH_FAILED' });
    return json({ error: 'STORAGE_ERROR', message: 'Failed to access bundle storage' }, 500);
  }

  if (!manifestObj) {
    return json({ error: 'FILE_NOT_FOUND', message: `No manifest found for channel ${channel}` }, 404);
  }

  let manifest: Manifest;
  try {
    manifest = await manifestObj.json<Manifest>();
  } catch {
    return json({ error: 'STORAGE_ERROR', message: 'Failed to parse manifest' }, 500);
  }

  const compat = checkCompatibility(manifest, appVersion, appFeatures);

  log({
    endpoint: '/manifest',
    channel,
    appVersion,
    bundleVersion: manifest.version,
    compatible: compat.compatible,
    reason: compat.reason,
    status: 200,
  });

  if (!compat.compatible) {
    return json({
      version: manifest.version,
      channel: manifest.channel,
      ...compat,
    });
  }

  return json({ ...manifest, compatible: true });
}

// ─── Handler: GET /download/:version/:path ────────────────────────────────────

async function handleDownload(
  request: Request,
  env: Env,
  version: string,
  filePath: string,
): Promise<Response> {
  const url = new URL(request.url);
  const channel = url.searchParams.get('channel') ?? 'stable';

  if (!VALID_CHANNELS.has(channel)) {
    return json({ error: 'INVALID_CHANNEL', message: 'Channel must be "stable" or "beta"' }, 400);
  }

  // Basic path traversal guard
  if (filePath.includes('..') || filePath.startsWith('/')) {
    return json({ error: 'INVALID_PATH', message: 'Invalid file path' }, 400);
  }

  const authError = validateAuth(request, env, channel);
  if (authError) return authError;

  const r2Key = `channels/${channel}/${version}/${filePath}`;
  let obj: R2ObjectBody | null;
  try {
    obj = await env.R2_BUCKET.get(r2Key);
  } catch {
    log({ endpoint: '/download', channel, version, filePath, error: 'R2_FETCH_FAILED' });
    return json({ error: 'STORAGE_ERROR', message: 'Failed to access bundle storage' }, 500);
  }

  if (!obj) {
    return json(
      { error: 'FILE_NOT_FOUND', message: `File ${filePath} not found in bundle ${version}` },
      404,
    );
  }

  // Retrieve hash from the versioned manifest
  let fileHash = '';
  try {
    const manifestObj = await env.R2_BUCKET.get(`channels/${channel}/${version}/manifest.json`);
    if (manifestObj) {
      const manifest = await manifestObj.json<Manifest>();
      const entry = manifest.files.find((f) => f.path === filePath);
      if (entry) fileHash = entry.hash;
    }
  } catch {
    // Non-blocking — hash header is optional
  }

  const filename = filePath.split('/').pop() ?? filePath;
  const headers = new Headers({
    'Content-Type': getContentType(filename),
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'public, max-age=31536000, immutable',
  });
  if (fileHash) headers.set('X-File-Hash', fileHash);

  log({ endpoint: '/download', channel, version, filePath, status: 200 });

  return new Response(obj.body, { status: 200, headers });
}

// ─── Router ───────────────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'GET') {
      return json({ error: 'METHOD_NOT_ALLOWED', message: 'Only GET requests are allowed' }, 405);
    }

    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname === '/manifest') {
      return handleManifest(request, env);
    }

    // /download/:version/:path  (path can contain slashes)
    const downloadMatch = pathname.match(/^\/download\/([^/]+)\/(.+)$/);
    if (downloadMatch) {
      return handleDownload(request, env, downloadMatch[1], downloadMatch[2]);
    }

    return json({ error: 'NOT_FOUND', message: 'Endpoint not found' }, 404);
  },
};
