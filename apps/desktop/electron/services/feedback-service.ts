import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir, platform, arch } from 'os';
import { join } from 'path';
import { app } from 'electron';
import { getVersionInfo } from './update-checker.js';

const BASE_URL = 'https://feedback.nakiros.com';
const GLOBAL_DIR = join(homedir(), '.nakiros');
const QUEUE_FILE = join(GLOBAL_DIR, 'feedback-queue.json');
const MAX_QUEUE = 50;

const API_KEY = process.env.NAKIROS_FEEDBACK_KEY ?? '';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SessionFeedbackData {
  session_id: string;
  workspace_id: string;
  rating: 1 | -1;
  comment?: string;
  agent: string;
  workflow?: string;
  editor: string;
  duration_seconds?: number;
  message_count?: number;
  conversation_shared?: boolean;
  conversation?: unknown;
}

export interface ProductFeedbackData {
  category: 'bug' | 'suggestion' | 'agent' | 'workflow' | 'ux';
  message: string;
}

interface QueueItem {
  type: 'session' | 'product';
  endpoint: string;
  body: Record<string, unknown>;
  addedAt: string;
}

// ─── Version helpers ──────────────────────────────────────────────────────────

function getAppVersion(): string {
  return app.getVersion();
}

function getBundleVersion(): string {
  return getVersionInfo()?.bundle_version ?? '0.0.0';
}

function getUserAgent(): string {
  return `Nakiros/${getAppVersion()} (${platform()}; ${arch()})`;
}

// ─── Queue ────────────────────────────────────────────────────────────────────

function loadQueue(): QueueItem[] {
  if (!existsSync(QUEUE_FILE)) return [];
  try {
    return JSON.parse(readFileSync(QUEUE_FILE, 'utf-8')) as QueueItem[];
  } catch {
    return [];
  }
}

function saveQueue(items: QueueItem[]): void {
  mkdirSync(GLOBAL_DIR, { recursive: true });
  writeFileSync(QUEUE_FILE, JSON.stringify(items, null, 2) + '\n', 'utf-8');
}

function enqueue(item: QueueItem): void {
  const queue = loadQueue();
  queue.push(item);
  // Keep only the most recent MAX_QUEUE items
  const trimmed = queue.slice(-MAX_QUEUE);
  saveQueue(trimmed);
}

// ─── HTTP send ────────────────────────────────────────────────────────────────

async function postFeedback(endpoint: string, body: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    signal: AbortSignal.timeout(8000),
    headers: {
      'Content-Type': 'application/json',
      'X-Nakiros-Key': API_KEY,
      'User-Agent': getUserAgent(),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}${text ? ` — ${text}` : ''}`);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function sendSessionFeedback(data: SessionFeedbackData): Promise<void> {
  const body: Record<string, unknown> = {
    ...data,
    app_version: getAppVersion(),
    bundle_version: getBundleVersion(),
    platform: platform(),
  };

  try {
    await postFeedback('/session', body);
  } catch {
    enqueue({ type: 'session', endpoint: '/session', body, addedAt: new Date().toISOString() });
  }
}

export async function sendProductFeedback(data: ProductFeedbackData): Promise<void> {
  const body: Record<string, unknown> = {
    ...data,
    app_version: getAppVersion(),
    bundle_version: getBundleVersion(),
    platform: platform(),
  };

  try {
    await postFeedback('/product', body);
  } catch {
    enqueue({ type: 'product', endpoint: '/product', body, addedAt: new Date().toISOString() });
  }
}

export async function retryQueue(): Promise<void> {
  const queue = loadQueue();
  if (queue.length === 0) return;

  const remaining: QueueItem[] = [];

  for (const item of queue) {
    try {
      await postFeedback(item.endpoint, item.body);
    } catch {
      remaining.push(item);
    }
  }

  saveQueue(remaining);
  if (remaining.length < queue.length) {
    console.log(`[feedback] Retried queue: ${queue.length - remaining.length} sent, ${remaining.length} remaining`);
  }
}
