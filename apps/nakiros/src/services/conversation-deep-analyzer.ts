import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir, tmpdir } from 'os';

import type {
  AnalyzerStructuredOutput,
  ConversationAnalysis,
  ConversationAnalyzedEvent,
  ConversationDeepAnalysis,
  DeepAnalysisEvent,
  RawFriction,
} from '@nakiros/shared';
import { IPC_CHANNELS } from '@nakiros/shared';

import { analyzeConversation } from './conversation-analyzer.js';
import { getConversationMessages } from './conversation-parser.js';
import { eventBus } from '../daemon/event-bus.js';
import { buildClaudeArgs, spawnClaudeTurn } from './runner-core/index.js';

// ---------------------------------------------------------------------------
// Model routing — we pick the cheapest model that fits the prompt.
//
// Haiku 4.5 = 200k context, cheap input ($1/M).
// Sonnet 4.6 = 1M context natively (no beta header needed), higher quality
// narrative detection, ~3× more expensive than Haiku below 200k and 6×
// above 200k (2× pricing premium on the extended window).
//
// We want Haiku whenever the prompt fits, Sonnet only when the conversation
// is genuinely too big for Haiku's 200k window.
// ---------------------------------------------------------------------------

const HAIKU_MODEL = 'haiku';
const SONNET_MODEL = 'sonnet';
const HAIKU_INPUT_BUDGET = 170_000; // leaves headroom for skill + output
const MAX_PROMPT_TOKENS = 950_000; // Sonnet 1M with comfortable margin

// Where we persist completed reports so re-opening doesn't re-bill.
const ANALYSES_DIR = join(homedir(), '.nakiros', 'analyses');
// Raw frictions extracted from the analyzer's JSON tail, one file per session.
// The proposal engine reads from here (re-entrant: crashes don't lose frictions).
const FRICTIONS_RAW_DIR = join(homedir(), '.nakiros', 'frictions', 'raw');

export type DeepAnalysisResult = ConversationDeepAnalysis;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Lazy cache read — returns a prior analysis if one exists, without re-running. */
export function loadDeepAnalysis(sessionId: string): DeepAnalysisResult | null {
  const path = analysisFilePath(sessionId);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as DeepAnalysisResult;
  } catch {
    return null;
  }
}

/**
 * Run deep analysis on a conversation. Builds the prompt, picks the right
 * model for its size, spawns `claude --print`, persists the report.
 * Throws on CLI failure — the caller is expected to surface it to the UI.
 */
export async function runDeepAnalysis(
  providerProjectDir: string,
  sessionId: string,
  projectId: string,
): Promise<DeepAnalysisResult> {
  const stage1 = analyzeConversation(providerProjectDir, sessionId, projectId);
  if (!stage1) {
    throw new Error(`Conversation ${sessionId} not found or unreadable.`);
  }

  const messages = getConversationMessages(providerProjectDir, sessionId);
  const prompt = buildPrompt(stage1, messages);
  const inputTokens = estimateTokens(prompt);

  const model: 'haiku' | 'sonnet' =
    inputTokens <= HAIKU_INPUT_BUDGET ? 'haiku' : 'sonnet';
  const modelId = model === 'haiku' ? HAIKU_MODEL : SONNET_MODEL;

  if (inputTokens > MAX_PROMPT_TOKENS) {
    throw new Error(
      `Conversation too large for deep analysis (~${Math.round(inputTokens / 1000)}k tokens, max ${Math.round(MAX_PROMPT_TOKENS / 1000)}k).`,
    );
  }

  const rawReport = await streamDeepAnalysis(sessionId, prompt, modelId, model, inputTokens);
  const { markdown, structured } = parseStructuredTail(rawReport);
  const generatedAt = new Date().toISOString();

  const result: DeepAnalysisResult = {
    sessionId,
    model,
    inputTokens,
    report: markdown.trim(),
    generatedAt,
    structuredFrictions: structured ? structured.frictions : null,
  };

  persistAnalysis(result);

  // Persist raw frictions in their own queue so the proposal engine can
  // process them even if it wasn't listening at broadcast time (crash-safe).
  if (structured) {
    const event: ConversationAnalyzedEvent = {
      sessionId,
      projectId,
      providerProjectDir,
      frictions: structured.frictions,
      generatedAt,
    };
    persistRawFrictions(event);
    eventBus.broadcast(IPC_CHANNELS['conversation:analyzed'], event);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Structured-tail parsing — the skill appends a `nakiros-json` fenced block at
// the end of the report. We extract it, strip it from the markdown shown to
// the user, and return both pieces. When the block is missing or malformed we
// degrade gracefully: the Markdown consumer still gets the full report, the
// proposal engine simply receives null.
// ---------------------------------------------------------------------------

// Find the nakiros-json fence anywhere in the report. Tolerates trailing
// model chatter after the closing fence — the skill forbids it, but we'd
// rather surface frictions than reject a report for an extra "hope this helps".
const NAKIROS_JSON_FENCE_RE = /```nakiros-json\s*\n([\s\S]*?)\n```/i;
// Used to strip the machine-output section from the displayed markdown —
// optional header, optional leading blank lines, then the fence.
const NAKIROS_TAIL_STRIP_RE =
  /\n*(?:##\s+Nakiros machine output\s*\n+)?```nakiros-json[\s\S]*?```\s*$/i;

export function parseStructuredTail(report: string): {
  markdown: string;
  structured: AnalyzerStructuredOutput | null;
} {
  const match = report.match(NAKIROS_JSON_FENCE_RE);
  if (!match) return { markdown: report, structured: null };

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1]);
  } catch {
    // Malformed JSON — keep full report so the user still sees everything.
    return { markdown: report, structured: null };
  }

  const validated = validateStructuredOutput(parsed);
  if (!validated) return { markdown: report, structured: null };

  // Strip the tail. If the tail isn't cleanly at the end (model added trailing
  // text), fall back to slicing at the first fence occurrence.
  const strippedMarkdown = report.replace(NAKIROS_TAIL_STRIP_RE, '');
  const fallback = strippedMarkdown === report
    ? report.slice(0, match.index ?? report.length)
    : strippedMarkdown;
  return { markdown: fallback, structured: validated };
}

function validateStructuredOutput(value: unknown): AnalyzerStructuredOutput | null {
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  if (obj.schemaVersion !== 1) return null;
  if (!Array.isArray(obj.frictions)) return null;

  const frictions: RawFriction[] = [];
  for (const item of obj.frictions) {
    if (!item || typeof item !== 'object') continue;
    const f = item as Record<string, unknown>;
    if (typeof f.approximateTurn !== 'number') continue;
    if (typeof f.timestampIso !== 'string') continue;
    if (typeof f.description !== 'string' || f.description.trim().length === 0) continue;
    if (typeof f.rawExcerpt !== 'string') continue;
    frictions.push({
      approximateTurn: f.approximateTurn,
      timestampIso: f.timestampIso,
      description: f.description,
      category: typeof f.category === 'string' ? f.category : undefined,
      rawExcerpt: f.rawExcerpt,
    });
  }

  return { schemaVersion: 1, frictions };
}

/**
 * Persist the analyzer event verbatim — crash-safe input queue for the
 * proposal engine. The engine removes the file once it has processed the
 * frictions.
 */
function persistRawFrictions(event: ConversationAnalyzedEvent): void {
  if (!existsSync(FRICTIONS_RAW_DIR)) mkdirSync(FRICTIONS_RAW_DIR, { recursive: true });
  writeFileSync(
    join(FRICTIONS_RAW_DIR, `${event.sessionId}.json`),
    JSON.stringify(event, null, 2),
  );
}

// ---------------------------------------------------------------------------
// Prompt building — assembles stage-1 signals + raw conversation into the
// single prompt the skill expects.
// ---------------------------------------------------------------------------

function buildPrompt(
  stage1: ConversationAnalysis,
  messages: ReturnType<typeof getConversationMessages>,
): string {
  const stage1Block = JSON.stringify(
    {
      sessionId: stage1.sessionId,
      score: stage1.score,
      healthZone: stage1.healthZone,
      durationMs: stage1.durationMs,
      messageCount: stage1.messageCount,
      summary: stage1.summary,
      gitBranch: stage1.gitBranch,
      compactions: stage1.compactions,
      maxContextTokens: stage1.maxContextTokens,
      contextWindow: stage1.contextWindow,
      totalTokens: stage1.totalTokens,
      cacheReadTokens: stage1.cacheReadTokens,
      cacheCreationTokens: stage1.cacheCreationTokens,
      cacheMissTurns: stage1.cacheMissTurns,
      wastedCacheTokens: stage1.wastedCacheTokens,
      frictionPoints: stage1.frictionPoints,
      toolStats: stage1.toolStats,
      toolErrorCount: stage1.toolErrorCount,
      hotFiles: stage1.hotFiles,
      sidechainCount: stage1.sidechainCount,
      slashCommands: stage1.slashCommands,
      diagnostic: stage1.diagnostic,
      tips: stage1.tips,
    },
    null,
    2,
  );

  // Trim + label each message for readability. Tool calls are rendered
  // inline so the reader (Claude) can see what actually ran.
  const convLines: string[] = [];
  messages.forEach((m, idx) => {
    const prefix = `--- turn ${idx + 1} (${m.type}) @ ${m.timestamp} ---`;
    convLines.push(prefix);
    if (m.content) convLines.push(m.content);
    if (m.toolUse && m.toolUse.length > 0) {
      for (const t of m.toolUse) {
        convLines.push(`[tool_use ${t.name}]`);
        try {
          convLines.push(JSON.stringify(t.input).slice(0, 500));
        } catch {
          /* ignore unserialisable tool input */
        }
      }
    }
    convLines.push('');
  });
  const convBlock = convLines.join('\n');

  return (
    '<instructions>\n' +
    'Analyze the following Claude Code conversation and produce the Markdown report per the nakiros-conversation-analyst skill conventions (sections: What happened / Friction & frustration / Context drift / Tool issues / Root causes / What would have helped / Skill recommendations if warranted).\n' +
    '\n' +
    buildMachineOutputContract() +
    '</instructions>\n\n' +
    '<stage1-signals>\n' +
    stage1Block +
    '\n</stage1-signals>\n\n' +
    '<conversation>\n' +
    convBlock +
    '</conversation>\n'
  );
}

/**
 * Inlined contract for the machine-readable tail. We do NOT rely on Claude
 * Code auto-loading the skill or its `references/machine-output.md` — in
 * `--print` mode that discovery is unreliable, and models tend to invent
 * their own schema by mimicking the input shape they see. Spelling the exact
 * JSON template + category taxonomy directly in the prompt is load-bearing
 * for the proposal engine to receive parseable output.
 */
function buildMachineOutputContract(): string {
  return (
    'CRITICAL — MACHINE OUTPUT REQUIREMENT\n' +
    '\n' +
    'AFTER the Markdown report, emit EXACTLY this section as the final thing in your response (no trailing text):\n' +
    '\n' +
    '## Nakiros machine output\n' +
    '\n' +
    '```nakiros-json\n' +
    '{\n' +
    '  "schemaVersion": 1,\n' +
    '  "frictions": [\n' +
    '    {\n' +
    '      "approximateTurn": 42,\n' +
    '      "timestampIso": "2026-04-22T10:30:12Z",\n' +
    '      "description": "Short natural-language summary of the friction (20-60 words). Describes the SHAPE of the problem so similar frictions across conversations cluster together. Avoid project-specific proper nouns.",\n' +
    '      "category": "context-drift",\n' +
    '      "rawExcerpt": "Verbatim ~500 chars around the friction."\n' +
    '    }\n' +
    '  ]\n' +
    '}\n' +
    '```\n' +
    '\n' +
    'Hard rules — violations break the downstream pipeline:\n' +
    '- Fence language MUST be `nakiros-json` (not `json`). The engine greps for this exact token.\n' +
    '- JSON must be valid (no trailing commas, no comments).\n' +
    '- `approximateTurn` is a 1-based integer turn index from the `--- turn N (...) ---` headers in the conversation. NOT a percentage, NOT an offset.\n' +
    '- `timestampIso` is ISO 8601. Copy from the turn header.\n' +
    '- `description` is what gets embedded for clustering ACROSS conversations and projects — MAX 25 WORDS in ENGLISH describing the PATTERN of the problem, not the specific instance.\n' +
    '  - BANNED: file paths, component names, function names, library names, project-specific proper nouns (e.g. no "AgentPanel", "settings.local.json", "CognitoService"). If the pain is "wiring change doesn\'t reflect in UI", say that — don\'t say which component.\n' +
    '  - Template to follow: "model [did X] [even though|when|after] [Y], user had to [intervene]". Short. Abstract. Reusable across projects.\n' +
    '  - Good: "Model wired IPC handlers and state but the visible UI was never updated, user had to point out the render path was missing."\n' +
    '  - Bad: "After extensive IPC and hook wiring across six files, the visible UI was unchanged because the AgentPanel render path was never modified."\n' +
    '  - Two frictions that share the same PATTERN must produce descriptions that are semantically near-identical, regardless of which project they happened in.\n' +
    '- `category` is OPTIONAL and must be one of: `context-drift`, `tool-loop`, `wrong-file`, `scope-creep`, `unmet-instruction`, `repeated-correction`, `missing-knowledge`, `other`. Omit rather than invent a new tag.\n' +
    '- `rawExcerpt` is a verbatim ~500-char slice around the friction, preserving the user\'s language.\n' +
    '- Emit the block even when there are no real frictions: `"frictions": []`. Omission is not allowed.\n' +
    '- The Markdown report and this JSON block are the ONLY content in your response. No preamble, no post-script.\n' +
    '- If you start running out of tokens, SHORTEN the narrative sections; NEVER truncate the JSON block.\n'
  );
}

// ---------------------------------------------------------------------------
// Token estimation — we don't call the tokenizer, a char/4 heuristic is
// sufficient for routing decisions (Anthropic docs cite 3-4 chars/token on
// average English, closer to 2-3 for code-heavy text — we err conservative).
// ---------------------------------------------------------------------------

function estimateTokens(text: string): number {
  // 3 chars/token → slight over-estimate that keeps us on the safe side of
  // model windows.
  return Math.ceil(text.length / 3);
}

// ---------------------------------------------------------------------------
// Claude CLI invocation — uses the shared `spawnClaudeTurn` helper from
// runner-core so this pipeline benefits from the same stream-json parsing,
// tool dispatch, and error handling as audit/eval/fix. Text deltas are
// broadcast on `deepAnalysis:event` so the frontend can render the
// assistant's output progressively instead of waiting on a silent spinner.
// ---------------------------------------------------------------------------

async function streamDeepAnalysis(
  sessionId: string,
  prompt: string,
  modelId: string,
  modelLabel: 'haiku' | 'sonnet',
  inputTokens: number,
): Promise<string> {
  broadcastEvent({ sessionId, type: 'started', model: modelLabel, inputTokens });

  const cliArgs = buildClaudeArgs({ prompt, model: modelId });
  let collected = '';
  let tokensUsed = 0;
  const startedAt = Date.now();

  const result = await spawnClaudeTurn({
    // The analyzer doesn't read/write files — any cwd works. Use tmpdir so
    // the CLI can't accidentally pick up a stray .claude/ config from the
    // daemon's cwd.
    workdir: tmpdir(),
    cliArgs,
    onChildSpawned: () => {
      /* no stop/resume semantics for fire-and-forget analyses */
    },
    isKilled: () => false,
    onSession: () => {
      /* ignored — analysis sessions aren't resumable */
    },
    onText: (text) => {
      collected += text;
      broadcastEvent({ sessionId, type: 'text', text });
    },
    onTool: (name, display) => {
      // Not expected in the analyzer path, but forward anyway for visibility.
      broadcastEvent({ sessionId, type: 'tool', name, display });
    },
    onUsage: (total) => {
      tokensUsed = total;
      broadcastEvent({ sessionId, type: 'tokens', tokensUsed: total });
    },
  });

  if (result.exitCode !== 0) {
    const message = result.error ?? `claude exited with code ${result.exitCode}`;
    broadcastEvent({ sessionId, type: 'error', message });
    throw new Error(`claude failed — exit=${result.exitCode}${result.error ? ` | ${result.error}` : ''}`);
  }
  if (!collected.trim()) {
    const message = 'claude returned empty output';
    broadcastEvent({ sessionId, type: 'error', message });
    throw new Error(message);
  }

  broadcastEvent({
    sessionId,
    type: 'done',
    tokensUsed,
    durationMs: Date.now() - startedAt,
  });
  return collected;
}

function broadcastEvent(event: DeepAnalysisEvent): void {
  eventBus.broadcast(IPC_CHANNELS['deepAnalysis:event'], event);
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function analysisFilePath(sessionId: string): string {
  return join(ANALYSES_DIR, `${sessionId}.json`);
}

function persistAnalysis(result: DeepAnalysisResult): void {
  if (!existsSync(ANALYSES_DIR)) mkdirSync(ANALYSES_DIR, { recursive: true });
  writeFileSync(analysisFilePath(result.sessionId), JSON.stringify(result, null, 2));
}
