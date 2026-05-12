import { readFileSync } from 'fs';
import { join } from 'path';

import type {
  ConversationAnalysis,
  ConversationCompaction,
  ConversationCostSample,
  ConversationFrictionPoint,
  ConversationHealthZone,
  ConversationHotFile,
  ConversationPausePoint,
  ConversationTip,
  ConversationToolStats,
} from '@nakiros/shared';

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

// Minimum sentiment score for a Negative-labelled message to be counted as a
// friction point. Tuned high to keep precision: the multilingual model assigns
// "Negative" to ≈48% of real messages at all confidence levels; only the
// high-confidence tail is genuinely adversarial (corrections, frustration).
const SENTIMENT_FRICTION_THRESHOLD = 0.85;

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
 * the session sentiment trace: messages where `label === 'Negative' && score > 0.85`
 * are recorded as friction points — sessions without a trace produce empty friction.
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
  // `cwd` is recorded on every JSONL entry; read it from the first one. The
  // field layout has evolved: try the top-level key first, then the nested
  // payload (older format). If absent, fall back gracefully — the session will
  // have no sentiment-derived friction points until the trace is generated.
  const cwd = (entries[0]?.['cwd'] as string | undefined)
    ?? (entries[0]?.['payload'] as Record<string, unknown> | undefined)?.['cwd'] as string | undefined
    ?? null;
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
      // NOTE: the ingest runner (runner.ts) builds userInputs from
      // getConversationMessages() which filters BOTH <command-name> AND
      // <local-command-> messages. This counter only excludes <command-name>,
      // so <local-command-> messages increment userMsgCounter without being
      // scored. The index may drift by the number of <local-command-> messages
      // in the session — accepted, see DONE_WITH_CONCERNS below.
      if (!text.includes('<command-name>')) {
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
            if (path) editCounts.set(path, (editCounts.get(path) ?? 0) + 1);
          }
        }
      }
      lastAssistantToolName = turnLastTool;

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
  const toolNameByUseId = new Map<string, string>();
  for (const entry of entries) {
    if (entry['type'] !== 'assistant') continue;
    const msg = entry['message'] as { content?: unknown[] } | undefined;
    if (!Array.isArray(msg?.content)) continue;
    for (const block of msg!.content) {
      const b = block as { type?: string; id?: string; name?: string };
      if (b.type === 'tool_use' && b.id && b.name) toolNameByUseId.set(b.id, b.name);
    }
  }
  for (const entry of entries) {
    if (entry['type'] !== 'user') continue;
    const msg = entry['message'] as { content?: unknown } | undefined;
    if (!Array.isArray(msg?.content)) continue;
    for (const block of msg!.content) {
      const b = block as { type?: string; tool_use_id?: string; is_error?: boolean };
      if (b.type !== 'tool_result' || !b.is_error || !b.tool_use_id) continue;
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
