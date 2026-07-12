import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import { homedir } from 'os';

import type { BootstrapEntityProposal } from '@nakiros/shared';

import { saveClaudeMd } from './claude-md-writer.js';
import { writeRuleFile } from './rules-writer.js';
import { writeSubagentFile } from './subagents-writer.js';
import { writeOutputStyleFile } from './output-styles-writer.js';
import { saveHooksBlock } from './hooks-writer.js';
import { savePermissionsBlock } from './permissions-writer.js';
import { saveMcpConfig } from './mcp-writer.js';

/**
 * Execution seam for the Project `.claude` Bootstrap feature (step 5 of
 * `docs/redesign/features/project-bootstrap.md`). Called by
 * `bootstrap-runner.ts`'s `dispatchApprovedProposals` once the user has
 * approved a plan — writes every `accepted` proposal to disk through the
 * exact same per-entity writers the sister `.claude/` experts and the V2
 * editor screens already use, per the `artifactType` × `target` × `content`
 * contract documented in
 * `apps/nakiros/bundled-skills/nakiros-project-bootstrap/references/plan-format.md`.
 *
 * No new write path: this module owns no filesystem logic of its own beyond
 * routing (plus the backup helper below) — every actual write goes through
 * `saveClaudeMd`, `writeRuleFile`, `writeSubagentFile`, `writeOutputStyleFile`,
 * `saveHooksBlock`, `savePermissionsBlock`, or `saveMcpConfig`. `writeRuleFile`
 * / `writeSubagentFile` / `writeOutputStyleFile` were extracted from their
 * respective IPC handlers (`daemon/handlers/{rules,subagents,output-styles}.ts`)
 * specifically so this module and the handler share one implementation —
 * see the "Reuse" note in each writer's own file header.
 *
 * Two genuinely different write semantics are in play here, and only one of
 * them actually merges:
 * - `hook` / `permission` — the writer merges only its own key into
 *   `.claude/settings(.local).json`, preserving every other key. Safe to
 *   call even when the file already holds other settings.
 * - `claudemd` / `mcp` — the writer replaces the ENTIRE target file
 *   (`CLAUDE.md` / `.mcp.json`). Bootstrap's "minimal config" precondition
 *   means these are usually absent or a tiny stub, but a blind whole-file
 *   replace with no existence guard would silently destroy a legitimate,
 *   non-trivial file if the precondition was ever violated (stale snapshot,
 *   race with a manual edit, …). `dispatchProposal` backs up a non-empty
 *   existing target to `~/.nakiros/<projectId>/bootstrap-backups/<runId>/<filename>`
 *   before writing — see {@link backupIfNonEmpty}.
 */

/** Outcome of writing a single proposal. */
export interface DispatchOutcome {
  status: 'written' | 'failed';
  /** Absolute path written — set only when `status === 'written'`. */
  writtenPath?: string;
  /**
   * Absolute path of a pre-existing non-empty file backed up before a
   * whole-file replace (`claudemd` / `mcp` only) — set only when a backup
   * was actually made.
   */
  backupPath?: string;
  /** Human-readable failure reason — set only when `status === 'failed'`. */
  error?: string;
}

/** Aggregate counts returned alongside the mutated proposal list. */
export interface DispatchSummary {
  /** Number of proposals that were `accepted` when dispatch started. */
  total: number;
  written: number;
  failed: number;
  /** One entry per pre-existing file backed up before a whole-file replace — see {@link DispatchOutcome.backupPath}. */
  backups: Array<{ proposalId: string; path: string }>;
}

/**
 * Back up `absolutePath` to `~/.nakiros/<projectId>/bootstrap-backups/<runId>/<filename>`
 * when it already exists and is non-empty (whitespace-only content isn't
 * worth preserving). Returns the backup path, or `null` when there was
 * nothing to back up or the backup itself failed (a failed backup attempt
 * does NOT block the write that follows — losing a safety-net copy is far
 * better than losing the ability to bootstrap at all; the caller still logs
 * the outcome via `DispatchSummary.backups`).
 */
function backupIfNonEmpty(absolutePath: string, projectId: string, runId: string): string | null {
  if (!existsSync(absolutePath)) return null;
  let content: string;
  try {
    content = readFileSync(absolutePath, 'utf8');
  } catch {
    return null;
  }
  if (content.trim().length === 0) return null;
  try {
    const backupDir = join(homedir(), '.nakiros', projectId, 'bootstrap-backups', runId);
    mkdirSync(backupDir, { recursive: true });
    const backupPath = join(backupDir, basename(absolutePath));
    writeFileSync(backupPath, content, 'utf8');
    return backupPath;
  } catch {
    return null;
  }
}

/**
 * Write one proposal via the writer matching its `artifactType`. Never
 * throws — filesystem/parse errors from the underlying writer, or an
 * unexpected exception, are all captured and returned as `{ status: 'failed' }`
 * so the caller can process every proposal independently.
 *
 * Blind writes (`mtimeAtRead: ''`) throughout: bootstrap proposals never
 * follow a prior read/edit round-trip, unlike the V2 editor screens. For
 * `rules` / `subagent` / `output-style` — genuinely new entities under the
 * feature's "minimal config" precondition — an on-disk collision is treated
 * as a failure rather than a silent overwrite (see the `existsSync` guards
 * below). For `hook` / `permission` the writer merges into the settings
 * file, preserving unrelated keys — safe regardless of prior content. For
 * `claudemd` / `mcp` the writer replaces the whole target file; a
 * pre-existing non-empty file is backed up first (see {@link backupIfNonEmpty}
 * and the file header above).
 */
export function dispatchProposal(
  projectPath: string,
  projectId: string,
  runId: string,
  proposal: BootstrapEntityProposal,
): DispatchOutcome {
  try {
    switch (proposal.artifactType) {
      case 'claudemd': {
        const writtenPath = join(projectPath, 'CLAUDE.md');
        const backupPath = backupIfNonEmpty(writtenPath, projectId, runId);
        const result = saveClaudeMd(projectPath, { body: proposal.content, mtimeAtRead: '' });
        if (!result.ok) return { status: 'failed', error: result.message };
        return { status: 'written', writtenPath, backupPath: backupPath ?? undefined };
      }

      case 'rules': {
        const writtenPath = join(projectPath, '.claude', 'rules', proposal.target);
        if (existsSync(writtenPath)) {
          return { status: 'failed', error: `Rule "${proposal.target}" already exists — bootstrap only creates new entities.` };
        }
        const result = writeRuleFile(projectPath, proposal.target, proposal.content, '');
        if (!result.ok) return { status: 'failed', error: result.message };
        return { status: 'written', writtenPath };
      }

      case 'subagent': {
        const writtenPath = join(projectPath, '.claude', 'agents', proposal.target);
        if (existsSync(writtenPath)) {
          return { status: 'failed', error: `Subagent "${proposal.target}" already exists — bootstrap only creates new entities.` };
        }
        const result = writeSubagentFile(projectPath, proposal.target, proposal.content, '');
        if (!result.ok) return { status: 'failed', error: result.message };
        return { status: 'written', writtenPath };
      }

      case 'output-style': {
        const writtenPath = join(projectPath, '.claude', 'output-styles', proposal.target);
        if (existsSync(writtenPath)) {
          return { status: 'failed', error: `Output style "${proposal.target}" already exists — bootstrap only creates new entities.` };
        }
        const result = writeOutputStyleFile(projectPath, proposal.target, proposal.content, '');
        if (!result.ok) return { status: 'failed', error: result.message };
        return { status: 'written', writtenPath };
      }

      case 'hook': {
        const result = saveHooksBlock(projectPath, proposal.content, '');
        if (!result.ok) return { status: 'failed', error: result.message };
        return { status: 'written', writtenPath: join(projectPath, '.claude', 'settings.json') };
      }

      case 'permission': {
        const scope = proposal.target === 'local' ? 'local' : 'project';
        const result = savePermissionsBlock(projectPath, scope, proposal.content, '');
        if (!result.ok) return { status: 'failed', error: result.message };
        const filename = scope === 'local' ? 'settings.local.json' : 'settings.json';
        return { status: 'written', writtenPath: join(projectPath, '.claude', filename) };
      }

      case 'mcp': {
        const writtenPath = join(projectPath, '.mcp.json');
        const backupPath = backupIfNonEmpty(writtenPath, projectId, runId);
        const result = saveMcpConfig(projectPath, proposal.content, '');
        if (!result.ok) return { status: 'failed', error: result.message };
        return { status: 'written', writtenPath, backupPath: backupPath ?? undefined };
      }

      case 'skill':
        // Out of scope for v1 — the bootstrap skill is documented to never
        // propose this artifactType, but a malformed/hand-edited plan.json
        // could still carry one. Fail explicitly rather than silently
        // dropping it (proposal stays visible to the user with the reason).
        return { status: 'failed', error: 'artifactType "skill" is not supported by bootstrap execution in v1.' };

      default:
        return { status: 'failed', error: `Unknown artifactType: ${String(proposal.artifactType)}` };
    }
  } catch (err) {
    return { status: 'failed', error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Dispatch every `accepted` proposal in a plan. Returns a new proposal array
 * (each accepted entry replaced by its `written` or `failed` outcome;
 * `rejected` / already-terminal entries pass through unchanged) plus a
 * summary for the run's final event. One failing proposal never stops the
 * rest — every accepted proposal is attempted exactly once.
 *
 * `projectId` and `runId` are only used to namespace the backup directory
 * (`~/.nakiros/<projectId>/bootstrap-backups/<runId>/`) for `claudemd` / `mcp`
 * proposals that overwrite a pre-existing non-empty file — see
 * {@link backupIfNonEmpty}.
 */
export function dispatchBootstrapPlan(
  projectPath: string,
  projectId: string,
  runId: string,
  proposals: BootstrapEntityProposal[],
): { proposals: BootstrapEntityProposal[]; summary: DispatchSummary } {
  const total = proposals.filter((p) => p.status === 'accepted').length;
  let written = 0;
  let failed = 0;
  const backups: Array<{ proposalId: string; path: string }> = [];

  const updated = proposals.map((proposal): BootstrapEntityProposal => {
    if (proposal.status !== 'accepted') return proposal;

    const outcome = dispatchProposal(projectPath, projectId, runId, proposal);
    if (outcome.backupPath) backups.push({ proposalId: proposal.id, path: outcome.backupPath });
    if (outcome.status === 'written') {
      written += 1;
      return { ...proposal, status: 'written', writtenPath: outcome.writtenPath };
    }
    failed += 1;
    return { ...proposal, status: 'failed', error: outcome.error };
  });

  return { proposals: updated, summary: { total, written, failed, backups } };
}
