import type {
  CodexConversationAnalysis,
  CodexScoreFactor,
  ConversationFrictionPoint,
  ConversationMessage,
  ConversationHealthZone,
} from '@nakiros/shared';

import {
  getParsedCodexConversation,
  type ParsedCodexSession,
} from './codex-conversation-parser.js';

const WORD_SEGMENTER = new Intl.Segmenter(undefined, { granularity: 'word' });
const MIN_FRICTION_TOKENS = 4;
const REPETITION_THRESHOLD = 0.65;
const REPETITION_LOOKBACK = 5;

function tokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const part of WORD_SEGMENTER.segment(text.normalize('NFKC').toLowerCase())) {
    if (!part.isWordLike || [...part.segment].length < 2) continue;
    out.add(part.segment);
  }
  return out;
}

function tokenWeight(token: string): number {
  const length = Math.min([...token].length, 12);
  return length * length;
}

function weightedJaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const union = new Set([...a, ...b]);
  let intersectionWeight = 0;
  let unionWeight = 0;
  for (const token of union) {
    const weight = tokenWeight(token);
    unionWeight += weight;
    if (a.has(token) && b.has(token)) intersectionWeight += weight;
  }
  return unionWeight === 0 ? 0 : intersectionWeight / unionWeight;
}

function nearestUserMessage(messages: ConversationMessage[], timestamp: string): ConversationMessage | null {
  const target = Date.parse(timestamp);
  const users = messages.filter((message) => message.type === 'user' && message.content.trim());
  if (Number.isNaN(target)) return users.at(-1) ?? null;
  let nearest: ConversationMessage | null = null;
  for (const message of users) {
    const messageTime = Date.parse(message.timestamp);
    if (!Number.isNaN(messageTime) && messageTime <= target) nearest = message;
  }
  return nearest;
}

/**
 * Structural friction only: repeated requests and native turn aborts. No
 * vocabulary, sentiment model or language-specific intent matching is used.
 */
function frictionPoints(parsed: ParsedCodexSession): {
  points: ConversationFrictionPoint[];
  repeatedRequestCount: number;
} {
  const userMessages = parsed.messages.filter(
    (message) => message.type === 'user' && message.content.trim(),
  );
  const denominator = Math.max(userMessages.length - 1, 1);
  const tokenSets = userMessages.map((message) => tokens(message.content));
  const points: ConversationFrictionPoint[] = [];
  let repeatedRequestCount = 0;

  for (let index = 1; index < userMessages.length; index++) {
    if (tokenSets[index]!.size < MIN_FRICTION_TOKENS) continue;
    let best = 0;
    let bestPrevious = -1;
    for (let previous = Math.max(0, index - REPETITION_LOOKBACK); previous < index; previous++) {
      if (tokenSets[previous]!.size < MIN_FRICTION_TOKENS) continue;
      const similarity = weightedJaccard(tokenSets[index]!, tokenSets[previous]!);
      if (similarity > best) {
        best = similarity;
        bestPrevious = previous;
      }
    }
    if (best < REPETITION_THRESHOLD || bestPrevious < 0) continue;
    repeatedRequestCount++;
    const message = userMessages[index]!;
    points.push({
      timestamp: message.timestamp,
      offsetPct: index / denominator,
      snippet: message.content.slice(0, 200),
      matchedPattern: `repetition:T${bestPrevious + 1}->T${index + 1}:${best.toFixed(2)}`,
      precedingTool: null,
    });
  }

  for (const abort of parsed.native.abortEvents) {
    const message = nearestUserMessage(parsed.messages, abort.timestamp);
    points.push({
      timestamp: abort.timestamp,
      offsetPct: abort.offsetPct,
      snippet: message?.content.slice(0, 200) ?? '',
      matchedPattern: 'abort',
      precedingTool: null,
    });
  }

  points.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  return { points, repeatedRequestCount };
}

function scoreAnalysis(
  parsed: ParsedCodexSession,
  repeatedRequestCount: number,
  maxContextTokens: number | null,
  contextWindow: number | null,
): { score: number; healthZone: ConversationHealthZone; factors: CodexScoreFactor[] } {
  const factors: CodexScoreFactor[] = [];
  if (maxContextTokens !== null && contextWindow !== null && contextWindow > 0) {
    const ratio = maxContextTokens / contextWindow;
    const penalty = ratio >= 0.8 ? 25 : ratio >= 0.5 ? 10 : 0;
    if (penalty > 0) factors.push({ signal: 'context', count: 1, penalty });
  }
  const compactionPenalty = Math.min(parsed.native.compactions.length * 15, 30);
  if (compactionPenalty > 0) {
    factors.push({ signal: 'compaction', count: parsed.native.compactions.length, penalty: compactionPenalty });
  }
  const toolErrorCount = Object.values(parsed.native.toolStats).reduce(
    (sum, stats) => sum + stats.errorCount,
    0,
  );
  const toolPenalty = Math.min(toolErrorCount * 8, 24);
  if (toolPenalty > 0) factors.push({ signal: 'tool-errors', count: toolErrorCount, penalty: toolPenalty });
  const abortPenalty = Math.min(parsed.native.abortedTurns * 10, 20);
  if (abortPenalty > 0) factors.push({ signal: 'aborts', count: parsed.native.abortedTurns, penalty: abortPenalty });
  const frictionPenalty = Math.min(repeatedRequestCount * 8, 24);
  if (frictionPenalty > 0) {
    factors.push({ signal: 'friction', count: repeatedRequestCount, penalty: frictionPenalty });
  }

  const score = Math.max(0, 100 - factors.reduce((sum, factor) => sum + factor.penalty, 0));
  return {
    score,
    healthZone: score >= 80 ? 'healthy' : score >= 55 ? 'watch' : 'degraded',
    factors,
  };
}

/** Deterministic provider-native analysis; no LLM, network, or Claude fields. */
export function analyzeParsedCodexConversation(
  parsed: ParsedCodexSession,
): CodexConversationAnalysis {
  const contextWindow = parsed.conversation.contextWindow ?? null;
  const maxContextTokens = parsed.native.contextSamples.length
    ? Math.max(...parsed.native.contextSamples.map((sample) => sample.tokens))
    : null;
  const totalTokens = parsed.native.contextSamples.at(-1)?.totalTokens ??
    parsed.conversation.tokenUsage?.totalTokens ?? null;
  const detectedFriction = frictionPoints(parsed);
  const scored = scoreAnalysis(parsed, detectedFriction.repeatedRequestCount, maxContextTokens, contextWindow);
  const toolErrorCount = Object.values(parsed.native.toolStats).reduce(
    (sum, stats) => sum + stats.errorCount,
    0,
  );

  return {
    provider: 'codex',
    sessionId: parsed.conversation.sessionId,
    projectId: parsed.conversation.projectId,
    startedAt: parsed.conversation.startedAt,
    lastMessageAt: parsed.conversation.lastMessageAt,
    durationMs: parsed.conversation.durationMs ?? 0,
    messageCount: parsed.conversation.messageCount,
    summary: parsed.conversation.summary,
    gitBranch: parsed.conversation.gitBranch,
    model: parsed.conversation.model ?? null,
    contextWindow,
    maxContextTokens,
    totalTokens,
    contextSamples: parsed.native.contextSamples,
    compactions: parsed.native.compactions,
    toolStats: parsed.native.toolStats,
    toolErrorCount,
    frictionPoints: detectedFriction.points,
    turnDurationsMs: parsed.native.turnDurationsMs,
    abortedTurns: parsed.native.abortedTurns,
    score: scored.score,
    healthZone: scored.healthZone,
    scoreFactors: scored.factors,
  };
}

export function analyzeCodexConversation(
  sessionsDir: string,
  projectPath: string,
  projectId: string,
  sessionId: string,
): CodexConversationAnalysis | null {
  const parsed = getParsedCodexConversation(sessionsDir, projectPath, projectId, sessionId);
  return parsed ? analyzeParsedCodexConversation(parsed) : null;
}
