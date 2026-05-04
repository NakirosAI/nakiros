import type { AgentRunKind, AuditRun, ClassifyConvoRun } from '@nakiros/shared';
import type { AuditLikeRun } from './run-api';

/**
 * Format an ISO timestamp into a compact, locale-aware string suitable for
 * audit history labels, picker pills, and sidebar timestamps.
 * Extracted here so `AuditHistoryPicker` and `ClaudeMdScreen` share the same
 * format — no duplicates.
 */
export function formatAuditTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const date = d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const time = d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${date} ${time}`;
}

/**
 * Centralised display strings for an agent run. Used by every UI surface
 * that has to render a run's title / label / sandbox-noun (RunScreen header,
 * NewRunHeader, RunDock, AuditCompletedReport, reject prompts).
 *
 * Single source of truth so a CLAUDE.md run never displays "Create skill"
 * and a skill run never displays "CLAUDE.md sandbox". Add a new run target
 * here when introducing one — the surface code stays untouched.
 */

export interface RunDisplayContext {
  /** Long-form title for headers + tab labels. Always carries the action verb. */
  title: string;
  /** Short label for the kind chip (ex "Audit", "Audit CLAUDE.md", "Fix CLAUDE.md"). */
  kindLabel: string;
  /** Bare action verb localised for the current run kind. */
  actionVerb: 'Audit' | 'Fix' | 'Create' | 'Eval' | 'Analyze' | 'Classify';
  /** What the run operates on, in user-facing prose. */
  targetNoun: 'skill' | 'CLAUDE.md' | 'conversation';
  /**
   * `true` when this run targets a CLAUDE.md via the bundled expert. UI
   * surfaces use this to hide skill-only actions (eval, sync-back, etc.).
   */
  isClaudemd: boolean;
  /** Always `'CLAUDE.md'` when isClaudemd, otherwise null. */
  scopeLabel: string | null;
}

const ACTION_BY_KIND: Record<AgentRunKind, RunDisplayContext['actionVerb']> = {
  audit: 'Audit',
  fix: 'Fix',
  create: 'Create',
  eval: 'Eval',
  'analyze-convo': 'Analyze',
  'classify-convo': 'Classify',
};

/** Build the display context for a run. Pure — safe to call inline. */
export function runDisplayContext(
  kind: AgentRunKind,
  run: AuditLikeRun,
): RunDisplayContext {
  const actionVerb = ACTION_BY_KIND[kind] ?? 'Audit';

  // CLAUDE.md target — applies to audit / fix / create with claudemdTarget.
  // Only the project-root CLAUDE.md is supported (no multi-scope).
  if ('claudemdTarget' in run && run.claudemdTarget) {
    return {
      title: `${actionVerb} · CLAUDE.md`,
      kindLabel: `${actionVerb} CLAUDE.md`,
      actionVerb,
      targetNoun: 'CLAUDE.md',
      isClaudemd: true,
      scopeLabel: 'CLAUDE.md',
    };
  }

  // Conversation target — classify-convo / analyze-convo.
  if (kind === 'classify-convo') {
    const sid = (run as ClassifyConvoRun).sourceSessionId ?? '';
    return {
      title: `${actionVerb} · ${sid.slice(0, 8)}`,
      kindLabel: actionVerb,
      actionVerb,
      targetNoun: 'conversation',
      isClaudemd: false,
      scopeLabel: null,
    };
  }

  // Skill target — audit / fix / create / eval default.
  const auditRun = run as AuditRun;
  const skillName = auditRun.skillName ?? '';
  return {
    title: skillName ? `${actionVerb} · ${skillName}` : actionVerb,
    kindLabel: actionVerb,
    actionVerb,
    targetNoun: 'skill',
    isClaudemd: false,
    scopeLabel: null,
  };
}
