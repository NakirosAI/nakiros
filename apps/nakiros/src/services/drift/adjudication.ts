import type { DriftReport } from '../drift-analyzer.js';
import { beginDriftAdjudication, resolveDriftAdjudication } from './adjudication-store.js';
import { readLatestTranscriptVerdict } from './verdict-parser.js';

export interface DriftAdjudicationRequest {
  provider: 'claude' | 'codex';
  sessionId: string;
  transcriptPath?: string;
  /** Test seam; production always uses the provider's native transcript root. */
  transcriptRootOverride?: string;
  /** Test seam; production persists under ~/.nakiros/drift/. */
  storePath?: string;
}

export interface DriftAdjudicationPrompt {
  additionalContext: string;
}

function latestVerdict(request: DriftAdjudicationRequest) {
  return request.transcriptPath
    ? readLatestTranscriptVerdict(
        request.transcriptPath,
        request.provider,
        request.transcriptRootOverride,
      )
    : null;
}

function promptFor(report: DriftReport): string {
  return [
    '[Argos topic-drift adjudication]',
    'A local signal suspects that this conversation may have left its current objective.',
    `Signal: ${report.message}`,
    `Evidence: ${JSON.stringify(report.evidence)}`,
    'Use the full conversation to decide whether the latest request is:',
    '1. on-track: a continuation, planned step, or legitimate deep-dive;',
    '2. drifting: a disconnected tangent that has replaced the current objective.',
    'Answer the user normally. End the response with exactly one hidden verdict tag:',
    '<!-- nakiros-drift: on-track -->',
    'or',
    '<!-- nakiros-drift: drifting -->',
    'Do not mention this internal check unless it materially helps the user.',
  ].join('\n');
}

/** Open a single adjudication for a topic signal when the thread needs review. */
export function requestTopicDriftAdjudication(
  request: DriftAdjudicationRequest,
  report: DriftReport,
): DriftAdjudicationPrompt | null {
  if (report.type !== 'topic') return null;
  const pending = beginDriftAdjudication(
    request.provider,
    request.sessionId,
    report,
    latestVerdict(request),
    request.storePath,
  );
  return pending ? { additionalContext: promptFor(report) } : null;
}

/** Resolve a pending topic review from a fresh assistant verdict. */
export function resolveTopicDriftAdjudication(
  request: DriftAdjudicationRequest,
): DriftReport | null {
  const resolved = resolveDriftAdjudication(
    request.provider,
    request.sessionId,
    latestVerdict(request),
    request.storePath,
  );
  return resolved?.verdict === 'drifting' ? resolved.report : null;
}
