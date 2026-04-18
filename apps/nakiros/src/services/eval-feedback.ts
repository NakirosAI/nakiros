import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

/**
 * Read feedback.json for a skill iteration. Returns {} if missing.
 * Format (per agentskills.io spec):
 *   { "eval-name": "feedback text or empty string", ... }
 */
export function readIterationFeedback(skillDir: string, iteration: number): Record<string, string> {
  const path = feedbackPath(skillDir, iteration);
  if (!existsSync(path)) return {};
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const result: Record<string, string> = {};
      for (const [evalName, value] of Object.entries(raw as Record<string, unknown>)) {
        if (typeof value === 'string') result[evalName] = value;
      }
      return result;
    }
  } catch {
    // ignore
  }
  return {};
}

/**
 * Save (or update) the feedback for a single eval inside an iteration.
 * Empty string is preserved on purpose (per spec, "" = passed human review).
 */
export function saveEvalFeedback(
  skillDir: string,
  iteration: number,
  evalName: string,
  feedback: string,
): void {
  const current = readIterationFeedback(skillDir, iteration);
  current[evalName] = feedback;
  writeFileSync(feedbackPath(skillDir, iteration), JSON.stringify(current, null, 2), 'utf8');
}

function feedbackPath(skillDir: string, iteration: number): string {
  return join(skillDir, 'evals', 'workspace', `iteration-${iteration}`, 'feedback.json');
}
