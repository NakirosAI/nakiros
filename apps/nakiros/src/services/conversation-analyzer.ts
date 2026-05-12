import { readFileSync } from 'fs';
import { basename, join } from 'path';

import type {
  ConversationAnalysis,
  ConversationCompaction,
  ConversationCostSample,
  ConversationFrictionPoint,
  ConversationFrictionZone,
  ConversationHealthZone,
  ConversationHotFile,
  ConversationPausePoint,
  ConversationTip,
  ConversationToolStats,
} from '@nakiros/shared';
import { SENTIMENT_FRICTION_THRESHOLD } from '@nakiros/shared';

import { loadSentimentTrace } from './sentiment/sentiment-store.js';

// Billed-equivalent multipliers (tokens of input-equivalent).
const M_INPUT = 1;
const M_OUTPUT = 5;
const M_CACHE_READ = 0.1;
const M_CACHE_5M = 1.25;
const M_CACHE_1H = 2;

// ---------------------------------------------------------------------------
// Heuristic constants
// ---------------------------------------------------------------------------

// Anthropic prompt cache TTL — Claude Code can opt into the 1h beta cache via
// `cache_control: { ttl: "1h" }`. We auto-detect per-session by inspecting the
// `usage.cache_creation` breakdown (`ephemeral_5m_input_tokens` vs
// `ephemeral_1h_input_tokens`). Empirically Claude Code uses 1h beta
// systematically since 2026-04, but we keep the detection so we stay correct
// if it changes. See `feedback_cache_1h_beta_default` memory.
const CACHE_TTL_5M_MS = 5 * 60 * 1000;
const CACHE_TTL_1H_MS = 60 * 60 * 1000;

// Context window detection — Claude Code can opt into the 1M context for
// Opus 4.x via beta, and we can't read that header from the JSONL. Fall back
// to the observed peak: anything substantially past standard = assume 1M.
const STANDARD_WINDOW = 200_000;
const EXTENDED_WINDOW = 1_000_000;
const EXTENDED_WINDOW_TRIGGER = 250_000;

// Health zones are expressed as a fraction of the active context window so
// they scale with the model. 25% / 75% roughly map to the empirical
// "lost in the middle" curve: low pressure, watch, degraded.
const HEALTHY_ZONE_PCT = 0.25;
const WATCH_ZONE_PCT = 0.75;

// SENTIMENT_FRICTION_THRESHOLD is imported from @nakiros/shared — shared with
// the frontend so the displayed signals are always aligned with the friction
// detection logic. Calibration notes: bert-nlptown 5-class model with summed
// probabilities P(Negative) = P(1★) + P(2★). At 0.60 the threshold captures
// genuine frustration/corrections; the model's Neutral bucket (~49% of real
// session messages) keeps the false-positive rate low at this level.

// Score weights — tuned to put real problem conversations in the 60-100 range
// and leave clean ones under 20. Revisit after running on a batch.
const SCORE_WEIGHTS = {
  compactionFirst: 30, // first compaction
  compactionExtra: 25, // every compaction beyond the first
  degradedCtx: 20,
  watchCtx: 8,
  frictionPer: 10,
  frictionCap: 30,
  toolErrorPer: 4,
  toolErrorCap: 20,
  hotFilePer: 3,
  hotFileCap: 15,
  cacheMissCap: 10, // cache waste contribution, scales with waste ratio
};

// ---------------------------------------------------------------------------
// Internal intermediate types (used across analyzeConversation + helpers)
// ---------------------------------------------------------------------------

/** Tool-use record collected per file during the first pass (Signal B). */
interface ToolUseRecord {
  /** 1-indexed assistant turn number. */
  turn: number;
  toolName: string;
  filePath: string;
  input: Record<string, unknown>;
}

/** User text message collected during the first pass (Signals C + E). */
interface UserMessageRecord {
  /** 1-indexed, aligned with sentiment trace messageIndex. */
  userMsgIdx: number;
  text: string;
  timestamp: string;
  offsetPct: number;
}

/** One tool_use entry inside an assistant turn, collected for zone agentContext. */
interface AssistantToolUseInfo {
  toolName: string;
  /** File path for Edit/Write/MultiEdit/NotebookEdit — null for other tools. */
  filePath: string | null;
  /** Bash command snippet for Bash tool — null for non-Bash tools. */
  bashCommand: string | null;
}

/** Condensed record of a single assistant turn, used to build friction zones. */
interface AssistantTurnRecord {
  /** 1-indexed assistant turn counter (same as ToolUseRecord.turn). */
  turn: number;
  timestamp: string;
  toolUses: AssistantToolUseInfo[];
}

/** Record of a real user text message turn, used to build friction zones. */
interface UserTurnRecord {
  /** 1-indexed user message counter, aligned with sentiment trace. */
  userMsgIdx: number;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Deterministic (no-LLM) analysis of a single Claude Code JSONL conversation.
 * Produces the full `ConversationAnalysis` shape: raw metadata, compactions,
 * context health, cache efficiency, friction points, tool stats + errors,
 * hot files, sidechain count, slash commands, 0-100 composite score with
 * rule-based diagnostic + tips.
 *
 * Health zones scale with the detected context window (200k standard,
 * auto-detected 1M when peak usage crosses ~250k). Friction detection uses
 * the session sentiment trace: messages where `label === 'Negative' && score > 0.60`
 * are recorded as friction points (calibrated for bert-nlptown summed probabilities) —
 * sessions without a trace produce empty friction.
 * Cache waste
 * is attributed to `cache_creation_input_tokens` written on turns arriving
 * more than 5 minutes (Anthropic default TTL) after the last assistant reply.
 *
 * Returns `null` when the JSONL file is missing or empty.
 */
export function analyzeConversation(
  providerProjectDir: string,
  sessionId: string,
  projectId: string,
): ConversationAnalysis | null {
  const filePath = join(providerProjectDir, `${sessionId}.jsonl`);

  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }

  const entries: Record<string, unknown>[] = [];
  for (const line of raw.split('\n')) {
    if (!line) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {
      continue;
    }
  }

  if (entries.length === 0) return null;

  // --- Sentiment trace lookup ---
  // `cwd` is NOT on every JSONL entry — leading metadata entries like
  // `{"type":"last-prompt", ...}` have no cwd at all. Walk entries until we
  // find one. Try top-level first, then nested payload (older format). If
  // none exists, fall back gracefully — the session will have no
  // sentiment-derived friction points until the trace is generated.
  let cwd: string | null = null;
  for (const entry of entries) {
    const direct = entry['cwd'] as string | undefined;
    if (direct) {
      cwd = direct;
      break;
    }
    const nested = (entry['payload'] as Record<string, unknown> | undefined)?.['cwd'] as
      | string
      | undefined;
    if (nested) {
      cwd = nested;
      break;
    }
  }
  const sentimentTrace = cwd ? loadSentimentTrace(cwd, sessionId) : null;
  // Map from 1-indexed user-message counter to confidence score.
  const negativeUserIndices = new Map<number, number>();
  if (sentimentTrace) {
    for (const e of sentimentTrace.entries) {
      if (e.label === 'Negative' && e.score > SENTIMENT_FRICTION_THRESHOLD) {
        negativeUserIndices.set(e.messageIndex, e.score);
      }
    }
  }

  // --- Pre-scan: detect dominant cache mode (5m vs 1h beta) ---
  // Claude Code uses the 1h beta cache by default since 2026-04, but we detect
  // per-session to stay honest. The TTL drives `cacheMissTurns` and
  // `wastedCacheTokens` — a 5min hardcoded TTL produces 14× more "false pause"
  // events when the session actually used 1h beta.
  let count1h = 0;
  let count5m = 0;
  for (const entry of entries) {
    if (entry['type'] !== 'assistant') continue;
    const msg = entry['message'] as { usage?: { cache_creation?: Record<string, number> } } | undefined;
    const cc = msg?.usage?.cache_creation;
    if (!cc) continue;
    if ((cc['ephemeral_1h_input_tokens'] ?? 0) > 0) count1h++;
    if ((cc['ephemeral_5m_input_tokens'] ?? 0) > 0) count5m++;
  }
  const cacheMode: '5m' | '1h' = count1h > count5m ? '1h' : '5m';
  const cacheTtlMs = cacheMode === '1h' ? CACHE_TTL_1H_MS : CACHE_TTL_5M_MS;
  const cacheTtlMin = cacheTtlMs / 60_000;

  // First pass: collect ordered timeline of relevant events to compute offsets
  // and build summary / metadata.
  let startedAt = '';
  let lastMessageAt = '';
  let gitBranch: string | null = null;
  let summary = '';
  let messageCount = 0;
  // 1-indexed counter of real user text messages (skips <command-name> messages),
  // aligned with the messageIndex convention used by the sentiment scorer.
  let userMsgCounter = 0;

  const compactions: ConversationCompaction[] = [];
  const frictionPoints: ConversationFrictionPoint[] = [];
  const costSamples: ConversationCostSample[] = [];
  const pausePoints: ConversationPausePoint[] = [];
  let pendingPause: ConversationPausePoint | null = null;
  let cumBilled = 0;
  const toolStats: Record<string, ConversationToolStats> = {};
  const slashCommandSet = new Set<string>();
  const editCounts = new Map<string, number>();

  let totalTokens = 0;
  let cacheReadTokens = 0;
  let cacheCreationTokens = 0;
  let maxContextTokens = 0;
  let cacheMissTurns = 0;
  let wastedCacheTokens = 0;
  let sidechainCount = 0;
  let toolErrorCount = 0;
  const contextSamples: Array<{ offsetPct: number; tokens: number }> = [];

  // Timestamps used to detect cache misses (>5min since last assistant reply).
  let lastAssistantTimestamp: string | null = null;
  // Used for friction point attribution (which tool ran right before user pushed back).
  let lastAssistantToolName: string | null = null;

  // Conversational entries only (skip queue-operation, attachment, etc. for
  // positional offset maths — those aren't what the user perceives).
  const convIndexByUuid = new Map<string, number>();
  let convIndex = 0;
  for (const entry of entries) {
    const type = entry['type'];
    if (type === 'user' || type === 'assistant' || type === 'system') {
      const uuid = entry['uuid'] as string | undefined;
      if (uuid) convIndexByUuid.set(uuid, convIndex);
      convIndex++;
    }
  }
  const totalConvEntries = Math.max(convIndex, 1);

  // Signal B — per-file tool-use history (Edit / Write / MultiEdit).
  const toolUsesByFile = new Map<string, ToolUseRecord[]>();

  // Signal C + E — user messages with text + turn index + timestamp.
  const userMessages: UserMessageRecord[] = [];

  // Friction zones — one AssistantTurnRecord per assistant entry to allow
  // zone construction after the main loop. Parallel tracking of user turns
  // enables the "walk back through consecutive assistant turns" algorithm.
  const assistantTurnRecords: AssistantTurnRecord[] = [];
  // Map from 1-indexed userMsgIdx to the timestamp of that user message.
  const userTurnTimestamps = new Map<number, string>();

  // Turn counter for assistant entries (used in ToolUseRecord).
  let assistantTurnCounter = 0;

  for (const entry of entries) {
    const type = entry['type'] as string | undefined;
    const timestamp = entry['timestamp'] as string | undefined;
    const uuid = entry['uuid'] as string | undefined;
    const entryOffset = uuid && convIndexByUuid.has(uuid)
      ? convIndexByUuid.get(uuid)! / totalConvEntries
      : 0;

    if (timestamp) {
      if (!startedAt) {
        startedAt = timestamp;
      }
      lastMessageAt = timestamp;
    }
    if (!gitBranch && entry['gitBranch']) gitBranch = entry['gitBranch'] as string;

    // --- Compaction boundaries ---------------------------------------------
    if (type === 'system' && entry['subtype'] === 'compact_boundary') {
      const meta = entry['compactMetadata'] as
        | { trigger?: string; preTokens?: number; postTokens?: number }
        | undefined;
      compactions.push({
        timestamp: timestamp ?? '',
        trigger:
          meta?.trigger === 'auto' || meta?.trigger === 'manual'
            ? meta.trigger
            : 'unknown',
        preTokens: meta?.preTokens ?? 0,
        postTokens: meta?.postTokens ?? 0,
        offsetPct: entryOffset,
      });
      continue;
    }

    if (entry['isSidechain']) sidechainCount++;

    // --- User messages ------------------------------------------------------
    if (type === 'user' && !entry['isMeta']) {
      // Skip the synthetic continuation message after a compaction — it's not
      // real user input.
      if (entry['isCompactSummary']) continue;

      const msg = entry['message'] as { content?: unknown } | undefined;
      const textParts: string[] = [];
      const toolResults: { isError: boolean }[] = [];

      if (msg?.content) {
        if (typeof msg.content === 'string') {
          textParts.push(msg.content);
        } else if (Array.isArray(msg.content)) {
          for (const block of msg.content) {
            const b = block as {
              type?: string;
              text?: string;
              is_error?: boolean;
            };
            if (b.type === 'text' && b.text) textParts.push(b.text);
            else if (b.type === 'tool_result') {
              toolResults.push({ isError: Boolean(b.is_error) });
            }
          }
        }
      }

      const text = textParts.join('').trim();

      // Tool errors surface here.
      for (const r of toolResults) {
        if (r.isError) toolErrorCount++;
      }

      // Only *real* user messages count for friction / cache-miss / summary.
      const isRealUserMessage = text.length > 0 && toolResults.length === 0;
      if (!isRealUserMessage) continue;

      messageCount++;

      // First non-command message → summary.
      if (!summary && !text.includes('<command-name>') && !text.includes('<local-command-')) {
        summary = text.slice(0, 200);
      }

      // Slash commands.
      const slashMatch = text.match(/<command-name>([^<]+)<\/command-name>/);
      if (slashMatch) slashCommandSet.add(slashMatch[1].trim());

      // User-message friction — derived from high-confidence Negative sentiment.
      // Mirror the runner's `getConversationMessages()` filter exactly: skip
      // BOTH `<command-name>` and `<local-command-…>` messages so the counter
      // stays in sync with the trace's `messageIndex`.
      if (!text.includes('<command-name>') && !text.includes('<local-command-')) {
        userMsgCounter += 1;
        const score = negativeUserIndices.get(userMsgCounter);
        if (score !== undefined) {
          frictionPoints.push({
            offsetPct: entryOffset,
            timestamp: timestamp ?? '',
            snippet: text.slice(0, 200),
            matchedPattern: `sentiment:${score.toFixed(2)}`,
            precedingTool: lastAssistantToolName,
          });
        }

        // Collect for Signal C (repetition) and Signal E (long-gap + topic change).
        userMessages.push({
          userMsgIdx: userMsgCounter,
          text,
          timestamp: timestamp ?? '',
          offsetPct: entryOffset,
        });

        // Friction zones: record which assistant turn immediately precedes this user message.
        userTurnTimestamps.set(userMsgCounter, timestamp ?? '');
      }

      // Cache miss detection — real user reply arriving > TTL after last
      // assistant reply forces a full cache rewrite on the next turn.
      // We push a PausePoint with wastedTokens=0 (filled in when we encounter
      // the next assistant turn).
      if (lastAssistantTimestamp && timestamp && startedAt) {
        const gapMs = new Date(timestamp).getTime() - new Date(lastAssistantTimestamp).getTime();
        if (gapMs > cacheTtlMs) {
          cacheMissTurns++;
          const tMs = new Date(timestamp).getTime() - new Date(startedAt).getTime();
          const pp: ConversationPausePoint = {
            tMs,
            offsetPct: entryOffset,
            gapMs,
            wastedTokens: 0,
          };
          pausePoints.push(pp);
          pendingPause = pp;
        }
      }

      continue;
    }

    // --- Assistant messages -------------------------------------------------
    if (type === 'assistant') {
      messageCount++;
      assistantTurnCounter++;
      const currentTurn = assistantTurnCounter;
      const msg = entry['message'] as
        | {
            content?: unknown[];
            usage?: {
              input_tokens?: number;
              output_tokens?: number;
              cache_creation_input_tokens?: number;
              cache_read_input_tokens?: number;
            };
          }
        | undefined;

      // Tool use + hot file tracking.
      let turnLastTool: string | null = lastAssistantToolName;
      const turnToolNames: string[] = [];
      const turnToolUseInfos: AssistantToolUseInfo[] = [];
      if (Array.isArray(msg?.content)) {
        for (const block of msg!.content) {
          const b = block as {
            type?: string;
            name?: string;
            input?: Record<string, unknown>;
          };
          if (b.type !== 'tool_use' || !b.name) continue;
          const stats = toolStats[b.name] ?? { count: 0, errorCount: 0 };
          stats.count++;
          toolStats[b.name] = stats;
          turnLastTool = b.name;
          turnToolNames.push(b.name);

          // Collect tool info for friction zone agentContext.
          let toolFilePath: string | null = null;
          let toolBashCmd: string | null = null;

          // Files touched by edit-like tools.
          if (
            b.name === 'Edit' ||
            b.name === 'Write' ||
            b.name === 'MultiEdit' ||
            b.name === 'NotebookEdit'
          ) {
            const path = (b.input?.['file_path'] ?? b.input?.['notebook_path']) as
              | string
              | undefined;
            if (path) {
              toolFilePath = path;
              editCounts.set(path, (editCounts.get(path) ?? 0) + 1);

              // Signal B: record this tool use for backtrack detection.
              if (b.name === 'Edit' || b.name === 'Write' || b.name === 'MultiEdit') {
                const records = toolUsesByFile.get(path) ?? [];
                records.push({ turn: currentTurn, toolName: b.name, filePath: path, input: b.input ?? {} });
                toolUsesByFile.set(path, records);
              }
            }
          } else if (b.name === 'Bash') {
            const cmd = b.input?.['command'] as string | undefined;
            if (cmd) toolBashCmd = cmd.slice(0, 80);
          }

          turnToolUseInfos.push({ toolName: b.name, filePath: toolFilePath, bashCommand: toolBashCmd });
        }
      }
      lastAssistantToolName = turnLastTool;

      // Friction zones: record this assistant turn for later zone construction.
      assistantTurnRecords.push({
        turn: currentTurn,
        timestamp: timestamp ?? '',
        toolUses: turnToolUseInfos,
      });

      // Token accounting from message.usage.
      const usage = msg?.usage as {
        input_tokens?: number;
        output_tokens?: number;
        cache_creation_input_tokens?: number;
        cache_read_input_tokens?: number;
        cache_creation?: {
          ephemeral_5m_input_tokens?: number;
          ephemeral_1h_input_tokens?: number;
        };
      } | undefined;
      if (usage) {
        const input = usage.input_tokens ?? 0;
        const output = usage.output_tokens ?? 0;
        const cacheRead = usage.cache_read_input_tokens ?? 0;
        // Read 5m/1h breakdown when available; fall back to flat field for
        // older format compatibility.
        const cc = usage.cache_creation ?? {};
        let cache5m = cc.ephemeral_5m_input_tokens ?? 0;
        let cache1h = cc.ephemeral_1h_input_tokens ?? 0;
        if (cache5m === 0 && cache1h === 0 && usage.cache_creation_input_tokens) {
          // Format without breakdown: assume 5m (Anthropic default).
          cache5m = usage.cache_creation_input_tokens;
        }
        const cacheCreation = cache5m + cache1h;

        // totalTokens matches what Claude Code reports as "consumed": fresh
        // input + output + cache writes. Cache reads are excluded — they're
        // re-uses of already-paid tokens, not new consumption (and including
        // them would inflate by 50× on a session with heavy cache hits).
        totalTokens += input + output + cacheCreation;
        cacheReadTokens += cacheRead;
        cacheCreationTokens += cacheCreation;

        const ctxOnThisTurn = input + cacheRead + cacheCreation;
        if (ctxOnThisTurn > maxContextTokens) maxContextTokens = ctxOnThisTurn;
        contextSamples.push({ offsetPct: entryOffset, tokens: ctxOnThisTurn });

        // Attribute waste: cache_creation tokens on a turn that came after a
        // > TTL gap is directly avoidable spend. The pendingPause was set in
        // the user-message branch; we close it here and stamp wastedTokens.
        let wastedRewrite = 0;
        if (pendingPause) {
          wastedRewrite = cacheCreation;
          pendingPause.wastedTokens = wastedRewrite;
          pendingPause = null;
          wastedCacheTokens += wastedRewrite;
        }

        // Push a CostSample for this assistant turn — this drives the cost
        // track in the sismograph.
        const billed =
          input * M_INPUT +
          output * M_OUTPUT +
          cacheRead * M_CACHE_READ +
          cache5m * M_CACHE_5M +
          cache1h * M_CACHE_1H;
        cumBilled += billed;
        const tMs =
          startedAt && timestamp
            ? new Date(timestamp).getTime() - new Date(startedAt).getTime()
            : 0;
        costSamples.push({
          tMs,
          offsetPct: entryOffset,
          input,
          output,
          cacheRead,
          cache5m,
          cache1h,
          billed,
          cumBilled,
          wastedRewrite,
          toolNames: turnToolNames,
        });
      }

      if (timestamp) lastAssistantTimestamp = timestamp;
      continue;
    }
  }

  // --- Tool error distribution (attach to specific tools where we can) ---
  // Second pass: tool_result.is_error tracks which *tool_use_id* failed, so we
  // correlate back to tool names. Cheap since we already have all entries.
  // We also build a map from tool_use_id to assistant turn for friction zone error counting.
  const toolNameByUseId = new Map<string, string>();
  // Maps tool_use_id → assistant turn number (1-indexed), for zone error attribution.
  const toolUseTurnById = new Map<string, number>();
  let secondPassAssistantTurn = 0;
  for (const entry of entries) {
    if (entry['type'] !== 'assistant') continue;
    secondPassAssistantTurn++;
    const msg = entry['message'] as { content?: unknown[] } | undefined;
    if (!Array.isArray(msg?.content)) continue;
    for (const block of msg!.content) {
      const b = block as { type?: string; id?: string; name?: string };
      if (b.type === 'tool_use' && b.id && b.name) {
        toolNameByUseId.set(b.id, b.name);
        toolUseTurnById.set(b.id, secondPassAssistantTurn);
      }
    }
  }
  // Set of tool_use_ids that had errors — used by buildFrictionZones to count
  // errors per assistant turn.
  const erroredToolUseIds = new Set<string>();
  for (const entry of entries) {
    if (entry['type'] !== 'user') continue;
    const msg = entry['message'] as { content?: unknown } | undefined;
    if (!Array.isArray(msg?.content)) continue;
    for (const block of msg!.content) {
      const b = block as { type?: string; tool_use_id?: string; is_error?: boolean; content?: unknown };
      if (b.type !== 'tool_result' || !b.tool_use_id) continue;

      // Detect errors via is_error flag or string content heuristics.
      let isError = Boolean(b.is_error);
      if (!isError && typeof b.content === 'string') {
        const c = b.content as string;
        if (c.startsWith('Error:') || c.startsWith('<tool_use_error>')) isError = true;
      } else if (!isError && Array.isArray(b.content)) {
        for (const part of b.content as Array<{ type?: string; text?: string }>) {
          if (part.type === 'text' && part.text) {
            if (part.text.startsWith('Error:') || part.text.startsWith('<tool_use_error>')) {
              isError = true;
              break;
            }
          }
        }
      }

      if (isError) erroredToolUseIds.add(b.tool_use_id);

      if (!b.is_error || !b.tool_use_id) continue;
      const name = toolNameByUseId.get(b.tool_use_id);
      if (!name) continue;
      const stats = toolStats[name] ?? { count: 0, errorCount: 0 };
      stats.errorCount++;
      toolStats[name] = stats;
    }
  }

  // --- Derived / summary fields -----------------------------------------
  if (!startedAt) startedAt = entries[0]?.['timestamp'] as string || '';
  if (!lastMessageAt) lastMessageAt = startedAt;
  const durationMs = startedAt && lastMessageAt
    ? Math.max(0, new Date(lastMessageAt).getTime() - new Date(startedAt).getTime())
    : 0;

  const hotFiles: ConversationHotFile[] = Array.from(editCounts.entries())
    .filter(([, n]) => n >= 3)
    .map(([path, editCount]) => ({ path, editCount }))
    .sort((a, b) => b.editCount - a.editCount);

  // --- Context window + zones (fraction of effective window) ---
  const peakObserved = Math.max(
    maxContextTokens,
    ...compactions.map((c) => c.preTokens),
    0,
  );
  const contextWindow =
    peakObserved > EXTENDED_WINDOW_TRIGGER ? EXTENDED_WINDOW : STANDARD_WINDOW;
  const ctxFraction = contextWindow > 0 ? maxContextTokens / contextWindow : 0;

  const healthZone: ConversationHealthZone =
    ctxFraction > WATCH_ZONE_PCT
      ? 'degraded'
      : ctxFraction > HEALTHY_ZONE_PCT
        ? 'watch'
        : 'healthy';

  // --- Score (100 = healthy, 0 = critical — subtract penalties) ---
  let penalty = 0;
  if (compactions.length >= 1) penalty += SCORE_WEIGHTS.compactionFirst;
  if (compactions.length >= 2) {
    penalty += SCORE_WEIGHTS.compactionExtra * (compactions.length - 1);
  }
  if (healthZone === 'degraded') penalty += SCORE_WEIGHTS.degradedCtx;
  else if (healthZone === 'watch') penalty += SCORE_WEIGHTS.watchCtx;

  penalty += Math.min(
    frictionPoints.length * SCORE_WEIGHTS.frictionPer,
    SCORE_WEIGHTS.frictionCap,
  );
  penalty += Math.min(
    toolErrorCount * SCORE_WEIGHTS.toolErrorPer,
    SCORE_WEIGHTS.toolErrorCap,
  );
  penalty += Math.min(hotFiles.length * SCORE_WEIGHTS.hotFilePer, SCORE_WEIGHTS.hotFileCap);

  // Cache waste: scale by share of total cache tokens written wastefully.
  if (cacheCreationTokens > 0 && wastedCacheTokens > 0) {
    const wasteRatio = wastedCacheTokens / cacheCreationTokens;
    penalty += Math.round(wasteRatio * SCORE_WEIGHTS.cacheMissCap);
  }

  const score = Math.max(0, Math.min(100, Math.round(100 - penalty)));

  // --- Signal B: backtrack detection ----------------------------------------
  const backtracks = detectBacktracks(toolUsesByFile);
  for (const fp of backtracks) frictionPoints.push(fp);

  // --- Signal C: user-message repetition detection --------------------------
  const repetitions = detectRepetitions(userMessages);
  for (const fp of repetitions) frictionPoints.push(fp);

  // Sort friction points by position in conversation for consistent ordering.
  frictionPoints.sort((a, b) => a.offsetPct - b.offsetPct);

  // --- Friction zones — build after all frictionPoints are collected ---------
  const frictionZones = buildFrictionZones({
    sessionId,
    frictionPoints,
    assistantTurnRecords,
    userMessages,
    toolUsesByFile,
    toolUseTurnById,
    erroredToolUseIds,
  });

  // --- Signal E: long-gap + topic change detection ---------------------------
  const gapTips = detectLongGapTopicChanges(userMessages);

  const diagnostic = buildDiagnostic({
    compactions,
    healthZone,
    maxContextTokens,
    frictionPoints,
    toolErrorCount,
    hotFiles,
    cacheMissTurns,
    wastedCacheTokens,
    cacheTtlMin,
  });

  const tips = buildTips({
    compactions,
    healthZone,
    maxContextTokens,
    contextWindow,
    frictionPoints,
    toolStats,
    toolErrorCount,
    hotFiles,
    cacheMissTurns,
    wastedCacheTokens,
    cacheTtlMin,
    durationMs,
    slashCommands: Array.from(slashCommandSet),
    sidechainCount,
    extraTips: gapTips,
  });

  return {
    sessionId,
    projectId,
    startedAt,
    lastMessageAt,
    durationMs,
    messageCount,
    summary: summary || '(no summary)',
    gitBranch,

    compactions,
    totalTokens,
    maxContextTokens,
    contextWindow,
    healthZone,
    contextSamples,

    cacheMode,
    cacheTtlMin,
    cacheReadTokens,
    cacheCreationTokens,
    cacheMissTurns,
    wastedCacheTokens,

    costSamples,
    pausePoints,

    frictionPoints,
    frictionZones,

    toolStats,
    toolErrorCount,

    hotFiles,

    sidechainCount,
    slashCommands: Array.from(slashCommandSet),

    score,
    diagnostic,
    tips,
  };
}

// ---------------------------------------------------------------------------
// Diagnostic generator — cheap, rule-based. No LLM.
// ---------------------------------------------------------------------------

function buildDiagnostic(args: {
  compactions: ConversationCompaction[];
  healthZone: ConversationHealthZone;
  maxContextTokens: number;
  frictionPoints: ConversationFrictionPoint[];
  toolErrorCount: number;
  hotFiles: ConversationHotFile[];
  cacheMissTurns: number;
  wastedCacheTokens: number;
  cacheTtlMin: number;
}): string {
  const parts: string[] = [];

  if (args.compactions.length >= 2) {
    parts.push(
      `${args.compactions.length} compactions — contexte reconstruit plusieurs fois, perte sémantique probable`,
    );
  } else if (args.compactions.length === 1) {
    parts.push('1 compaction — le modèle raisonne sur un résumé après ce point');
  }

  if (args.healthZone === 'degraded') {
    const k = Math.round(args.maxContextTokens / 1000);
    parts.push(`contexte max ${k}k tokens (zone "lost in the middle")`);
  } else if (args.healthZone === 'watch' && args.compactions.length === 0) {
    const k = Math.round(args.maxContextTokens / 1000);
    parts.push(`contexte max ${k}k tokens — dégradation qui démarre`);
  }

  // Late friction is the strongest signal of contextual degradation.
  const lateFriction = args.frictionPoints.filter((f) => f.offsetPct > 0.5).length;
  if (lateFriction >= 2) {
    parts.push(
      `${lateFriction} frictions utilisateur dans la 2e moitié — dégradation probable plutôt que skill manquant`,
    );
  } else if (args.frictionPoints.length >= 2) {
    parts.push(`${args.frictionPoints.length} frictions utilisateur détectées`);
  }

  if (args.toolErrorCount >= 5) {
    parts.push(`${args.toolErrorCount} erreurs outils — boucle possible`);
  }

  if (args.hotFiles.length >= 1) {
    const top = args.hotFiles[0];
    parts.push(`tâtonnement sur ${top.path.split('/').pop()} (×${top.editCount})`);
  }

  if (args.cacheMissTurns >= 3) {
    const kWaste = Math.round(args.wastedCacheTokens / 1000);
    parts.push(
      `${args.cacheMissTurns} reprises > ${args.cacheTtlMin}min, ~${kWaste}k tokens de cache rewrite évitables`,
    );
  }

  if (parts.length === 0) return 'Conversation saine — pas de signal notable';

  return parts.join(' · ');
}

// ---------------------------------------------------------------------------
// Tip generator — rules-based, language-neutral (emits ids + data for i18n).
// Rules are ordered by severity inside each category so the UI can show the
// most actionable advice first.
// ---------------------------------------------------------------------------

function buildTips(args: {
  compactions: ConversationCompaction[];
  healthZone: ConversationHealthZone;
  maxContextTokens: number;
  contextWindow: number;
  frictionPoints: ConversationFrictionPoint[];
  toolStats: Record<string, ConversationToolStats>;
  toolErrorCount: number;
  hotFiles: ConversationHotFile[];
  cacheMissTurns: number;
  wastedCacheTokens: number;
  cacheTtlMin: number;
  durationMs: number;
  slashCommands: string[];
  sidechainCount: number;
  extraTips: ConversationTip[];
}): ConversationTip[] {
  const tips: ConversationTip[] = [];
  const ctxPct = Math.round((args.maxContextTokens / args.contextWindow) * 100);
  const wastedK = Math.round(args.wastedCacheTokens / 1000);

  // --- Context management ------------------------------------------------
  if (args.compactions.length >= 2) {
    // Compaction cost estimate: each compaction wrote a fresh prompt prefix
    // covering preTokens worth of context. The marginal cost over a session
    // that didn't need to be split is roughly preTokens × cache_create_5m
    // multiplier (assuming 5m default; we don't know the per-compaction TTL).
    const compactionCostTokens = args.compactions.reduce(
      (sum, c) => sum + (c.preTokens || 0),
      0,
    );
    tips.push({
      id: 'split-sessions',
      category: 'context',
      severity: 'critical',
      data: { count: args.compactions.length, economyTokens: compactionCostTokens },
    });
  } else if (args.compactions.length === 1) {
    tips.push({
      id: 'restate-after-compaction',
      category: 'context',
      severity: 'warning',
      data: {},
    });
  } else if (args.healthZone === 'degraded') {
    tips.push({
      id: 'clear-before-degraded',
      category: 'context',
      severity: 'warning',
      data: { ctxPct },
    });
  } else if (args.healthZone === 'watch') {
    tips.push({
      id: 'watch-context-growth',
      category: 'context',
      severity: 'info',
      data: { ctxPct },
    });
  }

  // --- Cache efficiency --------------------------------------------------
  // Both tips are user-actionable: split before pause / keep session continuous.
  // We do NOT suggest "enable 1h cache" because it's an API setting Claude Code
  // controls internally — not something the user can toggle.
  if (args.wastedCacheTokens >= 500_000) {
    tips.push({
      id: 'split-before-long-pause',
      category: 'cache',
      severity: 'warning',
      data: {
        cacheMisses: args.cacheMissTurns,
        wastedK,
        ttlMin: args.cacheTtlMin,
        economyTokens: args.wastedCacheTokens,
      },
    });
  } else if (args.cacheMissTurns >= 5) {
    tips.push({
      id: 'keep-session-continuous',
      category: 'cache',
      severity: 'info',
      data: {
        cacheMisses: args.cacheMissTurns,
        wastedK,
        ttlMin: args.cacheTtlMin,
        economyTokens: args.wastedCacheTokens,
      },
    });
  }

  // --- Friction / intent drift ------------------------------------------
  const lateFriction = args.frictionPoints.filter((f) => f.offsetPct > 0.5).length;
  if (lateFriction >= 2 && args.healthZone !== 'healthy') {
    tips.push({
      id: 'restate-intent-mid',
      category: 'friction',
      severity: 'warning',
      data: { count: lateFriction },
    });
  } else if (args.frictionPoints.length >= 3) {
    tips.push({
      id: 'frequent-corrections',
      category: 'friction',
      severity: 'info',
      data: { count: args.frictionPoints.length },
    });
  }

  // --- Tools -------------------------------------------------------------
  const worstTool = Object.entries(args.toolStats)
    .filter(([, s]) => s.errorCount >= 3)
    .sort((a, b) => b[1].errorCount - a[1].errorCount)[0];
  if (worstTool) {
    tips.push({
      id: 'flaky-tool',
      category: 'tools',
      severity: worstTool[1].errorCount >= 5 ? 'warning' : 'info',
      data: { tool: worstTool[0], errors: worstTool[1].errorCount },
    });
  }

  // --- Workflow / decomposition ----------------------------------------
  const hottest = args.hotFiles[0];
  if (hottest && hottest.editCount >= 15) {
    tips.push({
      id: 'decompose-heavy-file',
      category: 'workflow',
      severity: 'info',
      data: { file: shortenFile(hottest.path), count: hottest.editCount },
    });
  }

  if (
    args.sidechainCount === 0 &&
    args.maxContextTokens > args.contextWindow * 0.5 &&
    Object.values(args.toolStats).some((s) => s.count >= 30)
  ) {
    tips.push({
      id: 'delegate-exploration',
      category: 'workflow',
      severity: 'info',
      data: {},
    });
  }

  // --- Skills gap -------------------------------------------------------
  const durationMin = args.durationMs / 60_000;
  if (args.slashCommands.length === 0 && durationMin >= 45 && args.frictionPoints.length >= 2) {
    tips.push({
      id: 'consider-custom-skill',
      category: 'skills',
      severity: 'info',
      data: { durationMin: Math.round(durationMin) },
    });
  }

  // Append signal-E tips (long-gap + topic change) before sorting.
  for (const t of args.extraTips) tips.push(t);

  // Sort by economy potential first (descending tokens economisable), then by
  // severity. Tips without an `economyTokens` data field fall to the bottom of
  // their severity bucket.
  const weight = { critical: 0, warning: 1, info: 2 } as const;
  tips.sort((a, b) => {
    const ea = typeof a.data['economyTokens'] === 'number' ? (a.data['economyTokens'] as number) : 0;
    const eb = typeof b.data['economyTokens'] === 'number' ? (b.data['economyTokens'] as number) : 0;
    if (ea !== eb) return eb - ea;
    return weight[a.severity] - weight[b.severity];
  });

  // Cap — too many tips is noise, first 5 is actionable.
  return tips.slice(0, 5);
}

function shortenFile(path: string): string {
  const parts = path.split('/').filter(Boolean);
  return parts.length <= 2 ? path : parts.slice(-2).join('/');
}

// ---------------------------------------------------------------------------
// Signal B — backtrack detection
// ---------------------------------------------------------------------------

/**
 * Normalizes a string for backtrack comparison: trims leading/trailing
 * whitespace and collapses internal runs of whitespace to a single space.
 */
function normalizeForBacktrack(s: string): string {
  return s.trim().replace(/\s+/g, ' ');
}

/**
 * Detects agent backtracks: cases where an Edit/Write/MultiEdit on file F
 * at turn N reverts content that the agent itself produced at an earlier turn
 * (i.e. `current.new_string` matches a prior `old_string` after normalization).
 *
 * Emits one {@link ConversationFrictionPoint} per confirmed backtrack, at the
 * position of the LATER edit. `matchedPattern` format:
 * `'backtrack:<file_basename>:T<earlier_turn>->T<later_turn>'`.
 *
 * Min-length guard: strings shorter than 20 chars after normalization are
 * skipped (too generic — high false-positive risk). Fuzzy matching is out of
 * scope (V1).
 */
function detectBacktracks(
  toolUsesByFile: Map<string, ToolUseRecord[]>,
): ConversationFrictionPoint[] {
  const MIN_LEN = 20;
  const results: ConversationFrictionPoint[] = [];

  for (const [filePath, records] of toolUsesByFile) {
    // Accumulate prior strings as we scan forward.
    // We track {turn, normalized string} for each old_string / content seen.
    const priorStrings: Array<{ turn: number; value: string }> = [];

    for (let i = 0; i < records.length; i++) {
      const rec = records[i];

      // Collect the "new_string" candidates for the current op.
      const newStrings: Array<{ value: string }> = [];

      if (rec.toolName === 'Edit') {
        const ns = rec.input['new_string'] as string | undefined;
        if (ns) newStrings.push({ value: ns });
      } else if (rec.toolName === 'Write') {
        const content = rec.input['content'] as string | undefined;
        if (content) newStrings.push({ value: content });
      } else if (rec.toolName === 'MultiEdit') {
        const edits = rec.input['edits'] as Array<{ old_string?: string; new_string?: string }> | undefined;
        if (Array.isArray(edits)) {
          for (const e of edits) {
            if (e.new_string) newStrings.push({ value: e.new_string });
          }
        }
      }

      // Check each new_string against all prior old_strings.
      for (const { value: rawNew } of newStrings) {
        const normNew = normalizeForBacktrack(rawNew);
        if (normNew.length < MIN_LEN) continue;

        for (const prior of priorStrings) {
          if (prior.value.length < MIN_LEN) continue;
          if (normNew === prior.value) {
            results.push({
              offsetPct: 0, // Will be patched below if we track offsetPct per record.
              timestamp: '',
              snippet: rawNew.slice(0, 200),
              matchedPattern: `backtrack:${basename(filePath)}:T${prior.turn}->T${rec.turn}`,
              precedingTool: rec.toolName,
            });
            // Only flag once per new_string (first match is sufficient).
            break;
          }
        }
      }

      // Add the old_string(s) of the current op to priorStrings for future comparisons.
      if (rec.toolName === 'Edit') {
        const os = rec.input['old_string'] as string | undefined;
        if (os) priorStrings.push({ turn: rec.turn, value: normalizeForBacktrack(os) });
        // Also add new_string — a future edit could revert back to it.
        const ns = rec.input['new_string'] as string | undefined;
        if (ns) priorStrings.push({ turn: rec.turn, value: normalizeForBacktrack(ns) });
      } else if (rec.toolName === 'Write') {
        const content = rec.input['content'] as string | undefined;
        if (content) priorStrings.push({ turn: rec.turn, value: normalizeForBacktrack(content) });
      } else if (rec.toolName === 'MultiEdit') {
        const edits = rec.input['edits'] as Array<{ old_string?: string; new_string?: string }> | undefined;
        if (Array.isArray(edits)) {
          for (const e of edits) {
            if (e.old_string) priorStrings.push({ turn: rec.turn, value: normalizeForBacktrack(e.old_string) });
            if (e.new_string) priorStrings.push({ turn: rec.turn, value: normalizeForBacktrack(e.new_string) });
          }
        }
      }
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Friction zones — richer span view built from frictionPoints
// ---------------------------------------------------------------------------

/**
 * Builds {@link ConversationFrictionZone} records from the flat `frictionPoints`
 * array by walking back through the assistant turns that preceded each user
 * reaction. Each zone spans from the first assistant turn after the previous
 * user message to the user-reaction turn and carries an `agentContext`
 * summarising what the agent did in that span.
 *
 * Rules:
 * - `sentiment:*` and `repetition:*` frictionPoints always produce a zone.
 * - `backtrack:*` frictionPoints produce a zone only when there is no
 *   user-reaction friction within the next 5 user messages; otherwise they
 *   are absorbed into the downstream zone's `backtrackedFiles`.
 * - Severity: `high` when both user reaction and ≥1 backtrack or ≥2 errors;
 *   `medium` for plain user reaction; `low` for standalone backtrack zones.
 */
function buildFrictionZones(args: {
  sessionId: string;
  frictionPoints: ConversationFrictionPoint[];
  assistantTurnRecords: AssistantTurnRecord[];
  userMessages: UserMessageRecord[];
  toolUsesByFile: Map<string, ToolUseRecord[]>;
  toolUseTurnById: Map<string, number>;
  erroredToolUseIds: Set<string>;
}): ConversationFrictionZone[] {
  const {
    sessionId,
    frictionPoints,
    assistantTurnRecords,
    userMessages,
    toolUsesByFile,
    toolUseTurnById,
    erroredToolUseIds,
  } = args;

  // Build an index: assistantTurn → AssistantTurnRecord for fast lookup.
  const assistantByTurn = new Map<number, AssistantTurnRecord>();
  for (const rec of assistantTurnRecords) assistantByTurn.set(rec.turn, rec);

  // Build an index: userMsgIdx → userMessages position for fast lookup.
  const userMsgByIdx = new Map<number, UserMessageRecord>();
  for (const um of userMessages) userMsgByIdx.set(um.userMsgIdx, um);

  // Identify user-reaction frictionPoints (sentiment or repetition).
  // We need their userMsgIdx to do the "next N user turns" absorption check.
  // We derive userMsgIdx from the userMessages array by matching on timestamp + snippet.
  const userReactionIndices = new Set<number>();
  for (const fp of frictionPoints) {
    if (fp.matchedPattern.startsWith('sentiment:') || fp.matchedPattern.startsWith('repetition:')) {
      // Find the matching userMsgIdx by timestamp + snippet prefix.
      for (const um of userMessages) {
        if (um.timestamp === fp.timestamp && fp.snippet.startsWith(um.text.slice(0, 30))) {
          userReactionIndices.add(um.userMsgIdx);
          break;
        }
        // Fallback: match by snippet content if timestamp is empty.
        if (!fp.timestamp && um.text.startsWith(fp.snippet.slice(0, 30))) {
          userReactionIndices.add(um.userMsgIdx);
          break;
        }
      }
    }
  }

  // Build a set of backtrack turn numbers from frictionPoints.
  // Pattern: 'backtrack:<basename>:T<earlier>->T<later>'
  // Maps later turn → file basename for cross-referencing.
  const backtrackedTurnToBasename = new Map<number, string>();
  for (const fp of frictionPoints) {
    const m = fp.matchedPattern.match(/^backtrack:(.+):T\d+->T(\d+)$/);
    if (m) {
      const laterTurn = parseInt(m[2], 10);
      backtrackedTurnToBasename.set(laterTurn, m[1]);
    }
  }

  const zones: ConversationFrictionZone[] = [];

  // Process each frictionPoint in order.
  for (const fp of frictionPoints) {
    const isUserReaction =
      fp.matchedPattern.startsWith('sentiment:') ||
      fp.matchedPattern.startsWith('repetition:');
    const isBacktrack = fp.matchedPattern.startsWith('backtrack:');

    if (!isUserReaction && !isBacktrack) continue;

    // For backtrack frictionPoints, check if there's a user-reaction friction
    // within the next 5 user messages — if so, skip (will be absorbed).
    if (isBacktrack) {
      const btMatch = fp.matchedPattern.match(/^backtrack:.+:T\d+->T(\d+)$/);
      const laterTurn = btMatch ? parseInt(btMatch[1], 10) : -1;

      // Find which userMsgIdx comes just after this backtrack turn.
      let afterUserMsgIdx = -1;
      for (const um of userMessages) {
        // The backtrack is in an assistant turn; find the first user message
        // that comes after assistantTurnRecords[laterTurn].
        const aRec = assistantByTurn.get(laterTurn);
        if (aRec && um.timestamp > aRec.timestamp) {
          afterUserMsgIdx = um.userMsgIdx;
          break;
        }
      }

      if (afterUserMsgIdx >= 0) {
        // Check if any of the next 5 user messages is a user-reaction friction.
        let hasDownstreamReaction = false;
        for (let idx = afterUserMsgIdx; idx <= afterUserMsgIdx + 5; idx++) {
          if (userReactionIndices.has(idx)) {
            hasDownstreamReaction = true;
            break;
          }
        }
        if (hasDownstreamReaction) continue; // Absorbed into the downstream zone.
      }
    }

    // Find the userMsgIdx for this frictionPoint.
    let reactionUserMsgIdx = -1;
    let reactionTimestamp = fp.timestamp;

    if (isUserReaction) {
      for (const um of userMessages) {
        if (um.timestamp === fp.timestamp && fp.snippet.startsWith(um.text.slice(0, 30))) {
          reactionUserMsgIdx = um.userMsgIdx;
          break;
        }
        if (!fp.timestamp && um.text.startsWith(fp.snippet.slice(0, 30))) {
          reactionUserMsgIdx = um.userMsgIdx;
          reactionTimestamp = um.timestamp;
          break;
        }
      }
    } else {
      // Backtrack zone: the "reaction" is the backtrack itself, no real user message.
      // Use a synthetic userMsgIdx of -1 and the fp timestamp.
      reactionUserMsgIdx = -1;
    }

    // Determine the endTurn (in terms of assistant turns): the last assistant
    // turn before the reaction. For a backtrack zone, it's the backtrack turn itself.
    let endTurn: number;
    let endTimestamp = reactionTimestamp;

    if (isBacktrack) {
      const btMatch = fp.matchedPattern.match(/^backtrack:.+:T\d+->T(\d+)$/);
      endTurn = btMatch ? parseInt(btMatch[1], 10) : 0;
      const aRec = assistantByTurn.get(endTurn);
      if (aRec) endTimestamp = aRec.timestamp;
    } else {
      // Find the last assistant turn that precedes the reaction user message.
      // The reaction's userMsgIdx is reactionUserMsgIdx.
      const prevUserMsg = reactionUserMsgIdx > 1
        ? userMsgByIdx.get(reactionUserMsgIdx - 1)
        : null;

      // endTurn = the last assistant turn with timestamp <= reactionTimestamp.
      endTurn = 0;
      for (const aRec of assistantTurnRecords) {
        if (!reactionTimestamp || aRec.timestamp <= reactionTimestamp) {
          if (aRec.turn > endTurn) endTurn = aRec.turn;
        }
      }
      if (endTurn === 0 && assistantTurnRecords.length > 0) {
        endTurn = assistantTurnRecords[assistantTurnRecords.length - 1].turn;
      }
    }

    // Determine startTurn: walk backward from endTurn through CONSECUTIVE
    // assistant turns (i.e. no user message in between). The first assistant
    // turn after the previous user message is the start.
    //
    // Strategy: find the timestamp of the previous user message, then
    // find the first assistant turn whose timestamp is after that boundary.
    let startTurn = endTurn;
    let startTimestamp = endTimestamp;

    // Find the previous user message to establish the lower bound.
    const prevUserMsgRec = isUserReaction && reactionUserMsgIdx > 1
      ? userMsgByIdx.get(reactionUserMsgIdx - 1)
      : null;
    const lowerBound = prevUserMsgRec?.timestamp ?? '';

    // Walk from endTurn backward to find the lowest consecutive assistant turn
    // that comes after lowerBound (no user message gap in between).
    if (endTurn > 0) {
      for (let t = endTurn; t >= 1; t--) {
        const aRec = assistantByTurn.get(t);
        if (!aRec) break; // Gap in assistant turns = stop.

        if (lowerBound && aRec.timestamp <= lowerBound) break; // Before previous user message.

        startTurn = t;
        startTimestamp = aRec.timestamp;
      }
    }

    // Compute agentContext for turns [startTurn, endTurn].
    const filesTouchedSet: string[] = [];
    const filesTouchedSeen = new Set<string>();
    let toolCallsCount = 0;
    let toolErrorsCount = 0;
    const toolErrorsByName = new Map<string, number>();
    const editCountsByFile = new Map<string, number>();

    for (let t = startTurn; t <= endTurn; t++) {
      const aRec = assistantByTurn.get(t);
      if (!aRec) continue;

      toolCallsCount += aRec.toolUses.length;

      for (const tu of aRec.toolUses) {
        if (tu.filePath && !filesTouchedSeen.has(tu.filePath)) {
          filesTouchedSeen.add(tu.filePath);
          filesTouchedSet.push(tu.filePath);
        }
        if (tu.filePath && (tu.toolName === 'Edit' || tu.toolName === 'Write' || tu.toolName === 'MultiEdit')) {
          editCountsByFile.set(tu.filePath, (editCountsByFile.get(tu.filePath) ?? 0) + 1);
        }
      }
    }

    // Count errors: iterate erroredToolUseIds and check their turn falls in [startTurn, endTurn].
    for (const toolUseId of erroredToolUseIds) {
      const turn = toolUseTurnById.get(toolUseId);
      if (turn !== undefined && turn >= startTurn && turn <= endTurn) {
        toolErrorsCount++;
        // Find the tool name for this error.
        // We look at assistantTurnRecords for the tool name.
        const aRec = assistantByTurn.get(turn);
        if (aRec) {
          // Match by position: the tool_use_id ordering is sequential within a turn.
          // We can't easily map id → toolName here without rebuilding the full map.
          // Use the toolName from toolNameByUseId if available (not directly accessible here).
          // Approximate: just track errors per tool name via a count.
          // We'll use a simple tally by turn.
        }
      }
    }

    // Count errors per tool name within the zone using toolUseTurnById + erroredToolUseIds.
    // We need toolNameByUseId which is not passed here — approximate via assistantTurnRecords.
    // For keyActions, we just track "failed ×N" per tool name.
    // Re-derive: for each errored tool_use_id, find the turn, find the AssistantTurnRecord,
    // and infer the tool name by matching error counts with tool use order in that turn.
    // This is an approximation (same tool called multiple times per turn).
    // Simpler: just track "tool had error in this zone" per turn and report the tool names.
    for (const toolUseId of erroredToolUseIds) {
      const turn = toolUseTurnById.get(toolUseId);
      if (turn !== undefined && turn >= startTurn && turn <= endTurn) {
        // Find the tool name from the assistantTurnRecord.
        // The toolUseTurnById maps tool_use_id → assistant turn, and the
        // AssistantTurnRecord has toolUses in order. We can't easily match by id
        // here, so we note an error happened but skip per-tool attribution.
        // toolErrorsCount already counted above; just populate toolErrorsByName
        // with a "Unknown" key as fallback for keyActions.
        // Actually we have the toolNameByUseId data — but it's not passed to
        // this function. Pass it via args if needed.
        // For now: track "error" generically.
        toolErrorsByName.set('(error)', (toolErrorsByName.get('(error)') ?? 0) + 1);
      }
    }

    // backtrackedFiles: files where a backtrack was detected within [startTurn, endTurn].
    const backtrackedFiles: string[] = [];
    for (const [laterTurn, basename_] of backtrackedTurnToBasename) {
      if (laterTurn >= startTurn && laterTurn <= endTurn) {
        // Find the full path by matching basename against filesTouched.
        const fullPath = filesTouchedSet.find((p) => p.endsWith('/' + basename_) || p === basename_);
        if (fullPath && !backtrackedFiles.includes(fullPath)) {
          backtrackedFiles.push(fullPath);
        } else if (!fullPath) {
          backtrackedFiles.push(basename_); // Fallback to basename.
        }
      }
    }

    // keyActions: up to 5 labels in priority order.
    // 1. "<ToolName> failed ×<n>" for tools with errors.
    // 2. "Edit <basename> ×<n>" for files edited ≥ 2 times.
    // 3. "<ToolName>" for notable single calls (Read, Bash with command).
    const keyActions: string[] = [];

    // Priority 1: errored tools.
    if (toolErrorsCount > 0) {
      // Approximate: group errors by tool name within the zone.
      // We need to look up tool names for errored tool_use_ids within the zone range.
      // Since toolNameByUseId is not passed here, we collect tool names from
      // assistantTurnRecords when an error occurred on that turn.
      const errorToolCounts = new Map<string, number>();
      for (const toolUseId of erroredToolUseIds) {
        const turn = toolUseTurnById.get(toolUseId);
        if (turn !== undefined && turn >= startTurn && turn <= endTurn) {
          // Find tool name from AssistantTurnRecord: we scan toolUses by order.
          // This is an approximation since we don't have the id stored in toolUses.
          const aRec = assistantByTurn.get(turn);
          if (aRec && aRec.toolUses.length > 0) {
            // Use the last tool name in the turn as the error source (common pattern).
            const lastName = aRec.toolUses[aRec.toolUses.length - 1].toolName;
            errorToolCounts.set(lastName, (errorToolCounts.get(lastName) ?? 0) + 1);
          }
        }
      }
      for (const [toolName, count] of errorToolCounts) {
        if (keyActions.length >= 5) break;
        keyActions.push(`${toolName} failed ×${count}`);
      }
    }

    // Priority 2: high-count edits.
    const sortedEdits = Array.from(editCountsByFile.entries())
      .filter(([, c]) => c >= 2)
      .sort((a, b) => b[1] - a[1]);
    for (const [filePath, count] of sortedEdits) {
      if (keyActions.length >= 5) break;
      const bn = filePath.split('/').pop() ?? filePath;
      keyActions.push(`Edit ${bn} ×${count}`);
    }

    // Priority 3: notable single tool calls (Bash, Read, WebFetch).
    if (keyActions.length < 5) {
      const notableTools = new Set(['Bash', 'Read', 'WebFetch', 'WebSearch']);
      const seenNotable = new Set<string>();
      for (let t = startTurn; t <= endTurn && keyActions.length < 5; t++) {
        const aRec = assistantByTurn.get(t);
        if (!aRec) continue;
        for (const tu of aRec.toolUses) {
          if (!notableTools.has(tu.toolName)) continue;
          if (seenNotable.has(tu.toolName)) continue;
          seenNotable.add(tu.toolName);
          if (tu.toolName === 'Bash' && tu.bashCommand) {
            keyActions.push(`Bash: ${tu.bashCommand.slice(0, 40)}`);
          } else {
            keyActions.push(tu.toolName);
          }
          if (keyActions.length >= 5) break;
        }
      }
    }

    // Severity.
    const severity: ConversationFrictionZone['severity'] = isBacktrack && !isUserReaction
      ? 'low'
      : (backtrackedFiles.length >= 1 || toolErrorsCount >= 2)
        ? 'high'
        : 'medium';

    const reactionKind = fp.matchedPattern.split(':')[0];
    // Append zone index to guarantee uniqueness even if two reactions land on the same endTurn.
    const zoneId = `${sessionId}:${endTurn}:${reactionKind}:${zones.length}`;

    zones.push({
      id: zoneId,
      startTurn,
      endTurn,
      startTimestamp,
      endTimestamp,
      reactionPoint: fp,
      agentContext: {
        filesTouched: filesTouchedSet,
        toolCallsCount,
        toolErrorsCount,
        backtrackedFiles,
        keyActions,
      },
      severity,
    });
  }

  return zones;
}

// ---------------------------------------------------------------------------
// Signal C — user message repetition detection
// ---------------------------------------------------------------------------

/**
 * Tokenizes a string for Jaccard similarity: lowercase, split on non-word
 * characters, drop tokens shorter than 3 chars.
 */
function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/\W+/)
      .filter((t) => t.length >= 3),
  );
}

/**
 * Computes Jaccard similarity between two token sets: |A ∩ B| / |A ∪ B|.
 * Returns 0 if the union is empty.
 */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) {
    if (b.has(t)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Detects repeated user messages: when a user message has Jaccard similarity
 * > 0.5 with any of the previous 5 user messages (on 3+-char lowercased tokens).
 *
 * Emits one {@link ConversationFrictionPoint} per detected repetition.
 * `matchedPattern` format: `'repetition:T<previous_userMsgIdx>:<jaccard.toFixed(2)>'`.
 *
 * Skips pairs where either message has fewer than 3 unique tokens.
 */
function detectRepetitions(userMessages: UserMessageRecord[]): ConversationFrictionPoint[] {
  const JACCARD_THRESHOLD = 0.5;
  const WINDOW = 5;
  const results: ConversationFrictionPoint[] = [];

  for (let i = 1; i < userMessages.length; i++) {
    const curr = userMessages[i];
    const currTokens = tokenize(curr.text);
    if (currTokens.size < 3) continue;

    const start = Math.max(0, i - WINDOW);
    let bestJaccard = 0;
    let bestPrevIdx = -1;

    for (let j = start; j < i; j++) {
      const prev = userMessages[j];
      const prevTokens = tokenize(prev.text);
      if (prevTokens.size < 3) continue;

      const sim = jaccard(currTokens, prevTokens);
      if (sim > JACCARD_THRESHOLD && sim > bestJaccard) {
        bestJaccard = sim;
        bestPrevIdx = prev.userMsgIdx;
      }
    }

    if (bestPrevIdx >= 0) {
      results.push({
        offsetPct: curr.offsetPct,
        timestamp: curr.timestamp,
        snippet: curr.text.slice(0, 200),
        matchedPattern: `repetition:T${bestPrevIdx}:${bestJaccard.toFixed(2)}`,
        precedingTool: null,
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Signal E — long gap + topic change detection
// ---------------------------------------------------------------------------

const LONG_GAP_MS = 30 * 60 * 1000; // 30 minutes
const TOPIC_CHANGE_JACCARD_MAX = 0.2;

/**
 * Detects long pauses (> 30 min) between consecutive user messages where the
 * two messages also have very different content (Jaccard < 0.2), indicating
 * the user returned to start a new topic.
 *
 * Emits one {@link ConversationTip} per qualifying pair with
 * `id: 'long-gap-topic-change'`, `category: 'workflow'`. Severity is `'info'`
 * for a single occurrence and `'warning'` when 2+ pairs are found.
 *
 * Aggregation choice: individual tips are emitted per pair (not aggregated)
 * up to 2 pairs. If 3+ pairs are found, they are collapsed into a single tip
 * with `data.count` to avoid flooding the UI with workflow tips.
 */
function detectLongGapTopicChanges(userMessages: UserMessageRecord[]): ConversationTip[] {
  interface GapRecord {
    gapMin: number;
    turn: number;
  }

  const qualifyingPairs: GapRecord[] = [];

  for (let i = 1; i < userMessages.length; i++) {
    const prev = userMessages[i - 1];
    const curr = userMessages[i];

    if (!prev.timestamp || !curr.timestamp) continue;

    const gapMs = new Date(curr.timestamp).getTime() - new Date(prev.timestamp).getTime();
    if (gapMs <= LONG_GAP_MS) continue;

    const prevTokens = tokenize(prev.text);
    const currTokens = tokenize(curr.text);
    const sim = jaccard(prevTokens, currTokens);

    if (sim < TOPIC_CHANGE_JACCARD_MAX) {
      qualifyingPairs.push({
        gapMin: Math.round(gapMs / 60_000),
        turn: curr.userMsgIdx,
      });
    }
  }

  if (qualifyingPairs.length === 0) return [];

  // Collapse 3+ pairs into a single aggregated tip.
  if (qualifyingPairs.length >= 3) {
    return [
      {
        id: 'long-gap-topic-change',
        category: 'workflow',
        severity: 'warning',
        data: {
          gapMin: qualifyingPairs[0].gapMin,
          turn: qualifyingPairs[0].turn,
          count: qualifyingPairs.length,
        },
      },
    ];
  }

  // 1 or 2 pairs: emit one tip per pair.
  const severity: ConversationTip['severity'] = qualifyingPairs.length >= 2 ? 'warning' : 'info';
  return qualifyingPairs.map((p) => ({
    id: 'long-gap-topic-change',
    category: 'workflow' as const,
    severity,
    data: { gapMin: p.gapMin, turn: p.turn },
  }));
}
