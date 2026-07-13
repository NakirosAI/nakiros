/**
 * Context pollution drift detector.
 *
 * Detects that the accumulated context is becoming a liability — the agent may
 * confuse past and present tasks because:
 *   - The context window is heavily occupied (≥ 50% filled).
 *   - AND the conversation has already shifted topic at least once.
 *
 * This is the most macro of the three drift detectors. It intentionally fires
 * only when context pressure AND topic divergence occur simultaneously, so it
 * never overlaps with the topic detector on its own (see ordering note in
 * drift-analyzer.ts).
 *
 * Algorithm:
 *   1. Load `{ maxContextTokens, contextWindow }` from the session JSONL via a
 *      lightweight single-pass scan (no analysis cache needed).
 *   2. Compute `contextUsageRatio = maxContextTokens / contextWindow`.
 *   3. Compute the current goal-anchor trajectory via
 *      {@link computeTopicMetrics} (no duplicate topic model).
 *   4. Trigger when ALL THREE conditions hold:
 *      - `contextUsageRatio >= CONTEXT_USAGE_THRESHOLD` (≥ 50%)
 *      - at least two consecutive off-goal messages
 *      - recent-to-goal connection below 20%
 *   5. Severity: `high` above 75% context usage or when the departure itself
 *      is long and strongly disconnected. `medium` otherwise.
 *
 * Note: the drift-analyzer.ts ensures this detector is only called when the
 * topic detector did not already fire. Context uses a shorter persistence
 * requirement because context pressure provides the second corroborating signal.
 */

import type { DriftReport } from '../drift-analyzer.js';
import type { AssistantTurn, ContextMetrics, UserMessage } from './session-loader.js';
import { computeTopicMetrics } from './topic-detector.js';

// ── Configuration ─────────────────────────────────────────────────────────────

/** Fraction of the context window that must be occupied to consider firing. */
const CONTEXT_USAGE_THRESHOLD = 0.50;

/** Above this fraction the detector reports `high` severity unconditionally. */
const HIGH_USAGE_THRESHOLD = 0.75;

/**
 * Maximum connection of the trailing departure run to the current goal.
 */
const DEPARTURE_CONNECTION_THRESHOLD = 0.20;

/** Context pressure needs less persistence than a standalone topic alert. */
const MIN_SUSTAINED_DEPARTURE = 2;

/** Minimum number of user messages before the detector can fire. */
const MIN_USER_MESSAGES = 10;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Analyse a session for context pollution drift.
 *
 * Both the context metrics and the user messages must be provided — callers
 * are responsible for loading them (the analyzer loads them once and passes
 * them in to avoid redundant I/O).
 *
 * @param contextMetrics - Peak token count and inferred window size from the
 *   session JSONL, as returned by {@link loadContextMetrics}.
 * @param userMessages - Ordered list of real user messages for the session,
 *   as returned by {@link loadUserMessages}.
 * @returns A {@link DriftReport} when context pollution is detected, `null`
 *   otherwise.
 */
export function detectContext(
  contextMetrics: ContextMetrics,
  userMessages: UserMessage[],
  assistantTurns: AssistantTurn[] = [],
): DriftReport | null {
  // Guard: not enough messages to judge.
  if (userMessages.length < MIN_USER_MESSAGES) return null;

  const { maxContextTokens, contextWindow } = contextMetrics;

  // Guard: no usable context data.
  if (contextWindow <= 0 || maxContextTokens <= 0) return null;

  const contextUsageRatio = maxContextTokens / contextWindow;

  // Condition 1: context window must be at least half full.
  if (contextUsageRatio < CONTEXT_USAGE_THRESHOLD) return null;

  // Condition 2 + 3: the off-goal trajectory must persist and remain detached.
  const topicMetrics = computeTopicMetrics(userMessages, assistantTurns);
  if (!topicMetrics) return null;

  const {
    transitionsDetected,
    departureWindowConnection,
    sustainedDepartureCount,
  } = topicMetrics;

  if (
    sustainedDepartureCount < MIN_SUSTAINED_DEPARTURE ||
    departureWindowConnection >= DEPARTURE_CONNECTION_THRESHOLD
  ) {
    return null;
  }

  // Severity.
  const isHighUsage = contextUsageRatio >= HIGH_USAGE_THRESHOLD;
  const isHighTopic = sustainedDepartureCount >= 3 && departureWindowConnection < 0.10;
  const severity: 'high' | 'medium' = isHighUsage || isHighTopic ? 'high' : 'medium';

  const usagePct = Math.round(contextUsageRatio * 100);

  return {
    type: 'context',
    severity,
    message:
      `Nakiros a détecté que le contexte accumulé devient un poids ` +
      `(${usagePct}% du contexte utilisé, ${sustainedDepartureCount} messages ` +
      `consécutifs éloignés de l'objectif courant).`,
    suggestion:
      "Un /clear avant la prochaine tâche évitera que l'agent mélange ancien et nouveau contexte.",
    evidence: {
      contextUsageRatio,
      contextUsageThreshold: CONTEXT_USAGE_THRESHOLD,
      maxContextTokens,
      contextWindow,
      userMessageCount: userMessages.length,
      transitionsDetected,
      endOpeningConnection: departureWindowConnection,
      recentWindowConnection: topicMetrics.recentWindowConnection,
      departureWindowConnection,
      sustainedDepartureCount,
      sustainedDepartureThreshold: MIN_SUSTAINED_DEPARTURE,
    },
  };
}
