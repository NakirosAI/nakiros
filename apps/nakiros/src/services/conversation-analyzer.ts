import { readFileSync } from 'fs';
import { basename, join } from 'path';

import {
  isSyntheticUserMessage,
  jaccard,
  STOP_WORDS,
  SYNTHETIC_USER_TEXTS,
  tokenizeForCluster,
} from './runner-core/cluster-tokens.js';

import { analyzeDriftFromPreparsed } from './drift-analyzer.js';
import type { AssistantTurn, ContextMetrics, UserMessage as DriftUserMessage } from './drift/session-loader.js';

import type {
  ConversationAnalysis,
  ConversationCompaction,
  ConversationCostSample,
  ConversationDrift,
  ConversationFrictionPoint,
  ConversationFrictionZone,
  ConversationHealthZone,
  ConversationHotFile,
  ConversationPausePoint,
  ConversationTip,
  ConversationToolStats,
} from '@nakiros/shared';

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
 * signal-based heuristics (backtrack, repetition) and the stuck-cluster
 * algorithm (v11 — sentiment removed). Cache waste
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
  // 1-indexed counter of real user text messages (skips <command-name> messages).
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

  // Drift detection — parallel structures built during the main parse loop to
  // avoid re-reading the JSONL in analyzeDriftFromPreparsed.
  // Maps tool_use_id → isError (filled from user tool_result entries).
  const driftToolErrors = new Map<string, boolean>();
  // AssistantTurn[] compatible with drift/session-loader — built during assistant scan.
  const driftAssistantTurns: AssistantTurn[] = [];
  // DriftUserMessage[] compatible with drift/session-loader — built during user scan.
  const driftUserMessages: DriftUserMessage[] = [];
  let driftUserMsgCounter = 0;

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
              tool_use_id?: string;
            };
            if (b.type === 'text' && b.text) textParts.push(b.text);
            else if (b.type === 'tool_result') {
              toolResults.push({ isError: Boolean(b.is_error) });
              // Drift: index tool_result errors by tool_use_id for loop detection.
              if (b.tool_use_id) {
                driftToolErrors.set(b.tool_use_id, Boolean(b.is_error));
              }
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

      // Skip <command-name> and <local-command-…> messages — not real user text.
      if (!text.includes('<command-name>') && !text.includes('<local-command-')) {
        userMsgCounter += 1;

        // Collect for Signal C (repetition) and Signal E (long-gap + topic change).
        userMessages.push({
          userMsgIdx: userMsgCounter,
          text,
          timestamp: timestamp ?? '',
          offsetPct: entryOffset,
        });

        // Drift: collect user messages in the format expected by drift detectors.
        driftUserMessages.push({
          index: driftUserMsgCounter++,
          timestamp: timestamp ?? '',
          text,
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
      const assistantTextParts: string[] = [];

      // Tool use + hot file tracking.
      let turnLastTool: string | null = lastAssistantToolName;
      const turnToolNames: string[] = [];
      const turnToolUseInfos: AssistantToolUseInfo[] = [];
      // Drift: tool_use events for this turn, resolved with hasError from driftToolErrors.
      const driftToolUses: AssistantTurn['toolUses'] = [];

      if (Array.isArray(msg?.content)) {
        for (const block of msg!.content) {
          const b = block as {
            type?: string;
            text?: string;
            id?: string;
            name?: string;
            input?: Record<string, unknown>;
          };
          if (b.type === 'text' && b.text) {
            assistantTextParts.push(b.text);
            continue;
          }
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

          // Drift: build ToolUseEvent for loop detector; use driftToolErrors for hasError.
          const hasError = b.id ? (driftToolErrors.get(b.id) ?? false) : false;
          driftToolUses.push({
            tool: b.name,
            input: b.input ?? {},
            hasError,
            resultContent: '',
          });
        }
      }
      lastAssistantToolName = turnLastTool;

      // Friction zones: record this assistant turn for later zone construction.
      assistantTurnRecords.push({
        turn: currentTurn,
        timestamp: timestamp ?? '',
        toolUses: turnToolUseInfos,
      });

      // Drift: accumulate an AssistantTurn compatible with drift detectors.
      driftAssistantTurns.push({
        index: currentTurn,
        timestamp: timestamp ?? '',
        toolUses: driftToolUses,
        text: assistantTextParts.join('\n'),
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
    entries,
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

  // --- Drift detection — using data already parsed above ---------------------
  // `analyzeDriftFromPreparsed` runs the three detectors (loop → topic →
  // context) on the structures built during the main parse loop, without
  // re-reading the JSONL. Null = explicitly computed, no drift found.
  const driftContextMetrics: ContextMetrics = { maxContextTokens, contextWindow };
  const drift: ConversationDrift | null = analyzeDriftFromPreparsed({
    assistantTurns: driftAssistantTurns,
    userMessages: driftUserMessages,
    contextMetrics: driftContextMetrics,
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
    drift,

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
// Friction zones v10 — stuck-cluster algorithm
// ---------------------------------------------------------------------------

/**
 * Builds {@link ConversationFrictionZone} records using the stuck-cluster
 * algorithm (v11 — sentiment removed).
 *
 * A zone is created when 3+ user messages on the same topic cluster together
 * within a 10-user-message window, after the first 10 user messages (setup
 * phase). Topic similarity is measured by Jaccard > 0.3 on content-bearing
 * tokens (stop words removed). Signals S4/S5/S6 act as enrichments that
 * bump severity, but do NOT create zones alone.
 *
 * `frictionPoints[]` is left unchanged by this function — only `frictionZones[]`
 * is affected.
 */
function buildFrictionZones(args: {
  sessionId: string;
  frictionPoints: ConversationFrictionPoint[];
  assistantTurnRecords: AssistantTurnRecord[];
  userMessages: UserMessageRecord[];
  toolUsesByFile: Map<string, ToolUseRecord[]>;
  toolUseTurnById: Map<string, number>;
  erroredToolUseIds: Set<string>;
  entries: Record<string, unknown>[];
}): ConversationFrictionZone[] {
  const {
    sessionId,
    frictionPoints,
    assistantTurnRecords,
    userMessages,
    toolUsesByFile,
    toolUseTurnById,
    erroredToolUseIds,
    entries,
  } = args;

  if (userMessages.length < 3) return [];

  // Build an index: assistantTurn → AssistantTurnRecord for fast lookup.
  const assistantByTurn = new Map<number, AssistantTurnRecord>();
  for (const rec of assistantTurnRecords) assistantByTurn.set(rec.turn, rec);

  // ---------------------------------------------------------------------------
  // 1. Cluster user messages by topic using Jaccard adjacency + union-find
  // ---------------------------------------------------------------------------

  const JACCARD_THRESHOLD = 0.3;
  const USER_MSG_WINDOW = 10;   // max userMsgCounter gap between two cluster members
  const MIN_CLUSTER_SIZE = 3;
  const SETUP_SKIP = 10;        // ignore first N user messages (setup / orientation)
  const CLUSTER_SPAN_MAX = 10;  // max(userMsgCounter) - min(userMsgCounter) in a cluster

  // Pre-compute token sets for each user message. Drop Claude-Code synthetic
  // interrupt messages — they're identical strings that would Jaccard 1.0 and
  // form a phantom cluster (3+ ESC presses in a session = false-positive
  // friction). userMsgCounter alignment with sentiment trace stays intact
  // because we filter here, not at userMessages collection time.
  const tokenSets: Array<{ idx: number; tokens: Set<string> }> = userMessages
    .filter((um) => !isSyntheticUserMessage(um.text))
    .map((um) => ({
      idx: um.userMsgIdx,
      tokens: tokenizeForCluster(um.text),
    }));

  // Union-Find (path-compression only — sufficient for this small n).
  const parent = tokenSets.map((_, i) => i);
  function find(x: number): number {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]]; // path halving
      x = parent[x];
    }
    return x;
  }
  function union(x: number, y: number): void {
    const rx = find(x);
    const ry = find(y);
    if (rx !== ry) parent[rx] = ry;
  }

  // Build adjacency: connect pairs (i, j) where j.userMsgCounter - i.userMsgCounter <= WINDOW
  // and Jaccard(tokens_i, tokens_j) > THRESHOLD.
  for (let i = 0; i < tokenSets.length; i++) {
    const tsi = tokenSets[i];
    if (tsi.tokens.size === 0) continue;
    for (let j = i + 1; j < tokenSets.length; j++) {
      const tsj = tokenSets[j];
      if (tsj.idx - tsi.idx > USER_MSG_WINDOW) break;
      if (tsj.tokens.size === 0) continue;
      const sim = jaccard(tsi.tokens, tsj.tokens);
      if (sim > JACCARD_THRESHOLD) union(i, j);
    }
  }

  // Collect components: group indices by root.
  const componentMap = new Map<number, number[]>();
  for (let i = 0; i < tokenSets.length; i++) {
    const root = find(i);
    const arr = componentMap.get(root) ?? [];
    arr.push(i);
    componentMap.set(root, arr);
  }

  // ---------------------------------------------------------------------------
  // 2. Filter clusters
  // ---------------------------------------------------------------------------

  // For each surviving cluster, collect needed pairwise Jaccard to compute avg.
  // We approximate with the average of all pairs that are within the window.
  interface CandidateCluster {
    indices: number[];      // positions in tokenSets[] / userMessages[]
    jaccardAvg: number;
  }

  const candidates: CandidateCluster[] = [];

  for (const indices of componentMap.values()) {
    if (indices.length < MIN_CLUSTER_SIZE) continue;

    const msgs = indices.map((i) => userMessages[i]);
    const minCounter = Math.min(...msgs.map((m) => m.userMsgIdx));
    const maxCounter = Math.max(...msgs.map((m) => m.userMsgIdx));

    // Skip setup phase: the cluster must start after the first SETUP_SKIP messages.
    if (minCounter <= SETUP_SKIP) continue;

    // Cluster span: stay within CLUSTER_SPAN_MAX user-message turns.
    if (maxCounter - minCounter > CLUSTER_SPAN_MAX) continue;

    // Compute average Jaccard over all pairs within the window.
    let jaccardSum = 0;
    let jaccardCount = 0;
    const sortedIndices = [...indices].sort((a, b) => tokenSets[a].idx - tokenSets[b].idx);
    for (let pi = 0; pi < sortedIndices.length; pi++) {
      for (let pj = pi + 1; pj < sortedIndices.length; pj++) {
        const idxA = sortedIndices[pi];
        const idxB = sortedIndices[pj];
        if (tokenSets[idxB].idx - tokenSets[idxA].idx > USER_MSG_WINDOW) continue;
        jaccardSum += jaccard(tokenSets[idxA].tokens, tokenSets[idxB].tokens);
        jaccardCount++;
      }
    }
    const jaccardAvg = jaccardCount > 0 ? jaccardSum / jaccardCount : 0;

    candidates.push({ indices: sortedIndices, jaccardAvg });
  }

  if (candidates.length === 0) return [];

  // ---------------------------------------------------------------------------
  // 3. Build helpers for enrichment signals and agentContext
  // ---------------------------------------------------------------------------

  // Map absolute entry positions by timestamp (for assistant turn range lookup).
  const timestampToAbsIndex = new Map<string, number>();
  for (let i = 0; i < entries.length; i++) {
    const ts = entries[i]['timestamp'] as string | undefined;
    if (ts && !timestampToAbsIndex.has(ts)) timestampToAbsIndex.set(ts, i);
  }

  // Map userMsgIdx → absolute entry index via timestamp.
  const userMsgIdxToAbsIndex = new Map<number, number>();
  for (const um of userMessages) {
    const ai = timestampToAbsIndex.get(um.timestamp) ?? 0;
    userMsgIdxToAbsIndex.set(um.userMsgIdx, ai);
  }

  // Map userMsgIdx → absolute turn number in the entries list (for start/endTurn).
  // We define "absolute turn" here as the 1-indexed position in the entries list
  // (not the assistant turn counter), so startTurn/endTurn are consistent with
  // the existing zone API (which uses absolute entry-level positions).
  // Actually: per the spec, startTurn/endTurn are "absolute turn" of the FIRST/LAST
  // user message in the cluster. We'll use the absoluteIndex (entries position + 1).

  // Backtrack map: assistant turn → file basename.
  const backtrackedTurnToBasename = new Map<number, string>();
  for (const fp of frictionPoints) {
    const m = fp.matchedPattern.match(/^backtrack:(.+):T\d+->T(\d+)$/);
    if (m) backtrackedTurnToBasename.set(parseInt(m[2], 10), m[1]);
  }

  // Build tool-error enrichment maps for S5/S6 detection.
  // S5: ≥ 2 tool errors in the zone.
  // S6: ≥ 2 "string not found" errors on same file in the zone.
  const STRING_NOT_FOUND_RE = /string not found|not_found_in_file/i;

  // tool_use_id → file path (for S6).
  const toolUseIdToFilePath = new Map<string, string>();
  for (const entry of entries) {
    if (entry['type'] !== 'assistant') continue;
    const msg = entry['message'] as { content?: unknown[] } | undefined;
    if (!Array.isArray(msg?.content)) continue;
    for (const block of msg!.content) {
      const b = block as { type?: string; id?: string; name?: string; input?: Record<string, unknown> };
      if (b.type === 'tool_use' && b.id && (b.name === 'Edit' || b.name === 'MultiEdit')) {
        const fp = b.input?.['file_path'] as string | undefined;
        if (fp) toolUseIdToFilePath.set(b.id, fp);
      }
    }
  }

  // tool_use_id → error text (for S6).
  const toolUseIdToErrorText = new Map<string, string>();
  for (const entry of entries) {
    if (entry['type'] !== 'user') continue;
    const msg = entry['message'] as { content?: unknown } | undefined;
    if (!Array.isArray(msg?.content)) continue;
    for (const block of msg!.content) {
      const b = block as { type?: string; tool_use_id?: string; is_error?: boolean; content?: unknown };
      if (b.type !== 'tool_result' || !b.tool_use_id) continue;
      if (!erroredToolUseIds.has(b.tool_use_id)) continue;
      let errorText = '';
      if (typeof b.content === 'string') {
        errorText = b.content;
      } else if (Array.isArray(b.content)) {
        for (const part of b.content as Array<{ type?: string; text?: string }>) {
          if (part.type === 'text' && part.text) { errorText = part.text; break; }
        }
      }
      if (errorText) toolUseIdToErrorText.set(b.tool_use_id, errorText);
    }
  }

  // ---------------------------------------------------------------------------
  // 4. For each candidate cluster → build a ConversationFrictionZone
  // ---------------------------------------------------------------------------

  const zones: ConversationFrictionZone[] = [];

  for (const { indices, jaccardAvg } of candidates) {
    const clusterMsgs = indices.map((i) => userMessages[i]);
    const clusterSize = clusterMsgs.length;

    // startTurn / endTurn: absolute entry index (1-based) of first/last cluster message.
    const firstMsg = clusterMsgs[0];
    const lastMsg = clusterMsgs[clusterMsgs.length - 1];
    const startTurn = (timestampToAbsIndex.get(firstMsg.timestamp) ?? 0) + 1;
    const endTurn = (timestampToAbsIndex.get(lastMsg.timestamp) ?? 0) + 1;
    const startTimestamp = firstMsg.timestamp;
    const endTimestamp = lastMsg.timestamp;

    // Determine assistant turn range spanning this zone (for agentContext).
    // Include all assistant turns whose absolute index is in [startTurn-1, endTurn-1].
    const absStart = startTurn - 1;
    const absEnd = endTurn - 1;
    let aStartTurn = Infinity;
    let aEndTurn = 0;
    for (const aRec of assistantTurnRecords) {
      const ai = timestampToAbsIndex.get(aRec.timestamp) ?? 0;
      if (ai >= absStart && ai <= absEnd) {
        if (aRec.turn < aStartTurn) aStartTurn = aRec.turn;
        if (aRec.turn > aEndTurn) aEndTurn = aRec.turn;
      }
    }
    // Fallback when no assistant turns land precisely in the range.
    if (!isFinite(aStartTurn)) {
      aStartTurn = 1;
      aEndTurn = assistantTurnRecords.length > 0 ? assistantTurnRecords[assistantTurnRecords.length - 1].turn : 1;
    }

    // Compute agentContext over [aStartTurn, aEndTurn].
    const filesTouchedSet: string[] = [];
    const filesTouchedSeen = new Set<string>();
    let toolCallsCount = 0;
    let toolErrorsCount = 0;
    const editCountsByFile = new Map<string, number>();

    for (let t = aStartTurn; t <= aEndTurn; t++) {
      const aRec = assistantByTurn.get(t);
      if (!aRec) continue;
      toolCallsCount += aRec.toolUses.length;
      for (const tu of aRec.toolUses) {
        if (tu.filePath && !filesTouchedSeen.has(tu.filePath)) {
          filesTouchedSeen.add(tu.filePath);
          filesTouchedSet.push(tu.filePath);
        }
        if (
          tu.filePath &&
          (tu.toolName === 'Edit' || tu.toolName === 'Write' || tu.toolName === 'MultiEdit')
        ) {
          editCountsByFile.set(tu.filePath, (editCountsByFile.get(tu.filePath) ?? 0) + 1);
        }
      }
    }

    // Count errors within the zone.
    for (const toolUseId of erroredToolUseIds) {
      const turn = toolUseTurnById.get(toolUseId);
      if (turn !== undefined && turn >= aStartTurn && turn <= aEndTurn) toolErrorsCount++;
    }

    // backtrackedFiles.
    const backtrackedFiles: string[] = [];
    for (const [laterTurn, bn] of backtrackedTurnToBasename) {
      if (laterTurn >= aStartTurn && laterTurn <= aEndTurn) {
        const fullPath = filesTouchedSet.find((p) => p.endsWith('/' + bn) || p === bn);
        const target = fullPath ?? bn;
        if (!backtrackedFiles.includes(target)) backtrackedFiles.push(target);
      }
    }

    // keyActions.
    const keyActions: string[] = [];
    if (toolErrorsCount > 0) {
      const errorToolCounts = new Map<string, number>();
      for (const toolUseId of erroredToolUseIds) {
        const turn = toolUseTurnById.get(toolUseId);
        if (turn !== undefined && turn >= aStartTurn && turn <= aEndTurn) {
          const aRec = assistantByTurn.get(turn);
          if (aRec && aRec.toolUses.length > 0) {
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
    const sortedEdits = Array.from(editCountsByFile.entries())
      .filter(([, c]) => c >= 2)
      .sort((a, b) => b[1] - a[1]);
    for (const [fp, count] of sortedEdits) {
      if (keyActions.length >= 5) break;
      keyActions.push(`Edit ${fp.split('/').pop() ?? fp} ×${count}`);
    }
    if (keyActions.length < 5) {
      const notableTools = new Set(['Bash', 'Read', 'WebFetch', 'WebSearch']);
      const seenNotable = new Set<string>();
      for (let t = aStartTurn; t <= aEndTurn && keyActions.length < 5; t++) {
        const aRec = assistantByTurn.get(t);
        if (!aRec) continue;
        for (const tu of aRec.toolUses) {
          if (!notableTools.has(tu.toolName) || seenNotable.has(tu.toolName)) continue;
          seenNotable.add(tu.toolName);
          keyActions.push(
            tu.toolName === 'Bash' && tu.bashCommand
              ? `Bash: ${tu.bashCommand.slice(0, 40)}`
              : tu.toolName,
          );
        }
      }
    }

    // ---------------------------------------------------------------------------
    // 5. Enrichment signals (S4/S5/S6) — bumps severity, used as badges.
    // ---------------------------------------------------------------------------

    const enrichSignals = new Set<'S4' | 'S5' | 'S6'>();

    // S4: any backtrack within the assistant zone.
    if (backtrackedFiles.length > 0) enrichSignals.add('S4');

    // S5: ≥ 2 tool errors in the zone.
    if (toolErrorsCount >= 2) enrichSignals.add('S5');

    // S6: ≥ 2 "string not found" errors on same file in the zone.
    const notFoundByFile = new Map<string, number>();
    for (const toolUseId of erroredToolUseIds) {
      const turn = toolUseTurnById.get(toolUseId);
      if (turn === undefined || turn < aStartTurn || turn > aEndTurn) continue;
      const errorText = toolUseIdToErrorText.get(toolUseId) ?? '';
      if (!STRING_NOT_FOUND_RE.test(errorText)) continue;
      const filePath = toolUseIdToFilePath.get(toolUseId);
      if (!filePath) continue;
      notFoundByFile.set(filePath, (notFoundByFile.get(filePath) ?? 0) + 1);
    }
    if ([...notFoundByFile.values()].some((c) => c >= 2)) enrichSignals.add('S6');

    const signalKinds = [...enrichSignals].sort() as Array<'S4' | 'S5' | 'S6'>;

    // Severity: base = cluster size (3 → medium, 5+ → high). Bump if any enrichment.
    let severity: ConversationFrictionZone['severity'] =
      clusterSize >= 5 ? 'high' : 'medium';
    if (severity === 'medium' && signalKinds.length > 0) severity = 'high';

    // reactionPoint: last cluster message, with stuck-cluster pattern.
    const reactionPoint: ConversationFrictionPoint = {
      offsetPct: lastMsg.offsetPct,
      timestamp: lastMsg.timestamp,
      snippet: lastMsg.text.slice(0, 200),
      matchedPattern: `stuck-cluster:${clusterSize}:${jaccardAvg.toFixed(2)}`,
      precedingTool: null,
    };

    // Zone id.
    const zoneId = `${sessionId}:${startTurn}:${endTurn}:cluster${clusterSize}`;

    zones.push({
      id: zoneId,
      startTurn,
      endTurn,
      startTimestamp,
      endTimestamp,
      reactionPoint,
      agentContext: {
        filesTouched: filesTouchedSet,
        toolCallsCount,
        toolErrorsCount,
        backtrackedFiles,
        keyActions,
      },
      clusterSize,
      severity,
      signalKinds: signalKinds.length > 0 ? signalKinds : undefined,
    });
  }

  // Sort zones by startTurn for stable rendering order.
  zones.sort((a, b) => a.startTurn - b.startTurn);

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
