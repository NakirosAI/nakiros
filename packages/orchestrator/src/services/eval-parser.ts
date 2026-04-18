import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';

import type {
  SkillEvalSuite,
  SkillEvalDefinition,
  SkillEvalIteration,
  SkillEvalGrading,
  SkillEvalGradingRun,
  SkillEvalAssertion,
  SkillEvalTiming,
  SkillEvalRunSummary,
} from '@nakiros/shared';

export function parseSkillEvals(skillDir: string, skillName: string): SkillEvalSuite | null {
  const evalsDir = join(skillDir, 'evals');
  const evalsJsonPath = join(evalsDir, 'evals.json');

  if (!existsSync(evalsJsonPath)) return null;

  let rawDefs: Record<string, unknown>;
  try {
    rawDefs = JSON.parse(readFileSync(evalsJsonPath, 'utf8'));
  } catch {
    return null;
  }

  const rawEvals = rawDefs['evals'] as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(rawEvals)) return null;

  const definitions: SkillEvalDefinition[] = rawEvals.map((e) => ({
    id: (e['id'] as number) ?? 0,
    name: (e['name'] as string) ?? '',
    prompt: (e['prompt'] as string) ?? '',
    expectedOutput: (e['expected_output'] as string) ?? '',
    assertions: (e['assertions'] as SkillEvalDefinition['assertions']) ?? [],
  }));

  const workspaceDir = join(evalsDir, 'workspace');
  const iterations: SkillEvalIteration[] = [];

  if (existsSync(workspaceDir)) {
    let iterDirs: string[];
    try {
      iterDirs = readdirSync(workspaceDir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && e.name.startsWith('iteration-'))
        .map((e) => e.name)
        .sort((a, b) => {
          const numA = parseInt(a.replace('iteration-', ''), 10);
          const numB = parseInt(b.replace('iteration-', ''), 10);
          return numA - numB;
        });
    } catch {
      iterDirs = [];
    }

    for (const iterDir of iterDirs) {
      const iterNum = parseInt(iterDir.replace('iteration-', ''), 10);
      const iterPath = join(workspaceDir, iterDir);
      const iteration = parseIteration(iterPath, iterNum, definitions);
      if (iteration) {
        if (iterations.length > 0) {
          const prev = iterations[iterations.length - 1];
          iteration.deltaVsPreviousIteration = iteration.withSkill.passRate - prev.withSkill.passRate;
        }
        iterations.push(iteration);
      }
    }
  }

  const latest = iterations.length > 0 ? iterations[iterations.length - 1] : null;

  return {
    skillName,
    definitions,
    iterations,
    latestPassRate: latest ? latest.withSkill.passRate : null,
    latestDelta: latest ? latest.delta.passRate : null,
  };
}

function parseIteration(
  iterPath: string,
  iterNum: number,
  definitions: SkillEvalDefinition[],
): SkillEvalIteration | null {
  const benchmarkPath = join(iterPath, 'benchmark.json');
  let benchmark: Record<string, unknown> | null = null;
  if (existsSync(benchmarkPath)) {
    try {
      benchmark = JSON.parse(readFileSync(benchmarkPath, 'utf8'));
    } catch {
      // ignore
    }
  }

  const feedbackPath = join(iterPath, 'feedback.json');
  let feedback: Record<string, unknown> | null = null;
  if (existsSync(feedbackPath)) {
    try {
      feedback = JSON.parse(readFileSync(feedbackPath, 'utf8'));
    } catch {
      // ignore
    }
  }
  const perEvalFeedback = (feedback?.['per_eval'] as Record<string, string>) ?? {};

  const gradings: SkillEvalGrading[] = [];
  let withSkillTotalPassed = 0;
  let withSkillTotalAssertions = 0;
  let withSkillTotalTokens = 0;
  let withSkillTotalDuration = 0;
  let withoutSkillTotalPassed = 0;
  let withoutSkillTotalAssertions = 0;
  let withoutSkillTotalTokens = 0;
  let withoutSkillTotalDuration = 0;
  let hasWithoutSkill = false;

  for (const def of definitions) {
    const evalDir = join(iterPath, `eval-${def.name}`);
    const withSkillRun = parseGradingRun(evalDir, 'with_skill');
    const withoutSkillRun = parseGradingRun(evalDir, 'without_skill');

    if (!withSkillRun) continue;

    withSkillTotalPassed += withSkillRun.passed;
    withSkillTotalAssertions += withSkillRun.total;
    if (withSkillRun.timing) {
      withSkillTotalTokens += withSkillRun.timing.totalTokens;
      withSkillTotalDuration += withSkillRun.timing.durationMs;
    }

    if (withoutSkillRun) {
      hasWithoutSkill = true;
      withoutSkillTotalPassed += withoutSkillRun.passed;
      withoutSkillTotalAssertions += withoutSkillRun.total;
      if (withoutSkillRun.timing) {
        withoutSkillTotalTokens += withoutSkillRun.timing.totalTokens;
        withoutSkillTotalDuration += withoutSkillRun.timing.durationMs;
      }
    }

    const deltaPassRate = withoutSkillRun
      ? withSkillRun.passRate - withoutSkillRun.passRate
      : null;
    const deltaTokens = withSkillRun.timing && withoutSkillRun?.timing
      ? withSkillRun.timing.totalTokens - withoutSkillRun.timing.totalTokens
      : null;
    const deltaDurationMs = withSkillRun.timing && withoutSkillRun?.timing
      ? withSkillRun.timing.durationMs - withoutSkillRun.timing.durationMs
      : null;

    gradings.push({
      evalName: def.name,
      withSkill: withSkillRun,
      withoutSkill: withoutSkillRun,
      deltaPassRate,
      deltaTokens,
      deltaDurationMs,
      humanFeedback: perEvalFeedback[def.name] ?? null,
    });
  }

  if (gradings.length === 0) return null;

  const withSkillSummary: SkillEvalRunSummary = {
    passRate: withSkillTotalAssertions > 0 ? withSkillTotalPassed / withSkillTotalAssertions : 0,
    totalAssertions: withSkillTotalAssertions,
    passedAssertions: withSkillTotalPassed,
    failedAssertions: withSkillTotalAssertions - withSkillTotalPassed,
    tokens: withSkillTotalTokens,
    durationMs: withSkillTotalDuration,
  };

  const withoutSkillSummary: SkillEvalRunSummary | null = hasWithoutSkill
    ? {
        passRate: withoutSkillTotalAssertions > 0 ? withoutSkillTotalPassed / withoutSkillTotalAssertions : 0,
        totalAssertions: withoutSkillTotalAssertions,
        passedAssertions: withoutSkillTotalPassed,
        failedAssertions: withoutSkillTotalAssertions - withoutSkillTotalPassed,
        tokens: withoutSkillTotalTokens,
        durationMs: withoutSkillTotalDuration,
      }
    : null;

  const delta = {
    passRate: withoutSkillSummary ? withSkillSummary.passRate - withoutSkillSummary.passRate : null,
    tokens: withoutSkillSummary ? withSkillSummary.tokens - withoutSkillSummary.tokens : null,
    durationMs: withoutSkillSummary ? withSkillSummary.durationMs - withoutSkillSummary.durationMs : null,
  };

  const timestamp = (benchmark?.['timestamp'] as string) ?? null;

  return {
    number: iterNum,
    timestamp,
    withSkill: withSkillSummary,
    withoutSkill: withoutSkillSummary,
    delta,
    deltaVsPreviousIteration: null,
    gradings,
  };
}

function parseGradingRun(evalDir: string, config: 'with_skill' | 'without_skill'): SkillEvalGradingRun | null {
  const configDir = join(evalDir, config);
  const gradingPath = join(configDir, 'grading.json');
  if (!existsSync(gradingPath)) return null;

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(readFileSync(gradingPath, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }

  const assertionResults = (raw['assertion_results'] as Array<Record<string, unknown>>) ?? [];
  const summary = (raw['summary'] as Record<string, unknown>) ?? {};

  const assertions: SkillEvalAssertion[] = assertionResults.map((a) => ({
    type: (a['type'] as SkillEvalAssertion['type']) ?? undefined,
    text: (a['text'] as string) ?? '',
    passed: (a['passed'] as boolean) ?? false,
    evidence: (a['evidence'] as string) ?? '',
  }));

  const passed = (summary['passed'] as number) ?? assertions.filter((a) => a.passed).length;
  const failed = (summary['failed'] as number) ?? assertions.filter((a) => !a.passed).length;
  const total = (summary['total'] as number) ?? assertions.length;
  const passRate = (summary['pass_rate'] as number) ?? (total > 0 ? passed / total : 0);

  const timing = parseTiming(configDir);
  const graderModel = (raw['grader_model'] as string) ?? null;

  return {
    config,
    passed,
    failed,
    total,
    passRate,
    assertions,
    notes: (raw['notes'] as string) ?? '',
    timing,
    graderModel,
  };
}

function parseTiming(configDir: string): SkillEvalTiming | null {
  const timingPath = join(configDir, 'timing.json');
  if (!existsSync(timingPath)) return null;
  try {
    const raw = JSON.parse(readFileSync(timingPath, 'utf8')) as Record<string, unknown>;
    return {
      totalTokens: (raw['total_tokens'] as number) ?? 0,
      durationMs: (raw['duration_ms'] as number) ?? 0,
      inputTokens: raw['input_tokens'] as number | undefined,
      outputTokens: raw['output_tokens'] as number | undefined,
      model: raw['model'] as string | undefined,
    };
  } catch {
    return null;
  }
}
