import type {
  AgentRunKind,
  AuditRun,
  AuditRunEvent,
  ClassifyConvoRun,
  ClassifyConvoRunEvent,
} from '@nakiros/shared';
import type { RunStateApi } from '../hooks/useRunState';

/**
 * Cross-kind dispatcher for run-related IPC channels. Audit, Fix and
 * Create share the same `AuditRun` shape on the daemon side, so they
 * map onto the same `RunStateApi`. The V1.1 friction classifier
 * (`classify-convo`) reuses the same RunScreen pipeline via a wider
 * `AuditLikeRun` union — its terminal artefact is a `ConversationDigest`
 * rendered through {@link DigestView}, not a markdown report.
 *
 * Eval and analyze-convo still land in later sub-PRs (PR9b / PR9c) —
 * for now their slots return null and the RunScreen renders a
 * "kind not yet supported" placeholder.
 */

/**
 * Common run state API surface. The runner-core gives every kind a
 * `BaseRun`-shaped object — fields specific to one kind (audit's
 * `manifest` / `checkResults` / `targets`, classify-convo's
 * `digestPath`) are narrowed at the call site by `runKind`.
 */
export type AuditLikeRun = AuditRun | ClassifyConvoRun;
export type AuditLikeEvent = AuditRunEvent['event'] | ClassifyConvoRunEvent['event'];

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
    case 'edit':
      return {
        state: {
          getRun: (id) => window.nakiros.getEditRun(id),
          getBufferedEvents: (id) => window.nakiros.getEditBufferedEvents(id),
          onEvent: window.nakiros.onEditEvent,
        },
        actions: {
          sendUserMessage: (id, msg) => window.nakiros.sendEditUserMessage(id, msg),
          stop: (id) => window.nakiros.stopEdit(id),
          finish: (id) => window.nakiros.finishEdit(id),
        },
        // Edit runs don't write a markdown report — their artefact is the diff,
        // rendered by the existing SkillDiffView (same as fix/create).
        readReport: null,
      };
    case 'eval':
    case 'analyze-convo':
      // Wired in later sub-PRs of Phase 4.
      return null;
    case 'classify-convo':
      return {
        state: {
          getRun: (id) => window.nakiros.getClassifyConvoRun(id),
          getBufferedEvents: (id) => window.nakiros.getClassifyConvoBufferedEvents(id),
          onEvent: window.nakiros.onClassifyConvoEvent,
        },
        actions: {
          sendUserMessage: (id, msg) => window.nakiros.sendClassifyConvoUserMessage(id, msg),
          stop: (id) => window.nakiros.stopClassifyConvo(id),
          finish: (id) => window.nakiros.finishClassifyConvo(id),
        },
        // classify-convo's terminal artefact is a structured `ConversationDigest`
        // rendered via `DigestView`, not a markdown report. The RunScreen swaps
        // its terminal panel based on `runKind === 'classify-convo'`.
        readReport: null,
      };
  }
}
