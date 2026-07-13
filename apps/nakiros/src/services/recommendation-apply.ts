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

import { join } from 'path';
import { homedir } from 'os';

import type {
  ApplyRecoResponse,
  ApplyRecommendationContext,
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
  startCreate,
  startEdit,
  startFix,
} from './fix-runner.js';
import { readRecoCard, updateRecoStatus, writeRecoBody } from './recommendation-store.js';
import { recommendationReviewRoute } from './recommendation-route.js';

// ─── ExternalRunOpts replica ─────────────────────────────────────────────────
// Mirrors the private `ExternalRunOpts` in fix-runner.ts. Kept local to avoid
// re-exporting it from the runner (it's intentionally not public there).

interface RunOpts {
  skillDir: string;
  onEvent(event: AuditRunEvent): void;
}

// ─── Skill-dir resolution ─────────────────────────────────────────────────────

/**
 * Resolves the on-disk skill directory for a built request. Mirrors the logic
 * of `resolveSkillDir` in `handlers/skill-dir.ts` for the two scopes used by
 * recommendation runners (`nakiros-bundled` for `.claude/` expert skills and
 * `project` for project-local skills).
 *
 * This avoids importing from the `daemon/handlers/` layer into a service —
 * the logic is trivial enough to inline here.
 *
 * @param req          The start request with `scope`, `skillName`, `projectId`.
 * @param projectPath  Resolved absolute project path (needed for project scope).
 */
function resolveSkillDirFromReq(req: StartAuditRequest, projectPath: string): string {
  if (req.scope === 'nakiros-bundled') {
    return join(homedir(), '.nakiros', 'skills', req.skillName);
  }
  // project scope — skill lives in <project>/.claude/skills/<name>/
  return join(projectPath, '.claude', 'skills', req.skillName);
}

// ─── Name derivation ──────────────────────────────────────────────────────────

/**
 * Converts an arbitrary title string into a kebab-case slug suitable as a
 * filename stem or skill directory name.
 *
 * Examples: `"GitHub Infra"` → `"github-infra"`,
 *           `"Règle d'accès"` → `"regle-d-acces"`.
 *
 * Strips Latin diacritics via NFKD decomposition so accented characters
 * produce readable ASCII slugs rather than bare hyphens.
 */
function titleToKebab(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-') || 'untitled';
}

/**
 * Derives the effective target name for a card, resolving the `'new'` sentinel
 * into a real kebab-case filename when the card action is `'create'`.
 *
 * - For collection artefacts (`rules`, `subagent`, `output-style`): appends
 *   `.md` extension (e.g. `"GitHub Infra"` → `"github-infra.md"`).
 * - For `skill`: no extension (e.g. `"GitHub Infra"` → `"github-infra"`).
 * - For singleton artefacts (`claudemd`, `hook`, `permission`, `mcp`): the
 *   target field is ignored at the call site — this function returns `card.target`
 *   unchanged and the builder ignores it.
 * - For `action !== 'create'` (i.e. `'fix'`): `card.target` is already a real
 *   name, returned as-is.
 */
function deriveEffectiveTarget(card: RecoCard): string {
  if (card.action !== 'create' || card.target !== 'new') {
    return card.target;
  }
  const slug = titleToKebab(card.title);
  if (card.artifactType === 'skill') {
    return slug;
  }
  // rules, subagent, output-style — all store as .md files
  return `${slug}.md`;
}

// ─── Request builders ─────────────────────────────────────────────────────────

/**
 * Builds a {@link StartAuditRequest} for a given artefact type.
 * The `brief` parameter is forwarded into `applyRecommendation.brief` so
 * `buildFirstPrompt` in fix-runner can embed it directly in the first prompt.
 */
type ReqBuilder = (
  card: RecoCard,
  projectId: string,
  projectPath: string,
  brief: string,
) => StartAuditRequest;

/**
 * Shared helper — builds the {@link ApplyRecommendationContext} from a card +
 * brief. The `target` field is set to the derived effective name so all
 * consumers (expert skill prompt + sync-back) see the real filename, never the
 * `'new'` sentinel.
 */
function buildApplyCtx(card: RecoCard, brief: string): ApplyRecommendationContext {
  return {
    artifactType: card.artifactType,
    action: card.action,
    target: deriveEffectiveTarget(card),
    title: card.title,
    recId: card.recId,
    patternId: card.patternId,
    brief,
  };
}

/**
 * Builders per artifact type. Each builds a {@link StartAuditRequest} with the
 * correct `*Target` field populated and `applyRecommendation` set so the
 * runner emits a non-interactive first prompt directly embedding the brief.
 * Shapes come from `packages/shared/src/types/project.ts`.
 */
const EDIT_REQ_BUILDERS: Record<string, ReqBuilder> = {
  /**
   * `.claude/rules/<ruleName>` — `RulesTargetContext.ruleName` is the relative
   * filename from `.claude/rules/` (e.g. `"i18n.md"`).
   */
  rules: (card, projectId, projectPath, brief) => ({
    scope: 'nakiros-bundled',
    skillName: 'nakiros-rules-expert',
    projectId,
    rulesTarget: {
      projectId,
      projectPath,
      ruleName: deriveEffectiveTarget(card),
      mode: 'edit' as RulesRunMode,
    },
    applyRecommendation: buildApplyCtx(card, brief),
  }),

  /**
   * Root `CLAUDE.md` — `ClaudeMdTargetContext` has no name field (singleton).
   * `card.target` is ignored; there is only one CLAUDE.md per project.
   */
  claudemd: (card, projectId, projectPath, brief) => ({
    scope: 'nakiros-bundled',
    skillName: 'nakiros-claudemd-expert',
    projectId,
    claudemdTarget: {
      projectId,
      projectPath,
      mode: 'edit' as ClaudeMdRunMode,
    },
    applyRecommendation: buildApplyCtx(card, brief),
  }),

  /**
   * `.claude/agents/<subagentName>` — `SubagentsTargetContext.subagentName` is
   * the relative filename from `.claude/agents/` (e.g. `"backend.md"`).
   */
  subagent: (card, projectId, projectPath, brief) => ({
    scope: 'nakiros-bundled',
    skillName: 'nakiros-subagents-expert',
    projectId,
    subagentsTarget: {
      projectId,
      projectPath,
      subagentName: deriveEffectiveTarget(card),
      mode: 'edit' as SubagentsRunMode,
    },
    applyRecommendation: buildApplyCtx(card, brief),
  }),

  /**
   * `.claude/settings.json` hooks block — `HooksTargetContext` is singleton
   * (no name field). `card.target` is ignored.
   */
  hook: (card, projectId, projectPath, brief) => ({
    scope: 'nakiros-bundled',
    skillName: 'nakiros-hooks-expert',
    projectId,
    hooksTarget: {
      projectId,
      projectPath,
      mode: 'edit' as HooksRunMode,
    },
    applyRecommendation: buildApplyCtx(card, brief),
  }),

  /**
   * `.claude/settings.json` permissions block — `PermissionsTargetContext` has
   * `scope` (project vs local). Recommendations always target the project scope.
   */
  permission: (card, projectId, projectPath, brief) => ({
    scope: 'nakiros-bundled',
    skillName: 'nakiros-permissions-expert',
    projectId,
    permissionsTarget: {
      projectId,
      projectPath,
      scope: 'project' as PermissionsExpertScope,
      mode: 'edit' as PermissionsRunMode,
    },
    applyRecommendation: buildApplyCtx(card, brief),
  }),

  /**
   * Project-root `.mcp.json` — `McpTargetContext` is singleton (no name field).
   * `card.target` is ignored.
   */
  mcp: (card, projectId, projectPath, brief) => ({
    scope: 'nakiros-bundled',
    skillName: 'nakiros-mcp-expert',
    projectId,
    mcpTarget: {
      projectId,
      projectPath,
      mode: 'edit' as McpRunMode,
    },
    applyRecommendation: buildApplyCtx(card, brief),
  }),

  /**
   * `.claude/output-styles/<styleName>` — `OutputStylesTargetContext.styleName`
   * is the relative filename from `.claude/output-styles/`.
   */
  'output-style': (card, projectId, projectPath, brief) => ({
    scope: 'nakiros-bundled',
    skillName: 'nakiros-output-styles-expert',
    projectId,
    outputStylesTarget: {
      projectId,
      projectPath,
      styleName: deriveEffectiveTarget(card),
      mode: 'edit' as OutputStylesRunMode,
    },
    applyRecommendation: buildApplyCtx(card, brief),
  }),
};

// ─── Mapping helper ───────────────────────────────────────────────────────────

interface RunMapping {
  starter: typeof startFix | typeof startCreate | typeof startEdit;
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
      runKind: isCreate ? 'create' : 'fix',
      buildRequest: (c, projectId, _projectPath, brief) => ({
        scope: 'project',
        skillName: deriveEffectiveTarget(c),
        projectId,
        applyRecommendation: buildApplyCtx(c, brief),
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
  /** Explicit confirmation from the review surface. */
  reviewed: boolean;
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
  if (!ctx.reviewed) return { ok: false, error: 'review-required' };
  const route = recommendationReviewRoute(card);
  if (!route) return { ok: false, error: 'unknown-artifact-type' };

  // Idempotency: already applied → return the prior runId without re-spawning.
  if (card.status === 'applied' && card.appliedRunId) {
    return {
      ok: true,
      runId: card.appliedRunId,
      runKind: card.artifactType === 'skill'
        ? card.action === 'create' ? 'create' : 'fix'
        : 'edit',
      targetDomain: route.targetDomain,
    };
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

  // Pass briefToSend into the request builder so buildFirstPrompt in
  // fix-runner can embed it directly in the non-interactive first prompt.
  const req = mapping.buildRequest(card, projectId, ctx.projectPath, briefToSend);

  // Resolve the on-disk skill directory from the built request. For .claude/
  // expert runs the scope is always `nakiros-bundled` so skillDir resolves to
  // `~/.nakiros/skills/<skillName>` — the symlink target that prepareWorkdir
  // places under `<workdir>/.claude/skills/<name>` so the slash-command works.
  // ctx.skillDir is honoured when provided (e.g. from a direct API caller that
  // already resolved the path) but falls back to automatic resolution so callers
  // that only set projectPath (like the daemon handler) get a valid path.
  const skillDir = ctx.skillDir || resolveSkillDirFromReq(req, ctx.projectPath);

  const opts: RunOpts = {
    skillDir,
    onEvent: ctx.onEvent,
  };

  // Start the downstream runner. The first prompt already embeds the
  // <apply-recommendation> block — no second sendUserMessage call needed.
  const run = mapping.starter(req, opts as Parameters<typeof mapping.starter>[1]);

  // Persist the applied state so subsequent calls return idempotently.
  updateRecoStatus(projectId, patternId, recId, {
    status: 'applied',
    appliedRunId: run.runId,
  });

  return {
    ok: true,
    runId: run.runId,
    runKind: mapping.runKind,
    targetDomain: route.targetDomain,
  };
}
