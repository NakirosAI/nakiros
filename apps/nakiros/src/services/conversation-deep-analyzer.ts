import { spawn } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';

import type {
  ConversationAnalysis,
  ConversationDeepAnalysis,
  ConversationMessage,
  NormalizedConversation,
  ProviderConversationAnalysis,
} from '@nakiros/shared';

import { analyzeConversation } from './conversation-analyzer.js';
import { getConversationMessages } from './conversation-parser.js';
import { isCodexAnalysis } from './provider-conversation.js';

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

/** Claude CLI model id used when the prompt fits in Haiku's 200k window. */
export const HAIKU_MODEL = 'haiku';
/** Claude CLI model id used when the prompt requires the Sonnet 1M window. */
export const SONNET_MODEL = 'sonnet';
/** Threshold below which Haiku is preferred (leaves headroom for skill + output). */
export const HAIKU_INPUT_BUDGET = 170_000;
/** Hard cap on the prompt size — Sonnet 1M with a comfortable margin. */
export const MAX_PROMPT_TOKENS = 950_000;

/** Where we persist completed reports so re-opening doesn't re-bill. */
export const ANALYSES_DIR = join(homedir(), '.nakiros', 'analyses');

/** Alias of {@link ConversationDeepAnalysis} for modules that only import from this file. */
export type DeepAnalysisResult = ConversationDeepAnalysis;

export function conversationFingerprint(
  conversation: Pick<NormalizedConversation, 'lastMessageAt' | 'messageCount'>,
): string {
  return `${conversation.lastMessageAt}:${conversation.messageCount}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Lazy cache read — returns a prior analysis if one exists, without re-running. */
export function loadDeepAnalysis(
  sessionId: string,
  provider: NormalizedConversation['provider'] = 'claude',
  analyzerProvider: NormalizedConversation['provider'] = provider,
): DeepAnalysisResult | null {
  const path = analysisFilePath(sessionId, provider, analyzerProvider);
  const providerLegacyPath = join(ANALYSES_DIR, `${provider}--${sessionId}.json`);
  const legacyPath = join(ANALYSES_DIR, `${sessionId}.json`);
  const readablePath = existsSync(path)
    ? path
    : analyzerProvider === 'claude' && existsSync(providerLegacyPath)
      ? providerLegacyPath
      : analyzerProvider === 'claude' && provider === 'claude'
        ? legacyPath
        : path;
  if (!existsSync(readablePath)) return null;
  try {
    const result = JSON.parse(readFileSync(readablePath, 'utf8')) as
      Omit<DeepAnalysisResult, 'provider' | 'analyzerProvider'> & {
        provider?: DeepAnalysisResult['provider'];
        analyzerProvider?: DeepAnalysisResult['analyzerProvider'];
      };
    const sourceProvider = result.provider ?? 'claude';
    const reportAnalyzer = result.analyzerProvider ?? 'claude';
    return sourceProvider === provider && reportAnalyzer === analyzerProvider
      ? { ...result, provider: sourceProvider, analyzerProvider: reportAnalyzer }
      : null;
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
  const prompt = buildAnalyzeConvoPrompt(stage1, messages);
  const inputTokens = estimatePromptTokens(prompt);

  const model: 'haiku' | 'sonnet' =
    inputTokens <= HAIKU_INPUT_BUDGET ? 'haiku' : 'sonnet';
  const modelId = model === 'haiku' ? HAIKU_MODEL : SONNET_MODEL;

  if (inputTokens > MAX_PROMPT_TOKENS) {
    throw new Error(
      `Conversation too large for deep analysis (~${Math.round(inputTokens / 1000)}k tokens, max ${Math.round(MAX_PROMPT_TOKENS / 1000)}k).`,
    );
  }

  const report = await spawnClaude(prompt, modelId);

  const result: DeepAnalysisResult = {
    provider: 'claude',
    analyzerProvider: 'claude',
    sessionId,
    model,
    inputTokens,
    report: report.trim(),
    generatedAt: new Date().toISOString(),
  };

  persistAnalysis(result);
  return result;
}

/** Run provider-neutral deep analysis from an already normalized session. */
export async function runNormalizedDeepAnalysis(
  conversation: NormalizedConversation,
  analyzerProvider: NormalizedConversation['provider'] = conversation.provider,
): Promise<DeepAnalysisResult> {
  const prompt = buildAnalyzeConvoPrompt(conversation.analysis, conversation.messages);
  const inputTokens = estimatePromptTokens(prompt);
  if (inputTokens > MAX_PROMPT_TOKENS) {
    throw new Error(
      `Conversation too large for deep analysis (~${Math.round(inputTokens / 1000)}k tokens, max ${Math.round(MAX_PROMPT_TOKENS / 1000)}k).`,
    );
  }
  const model = analyzerProvider === 'claude'
    ? inputTokens <= HAIKU_INPUT_BUDGET ? HAIKU_MODEL : SONNET_MODEL
    : 'default';
  const report = analyzerProvider === 'claude'
    ? await spawnClaude(prompt, model)
    : await spawnCodex(prompt);
  const result: DeepAnalysisResult = {
    provider: conversation.provider,
    analyzerProvider,
    sessionId: conversation.sessionId,
    model,
    inputTokens,
    sourceFingerprint: conversationFingerprint(conversation),
    report: report.trim(),
    generatedAt: new Date().toISOString(),
  };
  persistAnalysis(result);
  return result;
}

// ---------------------------------------------------------------------------
// Prompt building — assembles stage-1 signals + raw conversation into the
// single prompt the skill expects.
// ---------------------------------------------------------------------------

/**
 * Build the prompt sent to Claude for a deep conversation analysis. Combines
 * stage-1 deterministic signals + the raw turn-by-turn conversation, wrapped
 * in `<instructions>` / `<stage1-signals>` / `<conversation>` blocks.
 *
 * Exposed so the streaming `analyze-convo-runner` can reuse the same prompt
 * shape as the legacy one-shot `runDeepAnalysis`.
 */
export function buildAnalyzeConvoPrompt(
  stage1: ProviderConversationAnalysis,
  messages: ConversationMessage[],
): string {
  const codexAnalysis = isCodexAnalysis(stage1);
  const provider = codexAnalysis ? 'codex' : 'claude';
  const providerSignals = codexAnalysis
    ? {
        model: stage1.model,
        compactions: stage1.compactions,
        maxContextTokens: stage1.maxContextTokens,
        contextWindow: stage1.contextWindow,
        totalTokens: stage1.totalTokens,
        frictionPoints: stage1.frictionPoints,
        toolStats: stage1.toolStats,
        toolErrorCount: stage1.toolErrorCount,
        abortedTurns: stage1.abortedTurns,
        scoreFactors: stage1.scoreFactors,
      }
    : {
        compactions: stage1.compactions,
        maxContextTokens: stage1.maxContextTokens,
        contextWindow: stage1.contextWindow,
        totalTokens: stage1.totalTokens,
        cacheReadTokens: stage1.cacheReadTokens,
        cacheCreationTokens: stage1.cacheCreationTokens,
        cacheMissTurns: stage1.cacheMissTurns,
        wastedCacheTokens: stage1.wastedCacheTokens,
        frictionPoints: stage1.frictionPoints,
        frictionZones: stage1.frictionZones,
        toolStats: stage1.toolStats,
        toolErrorCount: stage1.toolErrorCount,
        hotFiles: stage1.hotFiles,
        sidechainCount: stage1.sidechainCount,
        slashCommands: stage1.slashCommands,
        drift: stage1.drift,
        diagnostic: stage1.diagnostic,
        tips: stage1.tips,
      };
  const stage1Block = JSON.stringify(
    {
      provider,
      sessionId: stage1.sessionId,
      score: stage1.score,
      healthZone: stage1.healthZone,
      durationMs: stage1.durationMs,
      messageCount: stage1.messageCount,
      summary: stage1.summary,
      gitBranch: stage1.gitBranch,
      ...providerSignals,
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
  const protocol = loadAnalysisProtocol();

  return (
    '<instructions>\n' +
    `Analyze the following ${provider} coding-agent conversation and produce the Markdown report defined by the supplied protocol.\n` +
    'Use only the supplied evidence. Treat missing provider capabilities as unavailable, not as zero.\n' +
    '</instructions>\n\n' +
    '<analysis-protocol>\n' +
    protocol +
    '\n</analysis-protocol>\n\n' +
    '<stage1-signals>\n' +
    stage1Block +
    '\n</stage1-signals>\n\n' +
    '<conversation>\n' +
    convBlock +
    '</conversation>\n'
  );
}

function loadAnalysisProtocol(): string {
  const managed = join(homedir(), '.nakiros', 'skills', 'nakiros-conversation-analyst');
  const source = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    'bundled-skills',
    'nakiros-conversation-analyst',
  );
  const root = existsSync(join(source, 'SKILL.md')) ? source : managed;
  const files = [
    'SKILL.md',
    join('references', 'friction-patterns.md'),
    join('assets', 'templates', 'analysis-report.md'),
  ];
  const protocol = files.map((relativePath) => {
    const path = join(root, relativePath);
    return existsSync(path)
      ? `<!-- ${relativePath} -->\n${readFileSync(path, 'utf8').trim()}`
      : '';
  }).filter(Boolean).join('\n\n');
  if (!protocol) {
    throw new Error('Nakiros conversation analysis protocol is not installed');
  }
  return protocol;
}

// ---------------------------------------------------------------------------
// Token estimation — we don't call the tokenizer, a char/4 heuristic is
// sufficient for routing decisions (Anthropic docs cite 3-4 chars/token on
// average English, closer to 2-3 for code-heavy text — we err conservative).
// ---------------------------------------------------------------------------

/**
 * Char-count → token estimate (3 chars/token, intentional slight
 * over-estimate that keeps us on the safe side of Claude model windows).
 * Used for model routing — not a substitute for the real tokenizer.
 */
export function estimatePromptTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

// ---------------------------------------------------------------------------
// Claude CLI invocation — mirrors the pattern in eval-llm-grader.ts.
// ---------------------------------------------------------------------------

function spawnClaude(prompt: string, model: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';

    const child = spawn(
      'claude',
      ['--model', model, '--output-format', 'text', '--print', prompt],
      { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] },
    );

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `claude exited with code ${code}: ${stderr.slice(-500) || '(no stderr)'}`,
          ),
        );
        return;
      }
      if (!stdout.trim()) {
        reject(new Error('claude returned empty output'));
        return;
      }
      resolve(stdout);
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to spawn claude: ${err.message}`));
    });
  });
}

function spawnCodex(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const child = spawn(
      'codex',
      ['exec', '--sandbox', 'read-only', '--skip-git-repo-check', prompt],
      { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
    child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`codex exited with code ${code}: ${stderr.slice(-500) || '(no stderr)'}`));
      } else if (!stdout.trim()) {
        reject(new Error('codex returned empty output'));
      } else {
        resolve(stdout);
      }
    });
    child.on('error', (error) => reject(new Error(`Failed to spawn codex: ${error.message}`)));
  });
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/** Cached report path for a session id. */
export function analysisFilePath(
  sessionId: string,
  provider: NormalizedConversation['provider'] = 'claude',
  analyzerProvider: NormalizedConversation['provider'] = provider,
): string {
  return join(ANALYSES_DIR, `${provider}--${analyzerProvider}--${sessionId}.json`);
}

/** Persist a completed deep-analysis report to the shared cache directory. */
export function persistAnalysis(result: DeepAnalysisResult): void {
  if (!existsSync(ANALYSES_DIR)) mkdirSync(ANALYSES_DIR, { recursive: true });
  writeFileSync(
    analysisFilePath(result.sessionId, result.provider, result.analyzerProvider),
    JSON.stringify(result, null, 2),
  );
}
