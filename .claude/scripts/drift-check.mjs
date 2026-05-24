#!/usr/bin/env node
// Stop hook — ask the local Nakiros daemon whether the current conversation
// is drifting (loop / topic / context). If so, surface a top-level
// systemMessage that Claude Code renders as a visible banner to the user.
//
// Note: `additionalContext` is NOT a valid output for Stop hooks — only
// UserPromptSubmit / PostToolUse / PostToolBatch accept it. To make Claude
// (the agent) aware of the drift, see drift-context.mjs which runs on
// UserPromptSubmit.
//
// Failure modes are all silent: if the daemon is down, unreachable, or
// returns an error, exit 0 with no output — never break the conversation.

import { readFileSync } from 'node:fs';

const TIMEOUT_MS = 2000;
const DAEMON_URL = process.env.NAKIROS_DAEMON_URL ?? 'http://localhost:4242';
const FORCE = process.env.NAKIROS_DRIFT_FORCE; // 'loop' | 'topic' | 'context' for testing

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

// Avoid re-firing when Claude is continuing from a previous Stop hook.
if (input?.stop_hook_active === true) process.exit(0);

const sessionId = input?.session_id;
if (!sessionId) process.exit(0);

const url = new URL('/api/drift', DAEMON_URL);
url.searchParams.set('session', sessionId);
if (FORCE) url.searchParams.set('force', FORCE);

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

try {
  const res = await fetch(url, { signal: controller.signal });
  if (!res.ok) process.exit(0);
  const body = await res.json();
  const drift = body?.drift;
  if (!drift) process.exit(0);

  const banner = `🧭 Nakiros — ${drift.message} ${drift.suggestion}`;
  process.stdout.write(JSON.stringify({ systemMessage: banner }));
  process.exit(0);
} catch {
  process.exit(0);
} finally {
  clearTimeout(timer);
}
