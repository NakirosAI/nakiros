/**
 * Topic drift detector.
 *
 * Detects that a Claude Code session has progressively strayed away from its
 * original objective (the opening messages) without a `/clear` having reset
 * the context.
 *
 * A naive "consecutive Jaccard < threshold = transition" count produces heavy
 * false positives: real debugging sessions send short, terse follow-ups
 * ("ok, commit this") and each message often introduces a new *sub-problem*
 * of the same project, so adjacent messages rarely share vocabulary even when
 * the session is perfectly coherent. Three ideas fix that:
 *
 *   1. **Filter procedural noise.** Messages with fewer than
 *      {@link MIN_CONTENT_TOKENS} meaningful tokens ("ok on peut commit"),
 *      IDE-context injections (`<ide_…>`), and slash-command stdout wrappers
 *      carry no topic — they are dropped before analysis.
 *   2. **Transitions vs accumulated context, not the previous message.** A
 *      message is a transition only when it is disconnected from *everything*
 *      discussed so far (it shares < {@link CONTEXT_CONNECTION_THRESHOLD} of
 *      its own vocabulary with the union of all prior messages). A new
 *      sub-problem that reuses recurring project vocabulary is NOT a
 *      transition; a genuine jump to an unrelated area is.
 *   3. **End-vs-opening connection, not first-vs-last message.** Drift means
 *      the session *ended somewhere unrelated to where it began*. We measure
 *      how much the final message connects to the opening context (union of
 *      the first few substantive messages) rather than comparing two single
 *      messages, which is brittle when one is long and one is terse.
 *
 * Trigger: `transitions >= MIN_TRANSITIONS` AND
 * `endOpeningConnection < END_OPENING_THRESHOLD`.
 *
 * This file imports only from `runner-core/cluster-tokens` — no cross-package
 * deps, no network, no async I/O.
 */

import { jaccard, tokenizeForCluster } from '../runner-core/cluster-tokens.js';
import type { DriftReport } from '../drift-analyzer.js';
import type { UserMessage } from './session-loader.js';

// ── Configuration ──────────────────────────────────────────────────────────────

/**
 * Minimum number of substantive user messages (after filtering procedural
 * noise) before the detector can fire. Shorter sessions lack enough signal.
 */
const MIN_USER_MESSAGES = 6;

/**
 * A message must carry at least this many meaningful tokens to count as a
 * topic-bearing message. Below it ("ok", "on continue", "tu peux commit") it
 * is a procedural acknowledgement, not a topic, and is dropped.
 */
const MIN_CONTENT_TOKENS = 4;

/**
 * A message is a transition when the fraction of its own tokens that already
 * appeared in the accumulated session vocabulary is below this value — i.e.
 * it is (almost) entirely new vocabulary, disconnected from everything so far.
 */
const CONTEXT_CONNECTION_THRESHOLD = 0.15;

/**
 * The session is considered to have drifted only when its final message shares
 * less than this fraction of its vocabulary with the opening context. Above
 * it, the conversation is still anchored to where it started.
 */
const END_OPENING_THRESHOLD = 0.10;

/** Minimum number of transitions required to trigger. */
const MIN_TRANSITIONS = 2;

/** How many leading substantive messages define the "opening context". */
const OPENING_MESSAGES = 3;

// ── Types ──────────────────────────────────────────────────────────────────────

/**
 * Raw metrics produced by {@link computeTopicMetrics}. Used both by
 * {@link detectTopic} to build a full {@link DriftReport} and by the context
 * detector to decide whether topic signals should be factored in.
 */
export interface TopicMetrics {
  /**
   * Number of messages that were disconnected from the accumulated context at
   * the point they appeared (see {@link CONTEXT_CONNECTION_THRESHOLD}).
   */
  transitionsDetected: number;
  /**
   * Fraction of the final message's vocabulary that connects back to the
   * opening context (union of the first {@link OPENING_MESSAGES} substantive
   * messages). Low = the session ended on an unrelated topic.
   */
  endOpeningConnection: number;
  /** Number of substantive user messages after filtering procedural noise. */
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

/**
 * Strip content that is not the user's own topic: IDE context injections
 * (`<ide_opened_file>…`, `<ide_selection>…`) and their bare tags. Slash-command
 * stdout wrappers are handled by {@link isProceduralWrapper}. Returns the
 * cleaned text used only for topic tokenization.
 */
function topicText(text: string): string {
  return text
    .replace(/<ide_[^>]*>[\s\S]*?<\/ide_[^>]*>/g, ' ')
    .replace(/<ide_[^>]*>/g, ' ');
}

/**
 * True when the message is a slash-command echo / local-command stdout wrapper
 * rather than a real user turn. Those entries carry command plumbing, not a
 * topic, and would otherwise inject spurious vocabulary.
 */
function isProceduralWrapper(text: string): boolean {
  return text.includes('<command-name>') || text.includes('<local-command-');
}

/**
 * Fraction of `probe`'s tokens that appear in `context`. Unlike Jaccard, this
 * is normalised by the probe size only, so it stays meaningful when `context`
 * (the accumulated vocabulary) is much larger than the single probe message.
 * Returns 1 for an empty probe (nothing new → fully connected).
 */
function connection(probe: Set<string>, context: Set<string>): number {
  if (probe.size === 0) return 1;
  let shared = 0;
  for (const t of probe) if (context.has(t)) shared++;
  return shared / probe.size;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Compute raw topic-drift metrics from a list of user messages without
 * deciding whether drift has occurred.
 *
 * Applies /clear windowing, procedural-noise filtering, accumulated-context
 * transition counting, and the end-vs-opening connection. Returns the raw
 * counters so other detectors (e.g. the context detector) can factor them in
 * without duplicating logic.
 *
 * Returns `null` when fewer than {@link MIN_USER_MESSAGES} substantive messages
 * remain after filtering (not enough signal).
 *
 * @param userMessages - Ordered list of real user messages for the session.
 */
export function computeTopicMetrics(userMessages: UserMessage[]): TopicMetrics | null {
  // Determine the slice to consider (after last /clear if any).
  const lastClearIdx = findLastClearIndex(userMessages);
  const windowed = lastClearIdx >= 0
    ? userMessages.slice(lastClearIdx + 1)
    : userMessages;

  // Drop procedural noise, then keep only messages substantial enough to
  // establish a topic. `tokenizeForCluster` already removes stop words and
  // sub-3-char tokens, so the size check counts meaningful tokens.
  const tokenSets: Set<string>[] = [];
  for (const m of windowed) {
    if (isProceduralWrapper(m.text)) continue;
    const tokens = tokenizeForCluster(topicText(m.text));
    if (tokens.size < MIN_CONTENT_TOKENS) continue;
    tokenSets.push(tokens);
  }

  if (tokenSets.length < MIN_USER_MESSAGES) return null;

  // Count transitions against the accumulated vocabulary of all prior messages.
  const accumulated = new Set<string>(tokenSets[0]);
  let transitions = 0;
  for (let i = 1; i < tokenSets.length; i++) {
    if (connection(tokenSets[i]!, accumulated) < CONTEXT_CONNECTION_THRESHOLD) {
      transitions++;
    }
    for (const t of tokenSets[i]!) accumulated.add(t);
  }

  // Opening context = union of the first few substantive messages.
  const openingCount = Math.min(OPENING_MESSAGES, Math.floor(tokenSets.length / 2));
  const opening = new Set<string>();
  for (let i = 0; i < openingCount; i++) {
    for (const t of tokenSets[i]!) opening.add(t);
  }
  const endOpeningConnection = connection(tokenSets[tokenSets.length - 1]!, opening);

  return {
    transitionsDetected: transitions,
    endOpeningConnection,
    userMessageCount: tokenSets.length,
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
  const lastClearIdx = findLastClearIndex(userMessages);
  const clearSlashFound = lastClearIdx >= 0;
  const consideredAfterClearIdx = clearSlashFound ? lastClearIdx + 1 : null;

  const metrics = computeTopicMetrics(userMessages);
  if (!metrics) return null;

  const { transitionsDetected: transitions, endOpeningConnection, userMessageCount } = metrics;

  // Trigger condition: enough disconnected topic jumps AND the session ended
  // on something unrelated to where it began.
  if (transitions < MIN_TRANSITIONS || endOpeningConnection >= END_OPENING_THRESHOLD) {
    return null;
  }

  // Severity.
  const severity: 'high' | 'medium' =
    transitions >= 3 || endOpeningConnection < 0.02 ? 'high' : 'medium';

  const connectionPercent = Math.round(endOpeningConnection * 100);

  return {
    type: 'topic',
    severity,
    message:
      `Nakiros a détecté que la conversation s'est éloignée de l'objectif initial ` +
      `(${transitions} changements de sujet, le fil actuel n'a que ${connectionPercent}% de vocabulaire commun avec le début).`,
    suggestion:
      "Recentre la session sur la tâche d'origine, ou ouvre une nouvelle session avec un cadrage clair.",
    evidence: {
      userMessageCount,
      transitionsDetected: transitions,
      transitionThreshold: MIN_TRANSITIONS,
      endOpeningConnection,
      endOpeningThreshold: END_OPENING_THRESHOLD,
      clearSlashFound,
      consideredAfterClearIdx,
    },
  };
}
