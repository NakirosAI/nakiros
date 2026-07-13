/**
 * Topic drift detector.
 *
 * The detector builds a language-neutral lexical anchor from the beginning of
 * the current session and requires the recent trajectory to stay disconnected
 * for several substantive messages. The result is a cheap local suspicion
 * gate; the in-conversation agent adjudicates intent (including an intentional
 * reframe) before Argos surfaces a topic alert.
 *
 * This file imports only from `runner-core/cluster-tokens` — no cross-package
 * deps, no network, no async I/O.
 */

import type { DriftReport } from '../drift-analyzer.js';
import type { AssistantTurn, UserMessage } from './session-loader.js';

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
 * A message is outside the current goal anchor below this connection ratio.
 */
const GOAL_CONNECTION_THRESHOLD = 0.12;

/**
 * Maximum connection of the recent trajectory to the current goal anchor.
 */
const RECENT_WINDOW_THRESHOLD = 0.12;

/** Consecutive substantive departures required before opening adjudication. */
const SUSTAINED_DEPARTURE_MESSAGES = 3;

/** Leading substantive messages used to form the current goal anchor. */
const GOAL_ANCHOR_MESSAGES = 3;

/** Recent messages combined to measure whether the trajectory returned. */
const RECENT_WINDOW_MESSAGES = 3;

const WORD_SEGMENTER = new Intl.Segmenter(undefined, { granularity: 'word' });

// ── Types ──────────────────────────────────────────────────────────────────────

/**
 * Raw metrics produced by {@link computeTopicMetrics}. Used both by
 * {@link detectTopic} to build a full {@link DriftReport} and by the context
 * detector to decide whether topic signals should be factored in.
 */
export interface TopicMetrics {
  /**
   * Number of times the trajectory crossed from connected to disconnected.
   */
  transitionsDetected: number;
  /**
   * Backward-compatible alias of {@link recentWindowConnection}.
   */
  endOpeningConnection: number;
  /** Number of substantive user messages after filtering procedural noise. */
  userMessageCount: number;
  /** Connection of the combined recent trajectory to the current goal anchor. */
  recentWindowConnection: number;
  /** Number of consecutive disconnected messages at the end of the session. */
  sustainedDepartureCount: number;
  /** Connection of only the trailing departure run to the current goal. */
  departureWindowConnection: number;
  /** Original user-message index after the latest structural reset. */
  goalBoundaryIndex: number | null;
  /** Local evidence source used to enrich the lexical goal anchor. */
  similarityMethod: 'lexical' | 'conversation-graph';
  /** Number of plan/concept tokens added from early assistant explanations. */
  semanticAnchorTokens: number;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Returns the index of the last `/clear` message in the list, or `-1` if none
 * is found. A `/clear` is identified by a user message whose text is exactly
 * `/clear` (case-insensitive, trimmed).
 */
function findLastClearIndex(messages: UserMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]!.text.trim().toLowerCase() === '/clear') return i;
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
 * Tokenize topic text with Unicode word boundaries. This deliberately has no
 * language-specific stop-word list or intent keywords: German, Chinese and
 * other scripts follow the same structural rules. Very short turns naturally
 * remain below {@link MIN_CONTENT_TOKENS} and are treated as non-substantive.
 */
function tokenizeTopic(text: string): Set<string> {
  const tokens = new Set<string>();
  const normalized = text.normalize('NFKC').toLowerCase();
  for (const part of WORD_SEGMENTER.segment(normalized)) {
    if (!part.isWordLike) continue;
    if ([...part.segment].length < 2) continue;
    tokens.add(part.segment);
  }
  return tokens;
}

/**
 * Weighted fraction of `probe`'s tokens that appear in `context`. Longer terms
 * carry more signal than short structural words without requiring a stop-word
 * dictionary. Unlike Jaccard, this is normalised by the probe only, so it stays
 * meaningful when `context` (the goal anchor) is much larger.
 * Returns 1 for an empty probe (nothing new → fully connected).
 */
function tokenWeight(token: string): number {
  const length = Math.min([...token].length, 12);
  return length * length;
}

function connection(probe: Set<string>, context: Set<string>): number {
  if (probe.size === 0) return 1;
  let sharedWeight = 0;
  let probeWeight = 0;
  for (const token of probe) {
    const weight = tokenWeight(token);
    probeWeight += weight;
    if (context.has(token)) sharedWeight += weight;
  }
  return probeWeight === 0 ? 1 : sharedWeight / probeWeight;
}

const PLAN_ITEM = /^\s*(?:[-*+]\s+|\d+[.)]\s+|\[[ xX]\]\s+)/;
const MAX_SEMANTIC_ANCHOR_TOKENS = 160;

function timestampAtOrBefore(value: string, limit: string): boolean {
  const time = Date.parse(value);
  const end = Date.parse(limit);
  return !Number.isFinite(time) || !Number.isFinite(end) || time <= end;
}

/**
 * Expand the opening goal with concepts the agent explicitly connected to it
 * before the opening window closed. Structured list items are treated as plan
 * nodes. Prose replies form one-hop concept edges only when they share at
 * least one opening token. This is conversation-local and language-neutral:
 * no dictionary, model download or provider API is involved.
 */
function enrichGoalFromConversation(
  goalAnchor: Set<string>,
  assistantTurns: AssistantTurn[],
  anchorEndTimestamp: string,
  resetTimestamp: string | null,
): number {
  const original = new Set(goalAnchor);
  const planTokens = new Set<string>();
  const proseTokenCounts = new Map<string, number>();
  for (const turn of assistantTurns) {
    if (!turn.text?.trim()) continue;
    if (resetTimestamp && !timestampAtOrBefore(resetTimestamp, turn.timestamp)) continue;
    if (!timestampAtOrBefore(turn.timestamp, anchorEndTimestamp)) continue;

    const allTokens = tokenizeTopic(topicText(turn.text));
    const connectedToOpening = [...allTokens].some((token) => original.has(token));
    if (!connectedToOpening) continue;

    const planLines = turn.text.split('\n').filter((line) => PLAN_ITEM.test(line));
    if (planLines.length >= 2) {
      for (const token of tokenizeTopic(topicText(planLines.join('\n')))) planTokens.add(token);
      continue;
    }
    for (const token of allTokens) {
      proseTokenCounts.set(token, (proseTokenCounts.get(token) ?? 0) + 1);
    }
  }
  const candidates = [
    ...planTokens,
    ...[...proseTokenCounts.entries()]
      .filter(([, count]) => count >= 2)
      .map(([token]) => token),
  ];
  for (const token of candidates) {
    if (goalAnchor.size >= MAX_SEMANTIC_ANCHOR_TOKENS) break;
    goalAnchor.add(token);
  }
  return Math.max(0, goalAnchor.size - original.size);
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Compute raw topic-drift metrics from a list of user messages without
 * deciding whether drift has occurred.
 *
 * Applies the structural `/clear` boundary, procedural filtering, Unicode
 * tokenization, goal anchoring, and sustained-departure scoring.
 *
 * Returns `null` when fewer than {@link MIN_USER_MESSAGES} substantive messages
 * remain after filtering (not enough signal).
 *
 * @param userMessages - Ordered list of real user messages for the session.
 */
export function computeTopicMetrics(
  userMessages: UserMessage[],
  assistantTurns: AssistantTurn[] = [],
): TopicMetrics | null {
  // Determine the slice to consider (after last /clear if any).
  const lastClearIdx = findLastClearIndex(userMessages);
  const windowed = lastClearIdx >= 0
    ? userMessages.slice(lastClearIdx + 1)
    : userMessages;
  const goalBoundaryIndex = windowed[0]?.index ?? null;

  // Drop procedural noise, then keep only messages substantial enough to
  // establish a topic. This threshold is structural and independent of the
  // language used by the user.
  const topicMessages: Array<{ tokens: Set<string>; timestamp: string }> = [];
  for (const m of windowed) {
    if (isProceduralWrapper(m.text)) continue;
    const tokens = tokenizeTopic(topicText(m.text));
    if (tokens.size < MIN_CONTENT_TOKENS) continue;
    topicMessages.push({ tokens, timestamp: m.timestamp });
  }

  if (topicMessages.length < MIN_USER_MESSAGES) return null;

  const anchorCount = Math.min(GOAL_ANCHOR_MESSAGES, Math.floor(topicMessages.length / 2));
  const goalAnchor = new Set<string>();
  for (let index = 0; index < anchorCount; index++) {
    for (const token of topicMessages[index]!.tokens) goalAnchor.add(token);
  }
  const semanticAnchorTokens = enrichGoalFromConversation(
    goalAnchor,
    assistantTurns,
    topicMessages[anchorCount - 1]?.timestamp ?? '',
    lastClearIdx >= 0 ? userMessages[lastClearIdx]?.timestamp ?? null : null,
  );

  let transitions = 0;
  let outsideGoal = false;
  let sustainedDepartureCount = 0;
  for (let index = anchorCount; index < topicMessages.length; index++) {
    const disconnected = connection(topicMessages[index]!.tokens, goalAnchor) < GOAL_CONNECTION_THRESHOLD;
    if (disconnected && !outsideGoal) transitions++;
    outsideGoal = disconnected;
    sustainedDepartureCount = disconnected ? sustainedDepartureCount + 1 : 0;
  }

  const recentTokens = new Set<string>();
  for (const message of topicMessages.slice(-RECENT_WINDOW_MESSAGES)) {
    for (const token of message.tokens) recentTokens.add(token);
  }
  const recentWindowConnection = connection(recentTokens, goalAnchor);
  const departureTokens = new Set<string>();
  for (const message of topicMessages.slice(-sustainedDepartureCount)) {
    for (const token of message.tokens) departureTokens.add(token);
  }
  const departureWindowConnection = sustainedDepartureCount > 0
    ? connection(departureTokens, goalAnchor)
    : recentWindowConnection;

  return {
    transitionsDetected: transitions,
    endOpeningConnection: recentWindowConnection,
    userMessageCount: topicMessages.length,
    recentWindowConnection,
    sustainedDepartureCount,
    departureWindowConnection,
    goalBoundaryIndex,
    similarityMethod: semanticAnchorTokens > 0 ? 'conversation-graph' : 'lexical',
    semanticAnchorTokens,
  };
}

/**
 * Analyse user messages for topic drift.
 *
 * @param userMessages - The full ordered list of real user messages for the
 *   session, as returned by {@link loadUserMessages}.
 * @returns A {@link DriftReport} when topic drift is detected, `null` otherwise.
 */
export function detectTopic(
  userMessages: UserMessage[],
  assistantTurns: AssistantTurn[] = [],
): DriftReport | null {
  const lastClearIdx = findLastClearIndex(userMessages);
  const clearSlashFound = lastClearIdx >= 0;

  const metrics = computeTopicMetrics(userMessages, assistantTurns);
  if (!metrics) return null;

  const {
    transitionsDetected: transitions,
    recentWindowConnection,
    sustainedDepartureCount,
    userMessageCount,
  } = metrics;

  if (
    sustainedDepartureCount < SUSTAINED_DEPARTURE_MESSAGES ||
    recentWindowConnection >= RECENT_WINDOW_THRESHOLD
  ) {
    return null;
  }

  const severity: 'high' | 'medium' =
    sustainedDepartureCount >= 5 || recentWindowConnection < 0.02 ? 'high' : 'medium';

  const connectionPercent = Math.round(recentWindowConnection * 100);

  return {
    type: 'topic',
    severity,
    message:
      `Nakiros a détecté que la conversation s'est éloignée de l'objectif initial ` +
      `(${sustainedDepartureCount} messages durablement éloignés, ` +
      `le fil récent n'a que ${connectionPercent}% de vocabulaire commun avec l'objectif courant).`,
    suggestion:
      "Recentre la session sur la tâche d'origine, ou ouvre une nouvelle session avec un cadrage clair.",
    evidence: {
      userMessageCount,
      transitionsDetected: transitions,
      transitionThreshold: 1,
      endOpeningConnection: recentWindowConnection,
      endOpeningThreshold: RECENT_WINDOW_THRESHOLD,
      recentWindowConnection,
      recentWindowThreshold: RECENT_WINDOW_THRESHOLD,
      sustainedDepartureCount,
      sustainedDepartureThreshold: SUSTAINED_DEPARTURE_MESSAGES,
      departureWindowConnection: metrics.departureWindowConnection,
      clearSlashFound,
      consideredAfterClearIdx: metrics.goalBoundaryIndex,
      similarityMethod: metrics.similarityMethod,
      semanticAnchorTokens: metrics.semanticAnchorTokens,
    },
  };
}
