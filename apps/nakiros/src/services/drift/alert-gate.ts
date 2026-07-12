/**
 * Per-session drift alert gate.
 *
 * The drift detectors are stateless: they recompute their verdict from the
 * session JSONL on every hook call (each UserPromptSubmit and each Stop). Once
 * a signature crosses its threshold it stays in the sliding window for many
 * turns, so without a gate the SAME alert is re-emitted on every prompt until
 * the window finally slides past it — the "never reset" bug.
 *
 * This module remembers, in daemon memory, what was last alerted per session
 * and suppresses repeats:
 *
 *   - `loop`    → re-emit only when a triggered signature is NEW or its count
 *                 has GROWN since the last alert (fresh occurrences happened),
 *                 or when the window has fully renewed (`totalTurns` advanced
 *                 by more than the analysis window since the last alert).
 *   - `topic` / `context` → re-emit only when `transitionsDetected` has grown,
 *                 or after {@link REALERT_NEW_MESSAGES} new user messages.
 *
 * State is in-memory only: a daemon restart forgets past alerts, which at
 * worst re-shows one banner — acceptable. A second hook querying the same
 * daemon for the same session (e.g. Stop right after UserPromptSubmit) is
 * naturally deduped: the first call consumes the alert, the second gets null.
 */

import type { DriftReport } from '../drift-analyzer.js';
import type { TriggeredSignature } from './loop-detector.js';

// ── Configuration ─────────────────────────────────────────────────────────────

/**
 * For loop alerts: number of turns after which the analysis window has fully
 * renewed and a still-triggered signature is made of entirely new events.
 * Must stay > the loop detector's WINDOW_SIZE (12).
 */
const REALERT_WINDOW_TURNS = 15;

/** For topic/context alerts: user messages required before re-alerting. */
const REALERT_NEW_MESSAGES = 6;

/** Max sessions tracked before evicting the oldest entries (FIFO). */
const MAX_TRACKED_SESSIONS = 200;

// ── State ─────────────────────────────────────────────────────────────────────

interface SessionAlertState {
  type: DriftReport['type'];
  /** `evidence.totalTurns` at alert time (loop alerts). */
  totalTurns: number;
  /** Per-signature counts at alert time (loop alerts). */
  signatureCounts: Map<string, number>;
  /** `evidence.transitionsDetected` at alert time (topic/context alerts). */
  transitions: number;
  /** `evidence.userMessageCount` at alert time (topic/context alerts). */
  userMessageCount: number;
}

const stateBySession = new Map<string, SessionAlertState>();

function remember(sessionId: string, report: DriftReport): void {
  // FIFO eviction keeps the map bounded; Map preserves insertion order.
  if (!stateBySession.has(sessionId) && stateBySession.size >= MAX_TRACKED_SESSIONS) {
    const oldest = stateBySession.keys().next().value;
    if (oldest !== undefined) stateBySession.delete(oldest);
  }
  const ev = report.evidence;
  const signatureCounts = new Map<string, number>();
  if (Array.isArray(ev['triggered'])) {
    for (const t of ev['triggered'] as TriggeredSignature[]) {
      signatureCounts.set(t.signature, t.count);
    }
  }
  stateBySession.set(sessionId, {
    type: report.type,
    totalTurns: typeof ev['totalTurns'] === 'number' ? ev['totalTurns'] : 0,
    signatureCounts,
    transitions: typeof ev['transitionsDetected'] === 'number' ? ev['transitionsDetected'] : 0,
    userMessageCount: typeof ev['userMessageCount'] === 'number' ? ev['userMessageCount'] : 0,
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Decide whether a freshly computed drift report should actually be surfaced
 * to the user, given what was already alerted for this session. Records the
 * report when it passes. Pass-through (with recording) for `null` — a session
 * whose drift resolved gets a clean slate.
 *
 * @param sessionId - Claude Code session the report was computed for.
 * @param report - The detector output for this hook call, or `null`.
 * @returns The report when it should be surfaced, `null` when suppressed.
 */
export function gateDriftAlert(sessionId: string, report: DriftReport | null): DriftReport | null {
  if (!report) {
    // Drift cleared on its own — forget the session so the next genuine
    // detection alerts immediately.
    stateBySession.delete(sessionId);
    return null;
  }

  const prev = stateBySession.get(sessionId);
  if (!prev || prev.type !== report.type) {
    remember(sessionId, report);
    return report;
  }

  const ev = report.evidence;

  if (report.type === 'loop') {
    const totalTurns = typeof ev['totalTurns'] === 'number' ? ev['totalTurns'] : 0;
    if (totalTurns - prev.totalTurns > REALERT_WINDOW_TURNS) {
      remember(sessionId, report);
      return report;
    }
    const triggered = Array.isArray(ev['triggered'])
      ? (ev['triggered'] as TriggeredSignature[])
      : [];
    const hasFreshActivity = triggered.some((t) => {
      const prevCount = prev.signatureCounts.get(t.signature);
      return prevCount === undefined || t.count > prevCount;
    });
    if (hasFreshActivity) {
      remember(sessionId, report);
      return report;
    }
    return null;
  }

  // topic / context
  const transitions = typeof ev['transitionsDetected'] === 'number' ? ev['transitionsDetected'] : 0;
  const userMessageCount = typeof ev['userMessageCount'] === 'number' ? ev['userMessageCount'] : 0;
  if (
    transitions > prev.transitions ||
    userMessageCount - prev.userMessageCount >= REALERT_NEW_MESSAGES
  ) {
    remember(sessionId, report);
    return report;
  }
  return null;
}

/** Reset all gate state — test helper. */
export function resetDriftAlertGate(): void {
  stateBySession.clear();
}
