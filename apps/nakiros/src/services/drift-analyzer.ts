/**
 * Drift detection service for Claude Code sessions.
 *
 * Detects three types of conversation drift:
 * - `loop`    — the session keeps retrying the same task without progress
 * - `topic`   — the conversation has shifted far from the original objective
 * - `context` — the context window is being polluted by unrelated content
 *
 * Stage 2: loop detector wired.
 * Stage 3: topic detector wired.
 * Stage 4: context detector wired.
 * Stage 5: `analyzeDriftFromPreparsed` added — called by conversation-analyzer
 *          to avoid double-reading the JSONL file.
 *
 * Detection order: loop → topic → context. More precise detectors run first.
 * Context detector is skipped when topic detector already fired (prevents
 * double-reporting on sessions with both heavy context usage and strong topic
 * drift — topic is the more actionable signal in that case).
 */

import type { ConversationDrift, DriftType } from '@nakiros/shared';
import { detectLoop } from './drift/loop-detector.js';
import { detectTopic } from './drift/topic-detector.js';
import { detectContext } from './drift/context-detector.js';
import { loadSessionTurns, loadUserMessages, loadContextMetrics } from './drift/session-loader.js';
import type { AssistantTurn, ContextMetrics, UserMessage } from './drift/session-loader.js';

// Re-export so drift sub-modules and callers importing from this module can
// continue to use `DriftReport` as a type alias for `ConversationDrift`.
export type { DriftType };
export type DriftReport = ConversationDrift;

// ── Stub payloads ─────────────────────────────────────────────────────────────

const STUB_LOOP: DriftReport = {
  type: 'loop',
  severity: 'high',
  message: "Nakiros a détecté que tu sembles tourner en rond (loop drift simulé).",
  suggestion: "Essaie /clear et reformule l'objectif, ou ouvre une nouvelle session.",
  evidence: { stub: true, note: 'Forced via ?force=loop for plumbing validation' },
};

const STUB_TOPIC: DriftReport = {
  type: 'topic',
  severity: 'medium',
  message: "Nakiros a détecté que la conversation s'éloigne de l'objectif initial (topic drift simulé).",
  suggestion: "Recentre la session sur la tâche d'origine ou ouvre un nouveau fil.",
  evidence: { stub: true, note: 'Forced via ?force=topic for plumbing validation' },
};

const STUB_CONTEXT: DriftReport = {
  type: 'context',
  severity: 'low',
  message: "Nakiros a détecté une pollution du contexte par des informations non liées (context drift simulé).",
  suggestion: "Utilise /clear pour repartir sur un contexte propre.",
  evidence: { stub: true, note: 'Forced via ?force=context for plumbing validation' },
};

const STUBS: Record<DriftType, DriftReport> = {
  loop: STUB_LOOP,
  topic: STUB_TOPIC,
  context: STUB_CONTEXT,
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Analyse a Claude Code session for drift signals.
 *
 * @param sessionId - The Claude Code session identifier to analyse.
 * @param opts.force - When set, bypasses real detection and returns a
 *   pre-built stub for the given drift type. Use only for plumbing validation.
 * @returns A {@link DriftReport} when drift is detected, or `null` otherwise.
 */
export async function analyzeDrift(
  sessionId: string,
  opts?: { force?: DriftType },
): Promise<DriftReport | null> {
  // Force mode: return a hardcoded stub for integration/plumbing tests.
  if (opts?.force) {
    return STUBS[opts.force] ?? null;
  }

  // Stage 2 — loop detector.
  const turns = loadSessionTurns(sessionId);
  if (!turns) return null;

  const loopDrift = detectLoop(turns);
  if (loopDrift) return loopDrift;

  // Stage 3 — topic detector.
  const userMessages = loadUserMessages(sessionId);
  if (userMessages) {
    const topicDrift = detectTopic(userMessages);
    if (topicDrift) return topicDrift;
  }

  // Stage 4 — context detector.
  // Only runs when topic drift was NOT detected (prevents double-reporting).
  // We still need userMessages to compute topic metrics inside detectContext.
  if (userMessages) {
    const contextMetrics = loadContextMetrics(sessionId);
    if (contextMetrics) {
      const contextDrift = detectContext(contextMetrics, userMessages);
      if (contextDrift) return contextDrift;
    }
  }

  return null;
}

// ── Preparsed variant ─────────────────────────────────────────────────────────

/**
 * Arguments pre-extracted by `conversation-analyzer.ts`, passed to
 * {@link analyzeDriftFromPreparsed} to avoid reading the session JSONL twice.
 */
export interface PreparsedSessionData {
  /**
   * Ordered list of assistant turns with tool-use events. Produced by
   * `conversation-analyzer.ts` while parsing the JSONL for the main analysis.
   */
  assistantTurns: AssistantTurn[];
  /**
   * Ordered list of real user messages (text-only, tool_result entries skipped).
   * Produced by `conversation-analyzer.ts` during friction analysis.
   */
  userMessages: UserMessage[];
  /**
   * Peak context token metrics extracted during the main analysis pass.
   * Used by the context drift detector.
   */
  contextMetrics: ContextMetrics;
}

/**
 * Run drift detection against data already parsed by `conversation-analyzer.ts`.
 *
 * This variant avoids re-reading the session JSONL file — the caller has
 * already parsed `assistantTurns`, `userMessages`, and `contextMetrics` for
 * its own analysis. Only the drift scoring logic runs here.
 *
 * Detection order is identical to {@link analyzeDrift}: loop → topic → context.
 * Context detector is suppressed when topic already fired.
 *
 * @param data - Pre-parsed session data from the conversation analysis pass.
 * @returns A {@link DriftReport} when drift is detected, or `null` otherwise.
 */
export function analyzeDriftFromPreparsed(data: PreparsedSessionData): DriftReport | null {
  const { assistantTurns, userMessages, contextMetrics } = data;

  // Stage 2 — loop detector.
  const loopDrift = detectLoop(assistantTurns);
  if (loopDrift) return loopDrift;

  // Stage 3 — topic detector.
  const topicDrift = detectTopic(userMessages);
  if (topicDrift) return topicDrift;

  // Stage 4 — context detector.
  // Only runs when topic drift was NOT detected (prevents double-reporting).
  const contextDrift = detectContext(contextMetrics, userMessages);
  if (contextDrift) return contextDrift;

  return null;
}
