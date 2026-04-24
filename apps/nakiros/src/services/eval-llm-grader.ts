import { spawn } from 'child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

import type { SkillEvalAssertionDefinition } from '@nakiros/shared';

const MAX_OUTPUT_FILE_BYTES = 60_000;
const MAX_TOTAL_OUTPUTS_BYTES = 120_000;

/** Result for a single LLM assertion: pass/fail + short evidence quote (capped 400 chars). */
export interface LlmGradeResult {
  passed: boolean;
  evidence: string;
}

/**
 * Model used for LLM-based assertion grading.
 * Sonnet is intentional: assertion grading is classification against a bounded
 * digest — Opus brings no accuracy gain for this shape of task and costs more
 * tokens. Keeping this explicit also reduces same-model bias when the agent
 * under test runs on Opus.
 */
export const JUDGE_MODEL = 'sonnet';

/**
 * Read all output files produced by the agent (workdir/outputs/) into a single
 * digest the judge can reason about. Truncates large files.
 */
function readOutputsDigest(workdir: string): string {
  const outputsDir = join(workdir, 'outputs');
  if (!existsSync(outputsDir)) return '(no outputs/ directory — agent produced nothing)';

  let total = 0;
  const parts: string[] = [];
  const collect = (dir: string, prefix: string) => {
    let entries: import('fs').Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true }) as import('fs').Dirent[];
    } catch {
      return;
    }
    for (const e of entries) {
      const fullPath = join(dir, e.name);
      const relPath = `${prefix}${e.name}`;
      if (e.isDirectory()) {
        collect(fullPath, `${relPath}/`);
        continue;
      }
      try {
        const size = statSync(fullPath).size;
        if (total + Math.min(size, MAX_OUTPUT_FILE_BYTES) > MAX_TOTAL_OUTPUTS_BYTES) {
          parts.push(`\n--- ${relPath} (skipped, total digest size exceeded) ---`);
          continue;
        }
        const raw = readFileSync(fullPath, 'utf8');
        const content = raw.length > MAX_OUTPUT_FILE_BYTES
          ? raw.slice(0, MAX_OUTPUT_FILE_BYTES) + '\n...[truncated]'
          : raw;
        parts.push(`\n--- ${relPath} ---\n${content}`);
        total += content.length;
      } catch {
        parts.push(`\n--- ${relPath} (read error) ---`);
      }
    }
  };
  collect(outputsDir, '');
  if (parts.length === 0) return '(outputs/ directory is empty)';
  return parts.join('\n');
}

/**
 * Build a prompt that asks the judge to grade ALL assertions in one shot.
 * Requires a JSON array response matching the order of assertions.
 */
function buildBatchJudgePrompt(args: {
  assertions: SkillEvalAssertionDefinition[];
  assistantText: string;
  outputsDigest: string;
}): string {
  const assertionList = args.assertions
    .map((a, i) => `${i + 1}. ${a.text}`)
    .join('\n');

  return [
    'You are a strict evaluation judge. You will grade several assertions against the outputs of a single run.',
    '',
    'ASSERTIONS TO GRADE (in order):',
    assertionList,
    '',
    'AGENT FINAL ASSISTANT MESSAGE (may contain the result when the agent did not write files):',
    args.assistantText || '(no assistant text available)',
    '',
    'FILES PRODUCED IN outputs/ DIRECTORY:',
    args.outputsDigest,
    '',
    'Grading rules:',
    '- Grade each assertion independently.',
    '- Require concrete evidence for PASS — quote or reference a specific fragment.',
    '- If evidence is missing, partial, or ambiguous, mark FAIL.',
    '- Do not invent content that is not in the outputs or assistant message.',
    '',
    'Respond ONLY with a JSON array (one object per assertion, same order, no prose around it):',
    '[',
    '  {"passed": true, "evidence": "short quote or explanation, max 400 chars"},',
    '  {"passed": false, "evidence": "..."},',
    '  ...',
    ']',
  ].join('\n');
}

/**
 * Parse a JSON array response from the judge. Resilient to code fences / surrounding prose.
 */
function parseBatchJudgeResponse(raw: string, expectedCount: number): LlmGradeResult[] {
  const trimmed = raw.trim();
  const match = trimmed.match(/\[[\s\S]*\]/);
  const fallback = (reason: string): LlmGradeResult[] =>
    Array.from({ length: expectedCount }, () => ({ passed: false, evidence: reason }));

  if (!match) return fallback(`Could not parse judge response: ${trimmed.slice(0, 300)}`);

  let arr: unknown;
  try {
    arr = JSON.parse(match[0]);
  } catch (err) {
    return fallback(`JSON parse failed: ${(err as Error).message}`);
  }

  if (!Array.isArray(arr)) return fallback('Judge did not return an array');

  const results: LlmGradeResult[] = [];
  for (let i = 0; i < expectedCount; i++) {
    const item = arr[i] as { passed?: unknown; evidence?: unknown } | undefined;
    if (!item) {
      results.push({ passed: false, evidence: 'Judge returned fewer items than assertions' });
      continue;
    }
    results.push({
      passed: item.passed === true,
      evidence: typeof item.evidence === 'string' ? item.evidence.slice(0, 400) : '',
    });
  }
  return results;
}

/**
 * Grade multiple LLM assertions in a SINGLE claude subprocess spawn.
 * Returns results in the same order as the input assertions.
 */
export async function gradeLlmAssertionsBatch(
  workdir: string,
  assertions: SkillEvalAssertionDefinition[],
  assistantText: string,
): Promise<LlmGradeResult[]> {
  if (assertions.length === 0) return [];

  const outputsDigest = readOutputsDigest(workdir);
  const prompt = buildBatchJudgePrompt({ assertions, assistantText, outputsDigest });

  return new Promise<LlmGradeResult[]>((resolve) => {
    let stdout = '';
    let stderr = '';

    const child = spawn('claude', ['--model', JUDGE_MODEL, '--output-format', 'text', '--print', prompt], {
      cwd: workdir,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    child.on('close', (code) => {
      if (code !== 0) {
        const reason = `Judge exited with code ${code}: ${stderr.slice(-200)}`;
        resolve(Array.from({ length: assertions.length }, () => ({ passed: false, evidence: reason })));
        return;
      }
      resolve(parseBatchJudgeResponse(stdout, assertions.length));
    });

    child.on('error', (err) => {
      const reason = `Failed to spawn judge: ${err.message}`;
      resolve(Array.from({ length: assertions.length }, () => ({ passed: false, evidence: reason })));
    });
  });
}
