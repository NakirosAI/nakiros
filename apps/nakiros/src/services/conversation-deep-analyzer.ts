import { spawn } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

import type { ConversationAnalysis, ConversationDeepAnalysis } from '@nakiros/shared';

import { analyzeConversation } from './conversation-analyzer.js';
import { getConversationMessages } from './conversation-parser.js';

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

  const report = await spawnClaude(prompt, modelId);

  const result: DeepAnalysisResult = {
    sessionId,
    model,
    inputTokens,
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
    'Analyze the following Claude Code conversation and produce the Markdown report per your skill.\n' +
    '</instructions>\n\n' +
    '<stage1-signals>\n' +
    stage1Block +
    '\n</stage1-signals>\n\n' +
    '<conversation>\n' +
    convBlock +
    '</conversation>\n'
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
