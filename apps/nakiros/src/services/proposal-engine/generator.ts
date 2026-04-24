import { spawn } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

import type { EnrichedFriction, FrictionCluster, ProposalEvalCase } from '@nakiros/shared';

import { formatContextForPrompt, type ProjectContext } from './project-context.js';

// ---------------------------------------------------------------------------
// Proposal generator — one-shot `claude --print` call that drafts a
// new-skill or skill-patch proposal from a cluster of frictions.
//
// Model choice: we don't pass `--model`, so generation runs on whatever the
// user's Claude CLI is configured to use by default. Skill generation is
// infrequent (only when a cluster crosses MIN_OCCURRENCES) and high-stakes
// (the SKILL.md becomes a durable artefact), so it's worth running on the
// user's preferred default rather than forcing Haiku. The analyzer keeps
// its own Haiku/Sonnet routing because its volume profile is different.
//
// We deliberately do NOT spawn the full interactive `startFix` / `startCreate`
// runner here. The interactive flavour is reserved for "Accept & iterate" in
// the UI.
//
// The skill-factory SKILL.md (in `~/.nakiros/skills/nakiros-skill-factory/`)
// is read and inlined so the generator follows the same procedure the
// interactive agent does. When the skill isn't available we fall back to a
// plain prompt — generation still works, just without the factory's
// scaffolding.
// ---------------------------------------------------------------------------

const FACTORY_SKILL_DIR = join(
  homedir(),
  '.nakiros',
  'skills',
  'nakiros-skill-factory',
);

export interface GeneratorInput {
  cluster: FrictionCluster;
  frictions: EnrichedFriction[];
  /** When the proposal is a patch: the existing SKILL.md contents. */
  existingSkillContent?: string;
  /** When the proposal is a patch: the target skill name. */
  existingSkillName?: string;
  /**
   * Scan of the target project — layout, package.json essentials, CLAUDE.md
   * content, existing skills. Inlined in the prompt so the generator can
   * reference REAL files in the skill it produces instead of inventing
   * plausible-looking paths.
   */
  projectContext?: ProjectContext;
}

export interface GeneratorOutput {
  /** Full SKILL.md content for the proposed new/patched skill. */
  content: string;
  /** Eval cases the user can run to validate the draft. */
  evalCases: ProposalEvalCase[];
}

/**
 * Generate a draft proposal for the given cluster. Throws when the LLM call
 * fails or when neither of the expected fenced blocks can be parsed — the
 * engine orchestrator treats this as "skip this cluster for now".
 */
export async function generateProposal(input: GeneratorInput): Promise<GeneratorOutput> {
  const prompt = buildPrompt(input);
  const raw = await spawnClaude(prompt);
  return parseGeneratorOutput(raw, input);
}

// ---------------------------------------------------------------------------
// Prompt building
// ---------------------------------------------------------------------------

function buildPrompt(input: GeneratorInput): string {
  const {
    cluster,
    frictions,
    existingSkillContent,
    existingSkillName,
    projectContext,
  } = input;
  const clusterFrictions = frictions.filter((f) => cluster.frictionIds.includes(f.id));

  const factorySkill = readFactorySkill();
  const mode = existingSkillName ? 'patch' : 'new';

  const frictionBlock = clusterFrictions
    .map(
      (f, i) =>
        `--- friction ${i + 1} (${new Date(f.timestamp).toISOString()}) ---\n` +
        `description: ${f.description}\n` +
        `category: ${f.category ?? 'other'}\n` +
        `skillsDetected: ${f.skillsDetected.join(', ') || '(none)'}\n` +
        `excerpt: ${truncate(f.rawExcerpt, 400)}`,
    )
    .join('\n\n');

  const factoryBlock = factorySkill
    ? `<skill-factory-procedure>\n${factorySkill}\n</skill-factory-procedure>\n\n`
    : '';

  const projectBlock = projectContext
    ? `${formatContextForPrompt(projectContext)}\n\n`
    : '';

  const existingBlock = existingSkillContent
    ? `<existing-skill name="${existingSkillName}">\n${existingSkillContent}\n</existing-skill>\n\n`
    : '';

  return (
    `You are the nakiros-skill-factory. Produce a draft ${mode === 'new' ? 'new skill' : 'patched skill'} based on the recurring frictions below, grounded in the target project's actual file layout.\n\n` +
    factoryBlock +
    projectBlock +
    existingBlock +
    `<frictions count="${clusterFrictions.length}">\n${frictionBlock}\n</frictions>\n\n` +
    buildOutputContract(mode, projectContext !== undefined)
  );
}

function buildOutputContract(mode: 'new' | 'patch', hasProjectContext: boolean): string {
  const refsRule = hasProjectContext
    ? `GROUNDING RULE — load-bearing:\n` +
      `- Every file path you cite in the SKILL.md References section, Rules, Gotchas, or eval prompts MUST appear verbatim in the <layout> block above. Do not invent or guess paths.\n` +
      `- If a relevant file doesn't appear in the layout, say so explicitly ("no clear entry point found for X — ask the user") rather than inventing one.\n` +
      `- Prefer directories from the layout when the skill should discover files at runtime (e.g. "look in \`src/auth/\` for the session handler").\n` +
      `- Match the project's actual stack (from <package-json>) when writing examples — don't assume React if the project is Vue, don't assume npm scripts that don't exist.\n` +
      `- If existing skills are listed in <existing-skills>, check your proposed skill isn't redundant with one of them.\n\n`
    : '';
  return (
    `<output-contract>\n` +
    refsRule +
    `Respond with exactly two fenced code blocks, in this order, and NOTHING else:\n\n` +
    `1. A \`skill-md\` fenced block containing the ${mode === 'new' ? 'full SKILL.md for the new skill' : 'full patched SKILL.md (complete file, not a diff)'}. Include valid YAML frontmatter (name, description, triggers) followed by the skill body.\n\n` +
    `2. A \`nakiros-eval-cases\` fenced block containing a JSON array of eval cases. Each case: {"name": string, "prompt": string, "expectation": string, "fromFriction": boolean}. Generate 3-6 cases total: at least one derived from each friction excerpt above (fromFriction: true), plus a couple synthetic edge cases (fromFriction: false). Prompts must be realistic Claude Code user messages that would exercise the skill.\n\n` +
    `No preamble, no explanation, no trailing text. The two fenced blocks are the entire response.\n` +
    `</output-contract>\n`
  );
}

function readFactorySkill(): string | null {
  const path = join(FACTORY_SKILL_DIR, 'SKILL.md');
  if (!existsSync(path)) return null;
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + '…';
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

const SKILL_MD_RE = /```skill-md\s*\n([\s\S]*?)\n```/i;
const EVAL_CASES_RE = /```nakiros-eval-cases\s*\n([\s\S]*?)\n```/i;

export function parseGeneratorOutput(raw: string, input: GeneratorInput): GeneratorOutput {
  const skillMatch = raw.match(SKILL_MD_RE);
  if (!skillMatch) {
    throw new Error('Generator output missing `skill-md` fenced block.');
  }
  const content = skillMatch[1].trim();
  if (!content) {
    throw new Error('Generator output has an empty `skill-md` block.');
  }

  const evalCases = parseEvalCases(raw, input);
  return { content, evalCases };
}

function parseEvalCases(raw: string, input: GeneratorInput): ProposalEvalCase[] {
  const match = raw.match(EVAL_CASES_RE);
  if (!match) {
    // Fall back to a minimal case seeded from each friction excerpt so the
    // proposal is still runnable. The user can tune it before running evals.
    return input.frictions
      .filter((f) => input.cluster.frictionIds.includes(f.id))
      .slice(0, 3)
      .map((f, i) => ({
        name: `friction-${i + 1}`,
        prompt: f.description,
        expectation: 'Skill addresses the described friction.',
        fromFriction: true,
      }));
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1]);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const out: ProposalEvalCase[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const c = item as Record<string, unknown>;
    if (typeof c.name !== 'string' || typeof c.prompt !== 'string') continue;
    out.push({
      name: c.name,
      prompt: c.prompt,
      expectation: typeof c.expectation === 'string' ? c.expectation : undefined,
      fromFriction: typeof c.fromFriction === 'boolean' ? c.fromFriction : undefined,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Claude CLI invocation — mirrors `conversation-deep-analyzer.ts`. Keep them
// aligned if you change spawning semantics there.
// ---------------------------------------------------------------------------

function spawnClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';

    // No `--model` flag — use the user's Claude CLI default.
    const child = spawn(
      'claude',
      ['--output-format', 'text', '--print', prompt],
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
        // Claude CLI often writes its errors to stdout, not stderr — include
        // both so we don't swallow the real cause behind "(no stderr)".
        const stderrTail = stderr.slice(-800).trim();
        const stdoutTail = stdout.slice(-800).trim();
        const pieces = [`exit=${code}`];
        if (stderrTail) pieces.push(`stderr: ${stderrTail}`);
        if (stdoutTail) pieces.push(`stdout: ${stdoutTail}`);
        if (!stderrTail && !stdoutTail) pieces.push('(no output on either stream)');
        reject(new Error(`claude failed — ${pieces.join(' | ')}`));
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
