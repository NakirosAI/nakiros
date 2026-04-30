import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Subset of an `evals.json` entry the baseline cache cares about. Anything
 * that can change Claude's behaviour for the *baseline* run (= same eval,
 * same model, no skill) must be folded into the fingerprint so that editing
 * a prompt, swapping a fixture, or tightening a grader invalidates the
 * cache automatically.
 */
export interface EvalInputForFingerprint {
  name: string;
  prompt: string;
  expected_output?: string;
  mode?: 'autonomous' | 'interactive';
  /** Fixture paths relative to the skill dir. */
  files?: string[];
  output_files?: string[];
  /** Assertion definitions. Treated opaquely — folded as JSON. */
  assertions: unknown;
}

/**
 * Compute a deterministic SHA-256 fingerprint of the *inputs* of an eval —
 * i.e. everything that defines the eval question itself, independent of the
 * skill being tested.
 *
 * Folded into the hash:
 * - The eval definition fields (name, prompt, expected_output, mode,
 *   output_files, assertions).
 * - The full content of every fixture listed in `evalRecord.files`.
 *
 * Two evals with identical inputs produce the same fingerprint, regardless
 * of the skill they belong to. Used as part of the baseline cache key so
 * that editing a prompt or swapping a fixture invalidates the cached
 * baseline (cache miss → recompute).
 *
 * Missing fixture files don't throw — they're folded as a `<missing>`
 * marker so a present-vs-absent fixture still flips the fingerprint.
 *
 * @returns fingerprint prefixed with `sha256:` (matches
 *   {@link computeSkillFingerprint}'s convention).
 */
export function computeEvalFingerprint(
  skillDir: string,
  evalRecord: EvalInputForFingerprint,
): string {
  const h = createHash('sha256');

  // 1. Eval definition — stable JSON over an explicitly-keyed object.
  h.update('eval-def\n');
  h.update(
    JSON.stringify({
      name: evalRecord.name,
      prompt: evalRecord.prompt,
      expected_output: evalRecord.expected_output ?? '',
      mode: evalRecord.mode ?? 'autonomous',
      output_files: (evalRecord.output_files ?? []).slice().sort(),
      assertions: evalRecord.assertions ?? [],
    }),
  );
  h.update('\n');

  // 2. Fixture files — sorted by relative path so readdir order is irrelevant.
  const fixtures = (evalRecord.files ?? []).slice().sort();
  for (const rel of fixtures) {
    h.update('fixture\n');
    h.update(rel);
    h.update('\n');
    try {
      h.update(readFileSync(join(skillDir, rel)));
    } catch {
      h.update('<missing>');
    }
    h.update('\n');
  }

  return `sha256:${h.digest('hex')}`;
}
