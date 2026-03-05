/**
 * Nakiros Feedback Worker — Cloudflare Worker
 *
 * Receives user feedback from the Nakiros desktop app and stores it in D1.
 * Session conversations (opt-in) are stored in R2 to avoid size limitations.
 *
 * Endpoints:
 *   POST /session   — session quality feedback
 *   POST /product   — product feedback (bugs, suggestions...)
 *
 * Auth:
 *   X-Nakiros-Key: {api_key}
 *   User-Agent: Nakiros/{app_version} ({platform}; {arch})
 */

export interface Env {
  FEEDBACK_DB: D1Database;
  R2_BUCKET: R2Bucket;
  NAKIROS_FEEDBACK_KEY: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_AGENT_RE = /^Nakiros\/\d+\.\d+\.\d+ \(.+;\s*.+\)$/;
const VALID_CATEGORIES = new Set(['bug', 'suggestion', 'agent', 'workflow', 'ux']);
const MAX_COMMENT_LENGTH = 5000;
const MAX_MESSAGE_LENGTH = 2000;
const MIN_MESSAGE_LENGTH = 10;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function randomId(): string {
  return crypto.randomUUID();
}

function log(data: Record<string, unknown>): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...data }));
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

function validateAuth(request: Request, env: Env): Response | null {
  const providedKey = request.headers.get('X-Nakiros-Key');
  if (!providedKey || providedKey !== env.NAKIROS_FEEDBACK_KEY) {
    return json({ error: 'UNAUTHORIZED', message: 'Invalid or missing API key' }, 401);
  }

  const ua = request.headers.get('User-Agent') ?? '';
  if (!USER_AGENT_RE.test(ua)) {
    return json({ error: 'FORBIDDEN', message: 'Invalid User-Agent format' }, 403);
  }

  return null;
}

// ─── Handler: POST /session ───────────────────────────────────────────────────

interface SessionBody {
  session_id: string;
  workspace_id: string;
  rating: number;
  comment?: string;
  agent: string;
  workflow?: string;
  editor: string;
  duration_seconds?: number;
  message_count?: number;
  conversation_shared?: boolean;
  conversation?: unknown;
  app_version: string;
  bundle_version: string;
  platform: string;
}

async function handleSession(request: Request, env: Env): Promise<Response> {
  const authError = validateAuth(request, env);
  if (authError) return authError;

  let body: SessionBody;
  try {
    body = (await request.json()) as SessionBody;
  } catch {
    return json({ error: 'BAD_REQUEST', message: 'Invalid JSON body' }, 400);
  }

  // Validate required fields
  if (!body.session_id || !body.workspace_id || !body.agent || !body.editor) {
    return json({ error: 'BAD_REQUEST', message: 'Missing required fields' }, 400);
  }
  if (body.rating !== 1 && body.rating !== -1) {
    return json({ error: 'BAD_REQUEST', message: 'rating must be 1 or -1' }, 400);
  }
  if (!body.app_version || !body.bundle_version || !body.platform) {
    return json({ error: 'BAD_REQUEST', message: 'Missing version/platform fields' }, 400);
  }

  const id = randomId();
  const createdAt = new Date().toISOString();
  const comment = body.comment ? body.comment.slice(0, MAX_COMMENT_LENGTH) : null;
  const conversationShared = body.conversation_shared === true ? 1 : 0;

  // Upload conversation to R2 if opt-in
  let conversationKey: string | null = null;
  if (conversationShared && body.conversation != null) {
    const r2Key = `conversations/${id}.json`;
    try {
      const payload = typeof body.conversation === 'string'
        ? body.conversation
        : JSON.stringify(body.conversation);
      await env.R2_BUCKET.put(r2Key, payload, {
        httpMetadata: { contentType: 'application/json' },
      });
      conversationKey = r2Key;
    } catch {
      log({ endpoint: '/session', id, error: 'R2_UPLOAD_FAILED' });
      // Non-blocking — continue without conversation
    }
  }

  try {
    await env.FEEDBACK_DB.prepare(`
      INSERT INTO feedback_sessions
        (id, session_id, workspace_id, rating, comment, agent, workflow, editor,
         duration_seconds, message_count, conversation_key, conversation_shared,
         app_version, bundle_version, platform, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      body.session_id,
      body.workspace_id,
      body.rating,
      comment,
      body.agent,
      body.workflow ?? null,
      body.editor,
      body.duration_seconds ?? null,
      body.message_count ?? null,
      conversationKey,
      conversationShared,
      body.app_version,
      body.bundle_version,
      body.platform,
      createdAt,
    ).run();
  } catch (err) {
    log({ endpoint: '/session', id, error: 'D1_INSERT_FAILED', detail: String(err) });
    return json({ error: 'STORAGE_ERROR', message: 'Failed to store feedback' }, 500);
  }

  log({ endpoint: '/session', id, rating: body.rating, agent: body.agent, conversationShared, status: 201 });
  return json({ success: true, id }, 201);
}

// ─── Handler: POST /product ───────────────────────────────────────────────────

interface ProductBody {
  category: string;
  message: string;
  app_version: string;
  bundle_version: string;
  platform: string;
}

async function handleProduct(request: Request, env: Env): Promise<Response> {
  const authError = validateAuth(request, env);
  if (authError) return authError;

  let body: ProductBody;
  try {
    body = (await request.json()) as ProductBody;
  } catch {
    return json({ error: 'BAD_REQUEST', message: 'Invalid JSON body' }, 400);
  }

  if (!VALID_CATEGORIES.has(body.category)) {
    return json({ error: 'BAD_REQUEST', message: 'category must be one of: bug, suggestion, agent, workflow, ux' }, 400);
  }
  if (!body.message || body.message.length < MIN_MESSAGE_LENGTH) {
    return json({ error: 'BAD_REQUEST', message: `message must be at least ${MIN_MESSAGE_LENGTH} characters` }, 400);
  }
  if (body.message.length > MAX_MESSAGE_LENGTH) {
    return json({ error: 'BAD_REQUEST', message: `message must be at most ${MAX_MESSAGE_LENGTH} characters` }, 400);
  }
  if (!body.app_version || !body.bundle_version || !body.platform) {
    return json({ error: 'BAD_REQUEST', message: 'Missing version/platform fields' }, 400);
  }

  const id = randomId();
  const createdAt = new Date().toISOString();

  try {
    await env.FEEDBACK_DB.prepare(`
      INSERT INTO feedback_product (id, category, message, app_version, bundle_version, platform, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(id, body.category, body.message, body.app_version, body.bundle_version, body.platform, createdAt).run();
  } catch (err) {
    log({ endpoint: '/product', id, error: 'D1_INSERT_FAILED', detail: String(err) });
    return json({ error: 'STORAGE_ERROR', message: 'Failed to store feedback' }, 500);
  }

  log({ endpoint: '/product', id, category: body.category, status: 201 });
  return json({ success: true, id }, 201);
}

// ─── Router ───────────────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'POST') {
      return json({ error: 'METHOD_NOT_ALLOWED', message: 'Only POST requests are allowed' }, 405);
    }

    const url = new URL(request.url);

    if (url.pathname === '/session') {
      return handleSession(request, env);
    }

    if (url.pathname === '/product') {
      return handleProduct(request, env);
    }

    return json({ error: 'NOT_FOUND', message: 'Endpoint not found' }, 404);
  },
};
