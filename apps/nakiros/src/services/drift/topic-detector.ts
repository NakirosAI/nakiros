/**
 * Topic drift detector.
 *
 * Detects that a Claude Code session has progressively strayed away from its
 * original objective (the first user message) without a `/clear` having reset
 * the context.
 *
 * Algorithm:
 *   1. Extract all real user messages. If a `/clear` is present, consider only
 *      messages that follow the *last* `/clear` in the session.
 *   2. Require at least {@link MIN_USER_MESSAGES} user messages in the
 *      considered window, otherwise exit `null` (too early to judge).
 *   3. Tokenize each message with {@link tokenizeForCluster} (FR+EN stop words
 *      removed, ≥ 3 chars — same primitive used by conversation-analyzer).
 *   4. Count transitions: consecutive pairs where `jaccard(msg[i-1], msg[i])
 *      < TRANSITION_THRESHOLD`.
 *   5. Compute first–last similarity: `jaccard(tokens[0], tokens[last])`.
 *   6. Trigger when `transitions >= 2` AND `firstLastSimilarity < FIRST_LAST_THRESHOLD`.
 *   7. Severity: `high` when `transitions >= 3` OR `firstLastSimilarity < 0.05`,
 *      `medium` otherwise.
 *
 * This file imports only from `runner-core/cluster-tokens` — no cross-package
 * deps, no network, no async I/O.
 */

import { jaccard, tokenizeForCluster } from '../runner-core/cluster-tokens.js';
import type { DriftReport } from '../drift-analyzer.js';
import type { UserMessage } from './session-loader.js';

// ── Configuration ──────────────────────────────────────────────────────────────

/**
 * Minimum number of user messages (in the considered window) before the
 * detector can fire. Shorter sessions lack enough signal.
 */
const MIN_USER_MESSAGES = 6;

/** Jaccard below this value between consecutive messages counts as a transition. */
const TRANSITION_THRESHOLD = 0.15;

/**
 * Jaccard below this value between the first and last user messages is the
 * second condition for drift.
 */
const FIRST_LAST_THRESHOLD = 0.10;

/** Minimum number of transitions required to trigger. */
const MIN_TRANSITIONS = 2;

// ── Types ──────────────────────────────────────────────────────────────────────

/**
 * Raw metrics produced by {@link computeTopicMetrics}. Used both by
 * {@link detectTopic} to build a full {@link DriftReport} and by the context
 * detector to decide whether topic signals should be factored in.
 */
export interface TopicMetrics {
  /** Number of consecutive user-message pairs with jaccard < TRANSITION_THRESHOLD. */
  transitionsDetected: number;
  /** Jaccard similarity between the first and last user message in the window. */
  firstLastSimilarity: number;
  /** Number of user messages in the considered window (after /clear if any). */
  userMessageCount: number;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Returns the index of the last `/clear` message in the list, or `-1` if none
 * is found. A `/clear` is identified by a user message whose text is exactly
 * `/clear` (case-insensitive, trimmed).
 */
function findLastClearIndex(messages: UserMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].text.trim().toLowerCase() === '/clear') return i;
  }
  return -1;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Compute raw topic-drift metrics from a list of user messages without
 * deciding whether drift has occurred.
 *
 * Applies the same /clear windowing and Jaccard-based analysis as
 * {@link detectTopic}, but returns the raw counters so that other detectors
 * (e.g. the context detector) can factor them in without duplicating logic.
 *
 * Returns `null` when the considered window is shorter than
 * {@link MIN_USER_MESSAGES} (not enough signal).
 *
 * @param userMessages - Ordered list of real user messages for the session.
 */
export function computeTopicMetrics(userMessages: UserMessage[]): TopicMetrics | null {
  // Determine the slice to consider (after last /clear if any).
  const lastClearIdx = findLastClearIndex(userMessages);
  const window = lastClearIdx >= 0
    ? userMessages.slice(lastClearIdx + 1)
    : userMessages;

  if (window.length < MIN_USER_MESSAGES) return null;

  const tokenSets = window.map((m) => tokenizeForCluster(m.text));

  let transitions = 0;
  for (let i = 1; i < tokenSets.length; i++) {
    const sim = jaccard(tokenSets[i - 1]!, tokenSets[i]!);
    if (sim < TRANSITION_THRESHOLD) transitions++;
  }

  const firstLastSimilarity = jaccard(tokenSets[0]!, tokenSets[tokenSets.length - 1]!);

  return {
    transitionsDetected: transitions,
    firstLastSimilarity,
    userMessageCount: window.length,
  };
}

/**
 * Analyse user messages for topic drift.
 *
 * @param userMessages - The full ordered list of real user messages for the
 *   session, as returned by {@link loadUserMessages}.
 * @returns A {@link DriftReport} when topic drift is detected, `null` otherwise.
 */
export function detectTopic(userMessages: UserMessage[]): DriftReport | null {
  // Determine the slice to consider (after last /clear if any).
  const lastClearIdx = findLastClearIndex(userMessages);
  const clearSlashFound = lastClearIdx >= 0;
  const consideredAfterClearIdx = clearSlashFound ? lastClearIdx + 1 : null;

  const metrics = computeTopicMetrics(userMessages);
  if (!metrics) return null;

  const { transitionsDetected: transitions, firstLastSimilarity, userMessageCount } = metrics;

  // Trigger condition.
  if (transitions < MIN_TRANSITIONS || firstLastSimilarity >= FIRST_LAST_THRESHOLD) {
    return null;
  }

  // Severity.
  const severity: 'high' | 'medium' =
    transitions >= 3 || firstLastSimilarity < 0.05 ? 'high' : 'medium';

  const similarityPercent = Math.round(firstLastSimilarity * 100);

  return {
    type: 'topic',
    severity,
    message:
      `Nakiros a détecté que la conversation s'est éloignée de l'objectif initial ` +
      `(${transitions} transitions de sujet, similarité avec le premier message : ${similarityPercent}%).`,
    suggestion:
      "Recentre la session sur la tâche d'origine, ou ouvre une nouvelle session avec un cadrage clair.",
    evidence: {
      userMessageCount,
      transitionsDetected: transitions,
      transitionThreshold: TRANSITION_THRESHOLD,
      firstLastSimilarity,
      firstLastThreshold: FIRST_LAST_THRESHOLD,
      clearSlashFound,
      consideredAfterClearIdx,
    },
  };
}
