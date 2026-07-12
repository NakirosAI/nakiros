/**
 * Loop drift detector.
 *
 * Analyses the last N assistant turns of a Claude Code session to detect
 * whether the agent is repeating the same tool actions without making progress.
 *
 * Four signals are tracked over the analysis window:
 *   - Edit/Write/MultiEdit on the same file  → threshold ≥ 4 turns
 *   - Bash same command + error              → threshold ≥ 3 turns (with stderr)
 *   - Grep/Glob same pattern (+ path)        → threshold ≥ 5 turns
 *   - Read same file (+ offset)              → threshold ≥ 5 turns
 *
 * Counting is per TURN, not per tool-use: a single assistant reply that edits
 * the same file four times (multi-hunk change) is normal work, not a loop.
 * Repetition only means "stuck" when it spans turns.
 *
 * The edit signal additionally requires a failure signal in the window (a
 * failed Edit/Write on that file, or any Bash error): N successful, distinct
 * edits of the same file is the normal shape of an iterative fix, not a loop.
 *
 * If at least one signature exceeds its threshold, a {@link LoopDriftResult}
 * is produced. Severity is `high` when multiple signatures fire simultaneously
 * OR any single signature exceeds its threshold by more than 50%.
 */

import type { DriftReport } from '../drift-analyzer.js';
import type { AssistantTurn } from './session-loader.js';

// ── Configuration ──────────────────────────────────────────────────────────────

/** Number of the most-recent assistant turns to examine. */
const WINDOW_SIZE = 12;

/**
 * Minimum number of assistant turns required before the detector can fire.
 * Sessions with fewer turns are too young to judge.
 */
const MIN_TURNS_REQUIRED = 8;

/** Signals and their individual thresholds. */
const SIGNALS = {
  editSameFile: { label: 'Edit', threshold: 4 },
  bashSameCommandWithError: { label: 'Bash (erreur)', threshold: 3 },
  grepSamePattern: { label: 'Grep/Glob', threshold: 5 },
  readSameFile: { label: 'Read', threshold: 5 },
} as const;

type SignalKey = keyof typeof SIGNALS;

// ── Internal helpers ───────────────────────────────────────────────────────────

/** Normalise a Bash command string: trim + collapse internal whitespace. */
function normaliseCmd(cmd: string): string {
  return cmd.trim().replace(/\s+/g, ' ');
}

/**
 * Extract the canonical signature key for a tool-use event.
 * Returns `null` for tools that are not tracked by the loop detector.
 */
function getSignatureKey(
  tool: string,
  input: Record<string, unknown>,
  hasError: boolean,
): { signal: SignalKey; key: string } | null {
  switch (tool) {
    case 'Edit':
    case 'Write':
    case 'MultiEdit': {
      const fp = input['file_path'] as string | undefined;
      if (!fp) return null;
      return { signal: 'editSameFile', key: fp };
    }
    case 'Bash': {
      if (!hasError) return null; // only track commands that errored
      const cmd = input['command'] as string | undefined;
      if (!cmd) return null;
      return { signal: 'bashSameCommandWithError', key: normaliseCmd(cmd) };
    }
    case 'Grep':
    case 'Glob': {
      const pattern = input['pattern'] as string | undefined;
      if (!pattern) return null;
      // Same pattern over different paths is normal exploration — only the
      // exact same search repeated counts.
      const path = (input['path'] as string | undefined) ?? '';
      return { signal: 'grepSamePattern', key: `${pattern}::${path}` };
    }
    case 'Read': {
      const fp = input['file_path'] as string | undefined;
      if (!fp) return null;
      // Chunked reads of a large file (offset/limit sweeps) are one logical
      // read, not a loop — keying on offset keeps them distinct.
      const offset = (input['offset'] as number | undefined) ?? 0;
      return { signal: 'readSameFile', key: `${fp}#${offset}` };
    }
    default:
      return null;
  }
}

/** Human-readable label for a triggered signature, used in the FR message. */
function formatEvidenceLabel(signal: SignalKey, key: string): string {
  switch (signal) {
    case 'editSameFile':
      return `tours modifiant \`${key}\``;
    case 'bashSameCommandWithError':
      return `exécutions en erreur de \`${key.slice(0, 60)}${key.length > 60 ? '…' : ''}\``;
    case 'grepSamePattern':
      // Key is `pattern::path` — show only the pattern part.
      return `recherches du pattern \`${key.split('::')[0]}\``;
    case 'readSameFile':
      // Key is `file#offset` — show only the file part.
      return `lectures de \`${key.replace(/#\d+$/, '')}\``;
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * One triggered signature in a loop drift report.
 */
export interface TriggeredSignature {
  /** Human-readable label: "<tool>:<key>" */
  signature: string;
  /** Number of occurrences found in the window. */
  count: number;
  /** The threshold that was exceeded. */
  threshold: number;
}

/**
 * Analyse the last {@link WINDOW_SIZE} assistant turns for loop patterns.
 *
 * @param allTurns - The full ordered list of assistant turns for the session,
 *   as returned by {@link loadSessionTurns}.
 * @returns A {@link DriftReport} when loop drift is detected, `null` otherwise.
 */
export function detectLoop(allTurns: AssistantTurn[]): DriftReport | null {
  // Guard: not enough data yet.
  if (allTurns.length < MIN_TURNS_REQUIRED) return null;

  // Work on the last WINDOW_SIZE turns only.
  const window = allTurns.slice(-WINDOW_SIZE);

  // Count occurrences for each (signal, key) pair — at most once per turn.
  // A single reply that edits (or reads, or greps) the same target several
  // times is one action from the loop point of view, not N.
  const counts = new Map<`${SignalKey}::${string}`, { signal: SignalKey; key: string; count: number }>();
  // Failure signals used to qualify the edit signal: files whose Edit/Write
  // errored at least once, and whether any Bash command errored in the window.
  const editErrorFiles = new Set<string>();
  let windowHasBashError = false;

  for (const turn of window) {
    const seenThisTurn = new Set<string>();
    for (const tu of turn.toolUses) {
      if (tu.tool === 'Bash' && tu.hasError) windowHasBashError = true;
      const match = getSignatureKey(tu.tool, tu.input, tu.hasError);
      if (!match) continue;
      if (match.signal === 'editSameFile' && tu.hasError) editErrorFiles.add(match.key);
      const mapKey = `${match.signal}::${match.key}` as const;
      if (seenThisTurn.has(mapKey)) continue;
      seenThisTurn.add(mapKey);
      const existing = counts.get(mapKey);
      if (existing) {
        existing.count++;
      } else {
        counts.set(mapKey, { signal: match.signal, key: match.key, count: 1 });
      }
    }
  }

  // Identify signatures that exceed their threshold.
  const triggered: TriggeredSignature[] = [];
  for (const { signal, key, count } of counts.values()) {
    const threshold = SIGNALS[signal].threshold;
    if (count < threshold) continue;
    // Repeated successful edits with no failure in sight is the normal shape
    // of an iterative multi-step change — only alert when something failed.
    if (signal === 'editSameFile' && !editErrorFiles.has(key) && !windowHasBashError) {
      continue;
    }
    triggered.push({
      signature: `${SIGNALS[signal].label}:${key}`,
      count,
      threshold,
    });
  }

  if (triggered.length === 0) return null;

  // Determine severity.
  const hasMultiple = triggered.length > 1;
  const hasHighOvershoot = triggered.some(
    ({ count, threshold }) => count > threshold * 1.5,
  );
  const severity: 'high' | 'medium' =
    hasMultiple || hasHighOvershoot ? 'high' : 'medium';

  // Build the human-readable message from the worst offender.
  const worst = triggered.reduce((a, b) => (a.count >= b.count ? a : b));

  // Extract signal key from "Label:key" signature — the key is after the first colon.
  const worstSignalEntry = Array.from(counts.values()).find(
    (c) => `${SIGNALS[c.signal].label}:${c.key}` === worst.signature,
  );
  const worstLabel = worstSignalEntry
    ? formatEvidenceLabel(worstSignalEntry.signal, worstSignalEntry.key)
    : worst.signature;

  const message =
    `Nakiros a détecté que tu sembles tourner en rond : ` +
    `${worst.count} ${worstLabel} sur ${WINDOW_SIZE} tours.`;

  return {
    type: 'loop',
    severity,
    message,
    suggestion:
      "Essaie /clear et reformule l'objectif, ou ouvre une nouvelle session.",
    evidence: {
      window: WINDOW_SIZE,
      totalTurns: allTurns.length,
      triggered,
    },
  };
}
