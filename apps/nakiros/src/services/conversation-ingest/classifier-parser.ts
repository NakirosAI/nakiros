import type {
  ConversationDigestFriction,
  ConversationDigestPhase,
  ConversationDigestRule,
} from '@nakiros/shared';

/**
 * Parse the raw JSON string emitted by the `nakiros-conversation-classifier`
 * skill and normalise its snake_case keys to the camelCase shape the rest of
 * Nakiros uses. Defensive against incidental ```json … ``` wrapping that the
 * model sometimes adds despite the prompt asking otherwise.
 *
 * Throws on invalid JSON or missing required fields. The caller is expected
 * to surface the error to the UI (the run goes to `failed`).
 */

interface RawClassifierOutput {
  session_summary: string;
  language: 'fr' | 'en';
  phases: RawPhase[];
  frictions: RawFriction[];
  extracted_rules: RawRule[];
}

interface RawPhase {
  id: string;
  label: string;
  from_turn: number;
  to_turn: number;
  summary: string;
}

interface RawFriction {
  phase_id: string;
  kind: ConversationDigestFriction['kind'];
  severity: ConversationDigestFriction['severity'];
  evidence_turns: number[];
  what_happened: string;
  rule_candidate: string | null;
  scope: ConversationDigestFriction['scope'];
  confidence: number;
}

interface RawRule {
  rule: string;
  why: string;
  phase_id: string;
  target_module: ConversationDigestRule['targetModule'];
  scope: ConversationDigestRule['scope'];
  confidence: number;
}

/** Public typed shape returned by {@link parseClassifierJson}. */
export interface ParsedClassifierOutput {
  language: 'fr' | 'en';
  sessionSummary: string;
  phases: ConversationDigestPhase[];
  frictions: ConversationDigestFriction[];
  extractedRules: ConversationDigestRule[];
}

export function parseClassifierJson(raw: string): ParsedClassifierOutput {
  const trimmed = stripWrapper(raw.trim());
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    throw new Error(
      `Classifier did not emit valid JSON: ${(err as Error).message}. First 200 chars: ${trimmed.slice(0, 200)}`,
    );
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Classifier output is not an object.');
  }
  const obj = parsed as Record<string, unknown>;
  if (typeof obj['session_summary'] !== 'string') throw new Error('Missing session_summary');
  if (obj['language'] !== 'fr' && obj['language'] !== 'en') {
    throw new Error('Invalid or missing language');
  }
  if (!Array.isArray(obj['phases'])) throw new Error('Missing phases array');
  if (!Array.isArray(obj['frictions'])) throw new Error('Missing frictions array');
  if (!Array.isArray(obj['extracted_rules'])) throw new Error('Missing extracted_rules array');

  const raw_ = obj as unknown as RawClassifierOutput;
  return {
    language: raw_.language,
    sessionSummary: raw_.session_summary,
    phases: raw_.phases.map(normalizePhase),
    frictions: raw_.frictions.map(normalizeFriction),
    extractedRules: raw_.extracted_rules.map(normalizeRule),
  };
}

function stripWrapper(text: string): string {
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i;
  const match = text.match(fence);
  if (match) return match[1].trim();
  return text;
}

function normalizePhase(p: RawPhase): ConversationDigestPhase {
  return {
    id: p.id,
    label: p.label,
    fromTurn: p.from_turn,
    toTurn: p.to_turn,
    summary: p.summary,
  };
}

function normalizeFriction(f: RawFriction): ConversationDigestFriction {
  return {
    phaseId: f.phase_id,
    kind: f.kind,
    severity: f.severity,
    evidenceTurns: f.evidence_turns,
    whatHappened: f.what_happened,
    ruleCandidate: f.rule_candidate,
    scope: f.scope,
    confidence: f.confidence,
  };
}

function normalizeRule(r: RawRule): ConversationDigestRule {
  return {
    rule: r.rule,
    why: r.why,
    phaseId: r.phase_id,
    targetModule: r.target_module,
    scope: r.scope,
    confidence: r.confidence,
  };
}
