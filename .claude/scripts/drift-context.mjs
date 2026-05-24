#!/usr/bin/env node
// UserPromptSubmit hook — re-asks the local Nakiros daemon whether the
// current conversation is drifting. If yes, injects `additionalContext`
// so Claude (the agent) is aware and can adapt its next turn (e.g., remind
// the user about the suggestion).
//
// Paired with drift-check.mjs (Stop hook) which emits the user-visible
// banner via `systemMessage`. Both call the same daemon endpoint.
//
// Failure modes are all silent: if the daemon is down, unreachable, or
// returns an error, exit 0 with no output — never break the conversation.

import { readFileSync } from 'node:fs';

const TIMEOUT_MS = 2000;
const DAEMON_URL = process.env.NAKIROS_DAEMON_URL ?? 'http://localhost:4242';
const FORCE = process.env.NAKIROS_DRIFT_FORCE;

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

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

  const additionalContext = [
    `[Nakiros drift detector] type=${drift.type} severity=${drift.severity}`,
    `Message au user : ${drift.message}`,
    `Suggestion : ${drift.suggestion}`,
    `Évidence : ${JSON.stringify(drift.evidence)}`,
    `Note : un encart "${drift.message}" vient d'être affiché au user via systemMessage. Adapte ton prochain tour : rappel la suggestion si pertinent, propose un /clear ou une nouvelle session.`,
  ].join('\n');

  const out = {
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext,
    },
  };
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
} catch {
  process.exit(0);
} finally {
  clearTimeout(timer);
}
