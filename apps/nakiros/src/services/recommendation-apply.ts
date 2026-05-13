/**
 * Translate a {@link RecoCard} into a `startFix` / `startCreate` / `startEdit`
 * call against the existing downstream runners. Sends the card's `brief` as
 * the first user message so the agent receives the recommendation verbatim.
 *
 * The downstream runners take a {@link StartAuditRequest}. Each `.claude/`
 * artefact has its own optional `*Target` field — we set the one matching
 * `card.artifactType`. Only the mode `'edit'` is used for all fix actions on
 * `.claude/` artefacts (the expert skill's "edit" mode performs targeted
 * improvement). For skills, `startFix` is the natural entry point.
 */

import type {
  ApplyRecoResponse,
  AuditRunEvent,
  ClaudeMdRunMode,
  HooksRunMode,
  McpRunMode,
  OutputStylesRunMode,
  PermissionsExpertScope,
  PermissionsRunMode,
  RecoCard,
  RulesRunMode,
  StartAuditRequest,
  SubagentsRunMode,
} from '@nakiros/shared';

import {
  sendEditUserMessage,
  sendFixUserMessage,
  sendCreateUserMessage,
  startCreate,
  startEdit,
  startFix,
} from './fix-runner.js';
import { readRecoCard, updateRecoStatus, writeRecoBody } from './recommendation-store.js';

// ─── ExternalRunOpts replica ─────────────────────────────────────────────────
// Mirrors the private `ExternalRunOpts` in fix-runner.ts. Kept local to avoid
// re-exporting it from the runner (it's intentionally not public there).

interface RunOpts {
  skillDir: string;
  onEvent(event: AuditRunEvent): void;
}

// ─── Request builders ─────────────────────────────────────────────────────────

type ReqBuilder = (
  card: RecoCard,
  projectId: string,
  projectPath: string,
) => StartAuditRequest;

/**
 * Builders per artifact type. Each builds a {@link StartAuditRequest} with the
 * correct `*Target` field populated. Shapes come from `packages/shared/src/types/project.ts`.
 */
const EDIT_REQ_BUILDERS: Record<string, ReqBuilder> = {
  /**
   * `.claude/rules/<ruleName>` — `RulesTargetContext.ruleName` is the relative
   * filename from `.claude/rules/` (e.g. `"i18n.md"`).
   */
  rules: (card, projectId, projectPath) => ({
    scope: 'nakiros-bundled',
    skillName: 'nakiros-rules-expert',
    projectId,
    rulesTarget: {
      projectId,
      projectPath,
      ruleName: card.target,
      mode: 'edit' as RulesRunMode,
    },
  }),

  /**
   * Root `CLAUDE.md` — `ClaudeMdTargetContext` has no name field (singleton).
   * `card.target` is ignored; there is only one CLAUDE.md per project.
   */
  claudemd: (_card, projectId, projectPath) => ({
    scope: 'nakiros-bundled',
    skillName: 'nakiros-claudemd-expert',
    projectId,
    claudemdTarget: {
      projectId,
      projectPath,
      mode: 'edit' as ClaudeMdRunMode,
    },
  }),

  /**
   * `.claude/agents/<subagentName>` — `SubagentsTargetContext.subagentName` is
   * the relative filename from `.claude/agents/` (e.g. `"backend.md"`).
   */
  subagent: (card, projectId, projectPath) => ({
    scope: 'nakiros-bundled',
    skillName: 'nakiros-subagents-expert',
    projectId,
    subagentsTarget: {
      projectId,
      projectPath,
      subagentName: card.target,
      mode: 'edit' as SubagentsRunMode,
    },
  }),

  /**
   * `.claude/settings.json` hooks block — `HooksTargetContext` is singleton
   * (no name field). `card.target` is ignored.
   */
  hook: (_card, projectId, projectPath) => ({
    scope: 'nakiros-bundled',
    skillName: 'nakiros-hooks-expert',
    projectId,
    hooksTarget: {
      projectId,
      projectPath,
      mode: 'edit' as HooksRunMode,
    },
  }),

  /**
   * `.claude/settings.json` permissions block — `PermissionsTargetContext` has
   * `scope` (project vs local). Recommendations always target the project scope.
   */
  permission: (_card, projectId, projectPath) => ({
    scope: 'nakiros-bundled',
    skillName: 'nakiros-permissions-expert',
    projectId,
    permissionsTarget: {
      projectId,
      projectPath,
      scope: 'project' as PermissionsExpertScope,
      mode: 'edit' as PermissionsRunMode,
    },
  }),

  /**
   * Project-root `.mcp.json` — `McpTargetContext` is singleton (no name field).
   * `card.target` is ignored.
   */
  mcp: (_card, projectId, projectPath) => ({
    scope: 'nakiros-bundled',
    skillName: 'nakiros-mcp-expert',
    projectId,
    mcpTarget: {
      projectId,
      projectPath,
      mode: 'edit' as McpRunMode,
    },
  }),

  /**
   * `.claude/output-styles/<styleName>` — `OutputStylesTargetContext.styleName`
   * is the relative filename from `.claude/output-styles/`.
   */
  'output-style': (card, projectId, projectPath) => ({
    scope: 'nakiros-bundled',
    skillName: 'nakiros-output-styles-expert',
    projectId,
    outputStylesTarget: {
      projectId,
      projectPath,
      styleName: card.target,
      mode: 'edit' as OutputStylesRunMode,
    },
  }),
};

// ─── Mapping helper ───────────────────────────────────────────────────────────

interface RunMapping {
  starter: typeof startFix | typeof startCreate | typeof startEdit;
  sender: typeof sendFixUserMessage | typeof sendCreateUserMessage | typeof sendEditUserMessage;
  runKind: 'fix' | 'create' | 'edit';
  buildRequest: ReqBuilder;
}

/**
 * Determine which downstream runner and starter to use for a given card.
 * Returns `null` when `artifactType` is unknown — the caller should surface a
 * `'unknown-artifact-type'` error.
 */
function mappingFor(card: RecoCard): RunMapping | null {
  if (card.artifactType === 'skill') {
    // Skills use startFix (action=fix) or startCreate (action=create).
    const isCreate = card.action === 'create';
    return {
      starter: isCreate ? startCreate : startFix,
      sender: isCreate ? sendCreateUserMessage : sendFixUserMessage,
      runKind: isCreate ? 'create' : 'fix',
      buildRequest: (c, projectId) => ({
        scope: 'project',
        skillName: c.target === 'new' ? '__new__' : c.target,
        projectId,
      }),
    };
  }

  const build = EDIT_REQ_BUILDERS[card.artifactType];
  if (!build) return null;

  // All .claude/ artefacts use startEdit regardless of action — the "edit"
  // mode inside the expert skill is the correct entry point for improvements
  // recommended from friction analysis.
  return {
    starter: startEdit,
    sender: sendEditUserMessage,
    runKind: 'edit',
    buildRequest: build,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Context supplied by the daemon handler when calling {@link applyReco}. */
export interface ApplyRecoCtx {
  /** Absolute path to the project root on disk. */
  projectPath: string;
  /**
   * Optional user-edited brief. When provided and different from the stored
   * `card.brief`, the markdown body is updated before applying so the agent
   * receives the revised version.
   */
  editedBrief?: string;
  /** Forwarded to the downstream runner as `onEvent`. */
  onEvent: (event: AuditRunEvent) => void;
  /**
   * On-disk skill directory for skill-scoped runs. Empty string for `.claude/`
   * artefact runs (runner ignores `skillDir` when a `*Target` field is set).
   */
  skillDir?: string;
}

/**
 * Translate a {@link RecoCard} into a downstream runner call and return the
 * resulting `runId` plus `runKind` so the caller can track the spawned run.
 *
 * Idempotent when the card is already `'applied'` — returns the prior `runId`
 * without re-spawning.
 *
 * @param projectId  The project this card belongs to.
 * @param patternId  The friction pattern the card was derived from.
 * @param recId      The card's own identifier.
 * @param ctx        Caller-resolved context (projectPath, editedBrief, onEvent).
 * @returns          An {@link ApplyRecoResponse} indicating success or the
 *                   failure reason.
 */
export async function applyReco(
  projectId: string,
  patternId: string,
  recId: string,
  ctx: ApplyRecoCtx,
): Promise<ApplyRecoResponse> {
  const card = readRecoCard(projectId, patternId, recId);
  if (!card) return { ok: false, error: 'reco-not-found' };

  // Idempotency: already applied → return the prior runId without re-spawning.
  if (card.status === 'applied' && card.appliedRunId) {
    return { ok: true, runId: card.appliedRunId, runKind: 'edit' };
  }

  const mapping = mappingFor(card);
  if (!mapping) return { ok: false, error: 'unknown-artifact-type' };

  // Persist edited brief if the user changed it before applying.
  const briefToSend = (ctx.editedBrief ?? card.brief).trim();
  if (!briefToSend) return { ok: false, error: 'reco-not-found' };

  if (ctx.editedBrief !== undefined && ctx.editedBrief.trim() !== card.brief.trim()) {
    // Replace the "## Brief" section body in the stored markdown.
    const newBody = card.body.replace(
      /(## Brief\s*\n)([\s\S]*?)(\n## )/,
      `$1${ctx.editedBrief}\n$3`,
    );
    writeRecoBody(projectId, patternId, recId, newBody);
  }

  const req = mapping.buildRequest(card, projectId, ctx.projectPath);

  const opts: RunOpts = {
    skillDir: ctx.skillDir ?? '',
    onEvent: ctx.onEvent,
  };

  // Start the downstream runner. Returns synchronously with a run handle.
  const run = mapping.starter(req, opts as Parameters<typeof mapping.starter>[1]);

  // Immediately send the brief as the first user message so the agent
  // receives the recommendation without any manual user interaction.
  await mapping.sender(run.runId, briefToSend, opts as Parameters<typeof sendFixUserMessage>[2]);

  // Persist the applied state so subsequent calls return idempotently.
  updateRecoStatus(projectId, patternId, recId, {
    status: 'applied',
    appliedRunId: run.runId,
  });

  return { ok: true, runId: run.runId, runKind: mapping.runKind };
}
