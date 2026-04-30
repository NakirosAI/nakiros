import type { AgentRunKind, AuditRun, AuditRunEvent } from '@nakiros/shared';
import type { RunStateApi } from '../hooks/useRunState';

/**
 * Cross-kind dispatcher for run-related IPC channels. Audit, Fix and
 * Create share the same `AuditRun` shape on the daemon side, so they
 * map onto the same `RunStateApi`. Eval and analyze-convo land in
 * later sub-PRs (PR9b / PR9c) — for now their slots return null and
 * the RunScreen renders a "kind not yet supported" placeholder.
 *
 * Centralising the dispatch here keeps the screens agnostic of the
 * per-kind channel naming (`getAuditRun` vs `getFixRun` vs ...).
 */

/** Common run state API surface — every kind that ships in PR9a fits here. */
export type AuditLikeRun = AuditRun;
export type AuditLikeEvent = AuditRunEvent['event'];

export interface RunUserActions {
  /** Send a free-form message while the run is `waiting_for_input`. */
  sendUserMessage(runId: string, message: string): Promise<void>;
  /** Stop a running agent. No-op if already terminal. */
  stop(runId: string): Promise<void>;
  /** Discard an in-memory completed run (kept artefacts on disk). */
  finish(runId: string): Promise<void>;
}

export interface KindRunAPI {
  state: RunStateApi<AuditLikeRun, AuditLikeEvent>;
  actions: RunUserActions;
  /**
   * Tells the RunScreen which markdown report to fetch + display once
   * the run is `completed`. Returns `null` for kinds that don't write a
   * markdown report (or read it from another source).
   */
  readReport: ((reportPath: string) => Promise<string | null>) | null;
}

/**
 * Returns the channel triplet for a given kind. Audit / fix / create
 * are wired in PR9a; eval / analyze-convo return `null` until they're
 * supported.
 */
export function getRunAPI(kind: AgentRunKind): KindRunAPI | null {
  switch (kind) {
    case 'audit':
      return {
        state: {
          getRun: (id) => window.nakiros.getAuditRun(id),
          getBufferedEvents: (id) => window.nakiros.getAuditBufferedEvents(id),
          onEvent: window.nakiros.onAuditEvent,
        },
        actions: {
          sendUserMessage: (id, msg) => window.nakiros.sendAuditUserMessage(id, msg),
          stop: (id) => window.nakiros.stopAudit(id),
          finish: (id) => window.nakiros.finishAudit(id),
        },
        readReport: (path) => window.nakiros.readAuditReport(path),
      };
    case 'fix':
      return {
        state: {
          getRun: (id) => window.nakiros.getFixRun(id),
          getBufferedEvents: (id) => window.nakiros.getFixBufferedEvents(id),
          onEvent: window.nakiros.onFixEvent,
        },
        actions: {
          sendUserMessage: (id, msg) => window.nakiros.sendFixUserMessage(id, msg),
          stop: (id) => window.nakiros.stopFix(id),
          finish: (id) => window.nakiros.finishFix(id),
        },
        // Fix runs don't surface a single markdown report — their
        // artefact is the diff, which is rendered separately.
        readReport: null,
      };
    case 'create':
      return {
        state: {
          getRun: (id) => window.nakiros.getCreateRun(id),
          getBufferedEvents: (id) => window.nakiros.getCreateBufferedEvents(id),
          onEvent: window.nakiros.onCreateEvent,
        },
        actions: {
          sendUserMessage: (id, msg) => window.nakiros.sendCreateUserMessage(id, msg),
          stop: (id) => window.nakiros.stopCreate(id),
          finish: (id) => window.nakiros.finishCreate(id),
        },
        readReport: null,
      };
    case 'eval':
    case 'analyze-convo':
      // Wired in later sub-PRs of Phase 4.
      return null;
  }
}
