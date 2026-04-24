import { readFileSync } from 'fs';
import { join } from 'path';

import type {
  ConversationAnalysis,
  ConversationCompaction,
  ConversationFrictionPoint,
  ConversationHealthZone,
  ConversationHotFile,
  ConversationTip,
  ConversationToolStats,
} from '@nakiros/shared';

// ---------------------------------------------------------------------------
// Heuristic constants
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 5 * 60 * 1000; // default Anthropic prompt cache TTL

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

// User-message patterns that indicate friction. Matched case-insensitively on
// a lowercased prefix of the message to catch the common tip-of-the-tongue
// corrections. Kept deliberately tight — false positives pollute scores.
const FRICTION_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bno\s+wait\b/i, label: 'no wait' },
  { pattern: /\bnon\b/i, label: 'non' },
  { pattern: /\bstop\b/i, label: 'stop' },
  { pattern: /\barr[êe]te\b/i, label: 'arrête' },
  { pattern: /\bdon'?t\b/i, label: "don't" },
  { pattern: /\bne\s+fais\s+pas\b/i, label: 'ne fais pas' },
  { pattern: /\bpas\s+(ça|ca)\b/i, label: 'pas ça' },
  { pattern: /\brevert\b/i, label: 'revert' },
  { pattern: /\bundo\b/i, label: 'undo' },
  { pattern: /\bwrong\b/i, label: 'wrong' },
  { pattern: /\bthat'?s\s+not\b/i, label: "that's not" },
  { pattern: /\bactually\b/i, label: 'actually' },
  { pattern: /\bc'?est\s+pas\s+(ça|ca|bon)\b/i, label: "c'est pas ça" },
];

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
 * a curated FR/EN pattern list anchored to user messages only. Cache waste
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

  // First pass: collect ordered timeline of relevant events to compute offsets
  // and build summary / metadata.
  let startedAt = '';
  let lastMessageAt = '';
  let gitBranch: string | null = null;
  let summary = '';
  let messageCount = 0;

  const compactions: ConversationCompaction[] = [];
  const frictionPoints: ConversationFrictionPoint[] = [];
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
      if (!startedAt) startedAt = timestamp;
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

      // Friction detection — only on real user text, skip command messages.
      if (!text.includes('<command-name>')) {
        for (const { pattern, label } of FRICTION_PATTERNS) {
          if (pattern.test(text)) {
            frictionPoints.push({
              offsetPct: entryOffset,
              timestamp: timestamp ?? '',
              snippet: text.slice(0, 200),
              matchedPattern: label,
              precedingTool: lastAssistantToolName,
            });
            break; // one friction flag per message is enough
          }
        }
      }

      // Cache miss detection — real user reply arriving > TTL after last
      // assistant reply forces a full cache rewrite on the next turn.
      if (lastAssistantTimestamp && timestamp) {
        const gapMs = new Date(timestamp).getTime() - new Date(lastAssistantTimestamp).getTime();
        if (gapMs > CACHE_TTL_MS) cacheMissTurns++;
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
      const usage = msg?.usage;
      if (usage) {
        const input = usage.input_tokens ?? 0;
        const output = usage.output_tokens ?? 0;
        const cacheRead = usage.cache_read_input_tokens ?? 0;
        const cacheCreation = usage.cache_creation_input_tokens ?? 0;

        totalTokens += input + output + cacheRead + cacheCreation;
        cacheReadTokens += cacheRead;
        cacheCreationTokens += cacheCreation;

        const ctxOnThisTurn = input + cacheRead + cacheCreation;
        if (ctxOnThisTurn > maxContextTokens) maxContextTokens = ctxOnThisTurn;
        contextSamples.push({ offsetPct: entryOffset, tokens: ctxOnThisTurn });

        // Attribute waste: cache_creation tokens on a turn that came after a
        // > TTL gap is directly avoidable spend.
        if (lastAssistantTimestamp && timestamp) {
          const gapMs =
            new Date(timestamp).getTime() - new Date(lastAssistantTimestamp).getTime();
          if (gapMs > CACHE_TTL_MS) wastedCacheTokens += cacheCreation;
        }
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

    cacheReadTokens,
    cacheCreationTokens,
    cacheMissTurns,
    wastedCacheTokens,

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
      `${args.cacheMissTurns} reprises > 5 min, ~${kWaste}k tokens de cache rewrite évitables`,
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
  durationMs: number;
  slashCommands: string[];
  sidechainCount: number;
}): ConversationTip[] {
  const tips: ConversationTip[] = [];
  const ctxPct = Math.round((args.maxContextTokens / args.contextWindow) * 100);
  const wastedK = Math.round(args.wastedCacheTokens / 1000);

  // --- Context management ------------------------------------------------
  if (args.compactions.length >= 2) {
    tips.push({
      id: 'split-sessions',
      category: 'context',
      severity: 'critical',
      data: { count: args.compactions.length },
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
  if (args.wastedCacheTokens >= 500_000) {
    tips.push({
      id: 'use-extended-cache',
      category: 'cache',
      severity: 'warning',
      data: { cacheMisses: args.cacheMissTurns, wastedK },
    });
  } else if (args.cacheMissTurns >= 5) {
    tips.push({
      id: 'keep-session-continuous',
      category: 'cache',
      severity: 'info',
      data: { cacheMisses: args.cacheMissTurns, wastedK },
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

  // Severity order: critical > warning > info
  const weight = { critical: 0, warning: 1, info: 2 } as const;
  tips.sort((a, b) => weight[a.severity] - weight[b.severity]);

  // Cap — too many tips is noise, first 5 is actionable.
  return tips.slice(0, 5);
}

function shortenFile(path: string): string {
  const parts = path.split('/').filter(Boolean);
  return parts.length <= 2 ? path : parts.slice(-2).join('/');
}
