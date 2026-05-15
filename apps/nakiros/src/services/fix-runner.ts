import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'fs';
import type { Dirent } from 'fs';
import { dirname, join, relative } from 'path';
import { homedir } from 'os';

import type {
  AuditRun,
  AuditRunEvent,
  EvalRunEvent,
  EvalRunStatus,
  FixEdit,
  FixEvalResult,
  FixFinding,
  FixTarget,
  FixTargetEntry,
  FixTimelineEntry,
  FixUsage,
  SkillDiffEntry,
  SkillDiffFilePayload,
  StartAuditRequest,
} from '@nakiros/shared';
import { IPC_CHANNELS } from '@nakiros/shared';

import { eventBus } from '../daemon/event-bus.js';
import { getRun as getEvalRun } from './eval-runner.js';
import { getEffectiveLanguage } from './preferences.js';

import { formatTool } from './runner-core/tool-format.js';

import {
  cleanupRunWorkdir,
  computeSessionUsage,
  createRunner,
  encodeProjectPath,
  isActiveRunStatus,
  persistRunJson,
  type RehydrateResult,
  type RunEntry,
  type RunOpts,
  type RunnerSpec,
  writeExecutionSettings,
} from './runner-core/index.js';
import { buildDotClaudeSnapshot } from './dot-claude-snapshot-builder.js';
import { listClaudemdAudits } from './claudemd-audit-history.js';
import { rulesAuditArchiveDir, listRulesAudits } from './rules-audit-history.js';
import { subagentsAuditArchiveDir, listSubagentsAudits } from './subagents-audit-history.js';
import { hooksAuditArchiveDir, listHooksAudits } from './hooks-audit-history.js';
import { permissionsAuditArchiveDir, listPermissionsAudits } from './permissions-audit-history.js';
import { mcpAuditArchiveDir, listMcpAudits } from './mcp-audit-history.js';
import { listOutputStylesAudits } from './output-styles-audit-history.js';
import { readHooksBlock, saveHooksBlock } from './hooks-writer.js';
import { readPermissionsBlock, savePermissionsBlock } from './permissions-writer.js';

const FACTORY_SKILL_NAME = 'nakiros-skill-factory';
const CLAUDEMD_EXPERT_SKILL_NAME = 'nakiros-claudemd-expert';
const RULES_EXPERT_SKILL_NAME = 'nakiros-rules-expert';
const SUBAGENTS_EXPERT_SKILL_NAME = 'nakiros-subagents-expert';
const HOOKS_EXPERT_SKILL_NAME = 'nakiros-hooks-expert';
const PERMISSIONS_EXPERT_SKILL_NAME = 'nakiros-permissions-expert';
const MCP_EXPERT_SKILL_NAME = 'nakiros-mcp-expert';
const OUTPUT_STYLES_EXPERT_SKILL_NAME = 'nakiros-output-styles-expert';

/**
 * Three flavors of skill-factory-driven runs:
 * - `fix`    : the skill exists; copy it into a temp workdir, let the agent edit,
 *              sync back to the existing location on confirmation.
 * - `create` : the skill does NOT exist yet; start the agent with an empty temp
 *              workdir, sync back to the target location only if it still doesn't
 *              exist (to avoid clobbering).
 * - `edit`   : user-driven interactive editing of an existing entity (skill or
 *              .claude/ config). Same sandbox seeding as `fix` but NO audit
 *              findings — the user's chat is the spec. The agent waits for the
 *              user's first message describing what to change.
 *
 * All three share the same runtime machinery via `createRunner`. They differ
 * only in workdir seeding, first-turn prompt, and sync-back policy.
 */
export type SkillAgentMode = 'fix' | 'create' | 'edit';

interface SkillAgentExtras {
  mode: SkillAgentMode;
  /** Real skill directory (not the temp workdir) — used for the sync-back on finish. */
  realSkillDir: string;
  /** Cached during prepareWorkdir so buildFirstPrompt can reference them. */
  latestAuditFile?: string | null;
  latestIteration?: number | null;
  /**
   * Polling timer that re-reads `outputs/fix-targets.jsonl` +
   * `outputs/fix-findings.jsonl` while the run is in flight. Started in
   * `afterStart`, self-arrests on terminal status, also cleared by
   * `cleanupOnTerminal`. NOT persisted to `run.json` (rebuilt at boot).
   */
  syncTimer?: NodeJS.Timeout | null;
  /**
   * Number of lines already consumed from `outputs/fix-targets.jsonl`. Each
   * poll tick we read the file, slice from this index, and update the
   * reduced {@link FixTarget} list on the run. NOT persisted — recomputed at
   * boot from the existing `run.targets` length is fine because the agent
   * only appends new lines after the daemon resumes.
   */
  targetsLineCount?: number;
}

/** Internal start request — `StartAuditRequest` + the resolved skill dir + mode. */
interface SkillAgentStartReq extends StartAuditRequest {
  skillDir: string;
  mode: SkillAgentMode;
}

type FixEvent = AuditRunEvent['event'];
type FixEntry = RunEntry<AuditRun, FixEvent, SkillAgentExtras>;

function tempRoot(): string {
  return join(homedir(), '.nakiros', 'tmp-skills');
}

// ─── Filesystem helpers ─────────────────────────────────────────────────────

/** Recursively copy `src` to `dest`. No filtering — caller decides what to pass in. */
function copyDirRecursive(src: string, dest: string): void {
  let entries: Dirent[];
  try {
    entries = readdirSync(src, { withFileTypes: true }) as Dirent[];
  } catch {
    return;
  }
  mkdirSync(dest, { recursive: true });
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) copyDirRecursive(srcPath, destPath);
    else if (entry.isFile()) writeFileSync(destPath, readFileSync(srcPath));
  }
}

/**
 * Copy the skill's SOURCE material into the temp workdir, skipping `audits/`
 * and `evals/workspace/` at the top level (those are handled selectively by
 * `copyLatestAudit` / `copyLatestIteration` to avoid bloat).
 */
function copySkillSourceForFix(src: string, dest: string): void {
  let entries: Dirent[];
  try {
    entries = readdirSync(src, { withFileTypes: true }) as Dirent[];
  } catch {
    return;
  }
  mkdirSync(dest, { recursive: true });
  for (const entry of entries) {
    if (entry.name === 'audits') continue;
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'evals') copyEvalsWithoutWorkspace(srcPath, destPath);
      else copyDirRecursive(srcPath, destPath);
    } else if (entry.isFile()) {
      writeFileSync(destPath, readFileSync(srcPath));
    }
  }
}

function copyEvalsWithoutWorkspace(src: string, dest: string): void {
  let entries: Dirent[];
  try {
    entries = readdirSync(src, { withFileTypes: true }) as Dirent[];
  } catch {
    return;
  }
  mkdirSync(dest, { recursive: true });
  for (const entry of entries) {
    if (entry.name === 'workspace') continue;
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) copyDirRecursive(srcPath, destPath);
    else if (entry.isFile()) writeFileSync(destPath, readFileSync(srcPath));
  }
}

/** Copy only the newest audit file (by filename sort) into `{dest}/audits/`. */
function copyLatestAudit(realSkillDir: string, destSkillDir: string): string | null {
  const auditsDir = join(realSkillDir, 'audits');
  if (!existsSync(auditsDir)) return null;
  let names: string[];
  try {
    names = readdirSync(auditsDir).filter((n) => n.startsWith('audit-') && n.endsWith('.md'));
  } catch {
    return null;
  }
  if (names.length === 0) return null;
  names.sort();
  const latest = names[names.length - 1];
  const destAuditsDir = join(destSkillDir, 'audits');
  mkdirSync(destAuditsDir, { recursive: true });
  writeFileSync(join(destAuditsDir, latest), readFileSync(join(auditsDir, latest)));
  return latest;
}

/**
 * Locate the latest archived audit for a non-skill target (claudemd / rules /
 * subagents / hooks / permissions / mcp / output-styles) and copy it to
 * `<workdir>/outputs/audit-report.md` so the expert's `fix` procedure can
 * read it at the conventional path. Returns the absolute destination path,
 * or null when no archived audit exists for the target.
 */
function copyLatestNonSkillAudit(req: SkillAgentStartReq, workdir: string): string | null {
  let auditPath: string | null = null;
  if (req.claudemdTarget) {
    auditPath = listClaudemdAudits(req.claudemdTarget.projectId)[0]?.path ?? null;
  } else if (req.rulesTarget) {
    auditPath = listRulesAudits(req.rulesTarget.projectId, req.rulesTarget.ruleName)[0]?.path ?? null;
  } else if (req.subagentsTarget) {
    auditPath = listSubagentsAudits(req.subagentsTarget.projectId, req.subagentsTarget.subagentName)[0]?.path ?? null;
  } else if (req.hooksTarget) {
    auditPath = listHooksAudits(req.hooksTarget.projectId)[0]?.path ?? null;
  } else if (req.permissionsTarget) {
    auditPath = listPermissionsAudits(req.permissionsTarget.projectId, req.permissionsTarget.scope ?? 'project')[0]?.path ?? null;
  } else if (req.mcpTarget) {
    auditPath = listMcpAudits(req.mcpTarget.projectId)[0]?.path ?? null;
  } else if (req.outputStylesTarget) {
    auditPath = listOutputStylesAudits(req.outputStylesTarget.projectId, req.outputStylesTarget.styleName)[0]?.path ?? null;
  }
  if (!auditPath || !existsSync(auditPath)) return null;
  const outputsDir = join(workdir, 'outputs');
  mkdirSync(outputsDir, { recursive: true });
  const destPath = join(outputsDir, 'audit-report.md');
  try {
    copyFileSync(auditPath, destPath);
    return destPath;
  } catch (err) {
    console.warn(`[fix-runner] Could not copy non-skill audit: ${(err as Error).message}`);
    return null;
  }
}

/** Copy only the highest-numbered iteration into `{dest}/evals/workspace/iteration-N/`. */
function copyLatestIteration(realSkillDir: string, destSkillDir: string): number | null {
  const workspaceDir = join(realSkillDir, 'evals', 'workspace');
  if (!existsSync(workspaceDir)) return null;
  let iterNums: number[];
  try {
    iterNums = readdirSync(workspaceDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name.startsWith('iteration-'))
      .map((e) => parseInt(e.name.replace('iteration-', ''), 10))
      .filter((n) => !Number.isNaN(n));
  } catch {
    return null;
  }
  if (iterNums.length === 0) return null;
  const latest = Math.max(...iterNums);
  const src = join(workspaceDir, `iteration-${latest}`);
  const dest = join(destSkillDir, 'evals', 'workspace', `iteration-${latest}`);
  copyDirRecursive(src, dest);
  return latest;
}

/**
 * Paths (relative to the temp workdir) that are Nakiros-internal runtime state
 * and must NEVER be synced to the real skill.
 */
function isRuntimeOnlyPath(rel: string): boolean {
  if (rel === 'run.json' || rel === 'events.jsonl') return true;
  if (rel === 'audits' || rel.startsWith('audits/')) return true;
  if (rel === '.claude' || rel.startsWith('.claude/')) return true;
  if (rel === '.snapshot' || rel.startsWith('.snapshot/')) return true;
  if (rel.startsWith('evals/workspace/') || rel === 'evals/workspace') return true;
  // `.fix-temp/` is the per-fix-session segregated workspace on the real
  // skill side. It is NEVER copied into the tmp workdir at fix start
  // (and the eval-runner writes its results there, on the real skill,
  // not in the tmp). So from the tmp's perspective the path is always
  // missing — without this guard, every fix-temp iter would surface as
  // "deleted" in the diff and would actually be removed by the sync-back
  // walk, wiping the in-progress eval results.
  if (rel.startsWith('evals/.fix-temp/') || rel === 'evals/.fix-temp') return true;
  // outputs/ holds the live progress artefacts the agent writes for Nakiros
  // (fix-targets.jsonl, fix-findings.jsonl, audit-progress.jsonl, …). It is
  // a workdir-only surface — never sync it back to the real skill.
  if (rel === 'outputs' || rel.startsWith('outputs/')) return true;
  return false;
}

// ─── Non-skill diff snapshots ──────────────────────────────────────────────
//
// For runs that target a non-skill entity (CLAUDE.md, rules, subagents,
// hooks, permissions, mcp, output-styles), the workdir is NOT a copy of
// the entity — it only contains a symlink to the bundled expert plus a
// `draft.<ext>` file (or nothing, when the agent edits the project file
// directly). To render a clean diff in the workspace panel, we freeze a
// "before" snapshot at run start under `<workdir>/.snapshot/` and the
// diff functions compare it against the live "after" location.

const SNAPSHOT_DIR_NAME = '.snapshot';

interface NonSkillTargetDiffSpec {
  /** Display path shown in the diff list (e.g. `CLAUDE.md`, `.claude/rules/i18n.md`). */
  displayPath: string;
  /** Absolute path to the frozen "before" snapshot, or `null` when the source did not exist at run start. */
  snapshotPath: string | null;
  /**
   * Absolute path to the live "after" file. For direct-write targets
   * (claudemd, mcp), this is the project file the agent edits in place.
   * For draft-based targets (rules, subagents, output-styles, hooks,
   * permissions), this is the workdir's `draft.<ext>`.
   */
  modifiedPath: string;
}

/**
 * Copy `sourcePath` into `<workdir>/.snapshot/<snapshotName>` so the diff
 * panel has a frozen "before" reference. Idempotent and silent on missing
 * source (the diff just shows the after side as "new").
 */
function seedDiffSnapshot(workdir: string, snapshotName: string, sourcePath: string): void {
  if (!existsSync(sourcePath)) return;
  const snapDir = join(workdir, SNAPSHOT_DIR_NAME);
  const dest = join(snapDir, snapshotName);
  if (existsSync(dest)) return;
  try {
    mkdirSync(snapDir, { recursive: true });
    copyFileSync(sourcePath, dest);
  } catch (err) {
    console.warn(`[fix-runner] Could not seed diff snapshot ${snapshotName}: ${(err as Error).message}`);
  }
}

/**
 * Resolve a non-skill diff spec from the persisted run record. Derived on
 * demand (rather than cached in extras) so it survives daemon restart
 * without rehydration plumbing. Returns `null` when the run targets a
 * skill — callers fall back to the existing workdir-vs-realSkillDir walk.
 */
function getNonSkillTargetDiffSpec(run: AuditRun): NonSkillTargetDiffSpec | null {
  const workdir = run.workdir;
  const snapDir = join(workdir, SNAPSHOT_DIR_NAME);
  const snapAt = (name: string): string | null => {
    const abs = join(snapDir, name);
    return existsSync(abs) ? abs : null;
  };

  if (run.claudemdTarget) {
    return {
      displayPath: 'CLAUDE.md',
      snapshotPath: snapAt('CLAUDE.md'),
      modifiedPath: join(run.claudemdTarget.projectPath, 'CLAUDE.md'),
    };
  }
  if (run.rulesTarget) {
    return {
      displayPath: `.claude/rules/${run.rulesTarget.ruleName}`,
      snapshotPath: snapAt('draft.md'),
      modifiedPath: join(workdir, 'draft.md'),
    };
  }
  if (run.subagentsTarget) {
    return {
      displayPath: `.claude/agents/${run.subagentsTarget.subagentName}`,
      snapshotPath: snapAt('draft.md'),
      modifiedPath: join(workdir, 'draft.md'),
    };
  }
  if (run.hooksTarget) {
    return {
      displayPath: '.claude/settings.json (hooks)',
      snapshotPath: snapAt('draft.json'),
      modifiedPath: join(workdir, 'draft.json'),
    };
  }
  if (run.permissionsTarget) {
    const scope = run.permissionsTarget.scope ?? 'project';
    const filename = scope === 'local' ? 'settings.local.json' : 'settings.json';
    return {
      displayPath: `.claude/${filename} (permissions)`,
      snapshotPath: snapAt('draft.json'),
      modifiedPath: join(workdir, 'draft.json'),
    };
  }
  if (run.mcpTarget) {
    return {
      displayPath: '.mcp.json',
      snapshotPath: snapAt('.mcp.json'),
      modifiedPath: join(run.mcpTarget.projectPath, '.mcp.json'),
    };
  }
  if (run.outputStylesTarget) {
    return {
      displayPath: `.claude/output-styles/${run.outputStylesTarget.styleName}`,
      snapshotPath: snapAt('draft.md'),
      modifiedPath: join(workdir, 'draft.md'),
    };
  }
  return null;
}

function syncBackToSkill(tempDir: string, realSkillDir: string): { filesCopied: number } {
  let filesCopied = 0;
  const walk = (dir: string) => {
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true }) as Dirent[];
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const rel = relative(tempDir, fullPath);
      if (isRuntimeOnlyPath(rel)) continue;
      if (entry.isDirectory()) walk(fullPath);
      else if (entry.isFile()) {
        const destPath = join(realSkillDir, rel);
        mkdirSync(join(destPath, '..'), { recursive: true });
        writeFileSync(destPath, readFileSync(fullPath));
        filesCopied++;
      }
    }
  };
  walk(tempDir);
  return { filesCopied };
}

// ─── Live progress tailing ─────────────────────────────────────────────────

const PROGRESS_POLL_MS = 1000;

/**
 * Re-read the two artefacts the skill writes during a fix and emit the diff:
 *
 *   - `outputs/fix-targets.jsonl` — append-only checklist; each new line either
 *     registers a target (`{ id, title, source?, status: 'todo' }`) or flips
 *     its state (`{ id, status: 'done' }`). The reduced list is broadcast as
 *     a single `fix_targets` event whenever any line is observed.
 *
 * Findings used to be tailed here too, but we now derive them from the
 * session jsonl in {@link getFixTimeline} — single source of truth, no
 * separate poll. Targets stay on the file-tail path because they need a
 * reduced (last-line-wins per id) state for the sidebar, which the
 * timeline isn't structured to carry.
 *
 * Tolerates a partially-written file: skip the bad/last line, retry next tick.
 * Like `audit-runner`, the markdown / sync-back are still the source of truth
 * for the user — these events drive the live sidebar only.
 */
function syncFixProgress(entry: FixEntry): void {
  const { run, extras } = entry;
  if (!run.targets) run.targets = [];
  if (typeof extras.targetsLineCount !== 'number') extras.targetsLineCount = 0;

  const outputsDir = join(run.workdir, 'outputs');
  let mutated = false;

  // ── targets ──────────────────────────────────────────────────────────────
  const targetsPath = join(outputsDir, 'fix-targets.jsonl');
  if (existsSync(targetsPath)) {
    let raw: string;
    try {
      raw = readFileSync(targetsPath, 'utf8');
    } catch {
      raw = '';
    }
    const lines = raw.split('\n');
    // Slice from where we left off. The trailing empty string after the final
    // \n keeps the tail correct; partial last lines that fail to parse are
    // skipped and re-tried on the next tick (no advance of the line count).
    const startIdx = extras.targetsLineCount;
    let consumed = startIdx;
    let targetsChanged = false;
    for (let i = startIdx; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (!trimmed) {
        // Empty line — advance only if it's not the trailing partial slot
        // (i.e. there's content after it in the file).
        if (i < lines.length - 1) consumed = i + 1;
        continue;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        // Partial write of the very last line — stop here, retry next tick.
        break;
      }
      consumed = i + 1;
      const entryParsed = parsed as Partial<FixTargetEntry>;
      if (!entryParsed || typeof entryParsed.id !== 'string') continue;
      const status = entryParsed.status === 'done' ? 'done' : 'todo';
      const existing = run.targets.find((t) => t.id === entryParsed.id);
      if (existing) {
        if (existing.status !== status) {
          existing.status = status;
          targetsChanged = true;
        }
        if (typeof entryParsed.title === 'string' && entryParsed.title !== existing.title) {
          existing.title = entryParsed.title;
          targetsChanged = true;
        }
        if (typeof entryParsed.source === 'string' && entryParsed.source !== existing.source) {
          existing.source = entryParsed.source;
          targetsChanged = true;
        }
      } else {
        const target: FixTarget = {
          id: entryParsed.id,
          title: typeof entryParsed.title === 'string' ? entryParsed.title : entryParsed.id,
          status,
        };
        if (typeof entryParsed.source === 'string') target.source = entryParsed.source;
        run.targets.push(target);
        targetsChanged = true;
      }
    }
    if (consumed !== extras.targetsLineCount) {
      extras.targetsLineCount = consumed;
    }
    if (targetsChanged) {
      mutated = true;
      entry.eventLog.emit({ type: 'fix_targets', targets: [...run.targets] });
    }
  }

  // Persist whenever we mutated the run — without this, a daemon restart
  // would lose every target captured live and the rehydrated run.json
  // would show an empty sidebar.
  if (mutated) {
    persistRunJson(run.workdir, { ...run, _extras: entry.extras });
  }
}

function stopProgressPolling(extras: SkillAgentExtras): void {
  if (extras.syncTimer) {
    clearInterval(extras.syncTimer);
    extras.syncTimer = null;
  }
}

// ─── Tool-use → FixEdit extraction ─────────────────────────────────────────

/**
 * Inspect a `tool_use` `input` object and extract a {@link FixEdit} when the
 * tool is `Write` / `Edit` / `MultiEdit`. Returns `null` for any other tool
 * (Bash, Read, Glob, …) so `afterToolUse` becomes a no-op.
 *
 * For `MultiEdit`, we yield ONE FixEdit per inner edit (caller iterates).
 */
function toFixEdits(
  toolName: string,
  input: Record<string, unknown>,
  workdir: string,
): FixEdit[] {
  const ts = new Date().toISOString();
  const filePath = typeof input.file_path === 'string' ? input.file_path : '';
  if (!filePath) return [];
  const displayPath = relative(workdir, filePath) || filePath;
  // Skip Nakiros-internal artefacts (outputs/fix-targets.jsonl,
  // outputs/fix-findings.jsonl, audits/audit-*.md, .claude/**, run.json,
  // events.jsonl, evals/workspace/**). The user only wants to see edits
  // to actual skill source files (SKILL.md, references/, scripts/, …).
  if (isRuntimeOnlyPath(displayPath)) return [];

  if (toolName === 'Write') {
    const content = typeof input.content === 'string' ? input.content : '';
    return [{ kind: 'write', path: filePath, displayPath, before: '', after: content, ts }];
  }
  if (toolName === 'Edit') {
    const oldString = typeof input.old_string === 'string' ? input.old_string : '';
    const newString = typeof input.new_string === 'string' ? input.new_string : '';
    return [{ kind: 'edit', path: filePath, displayPath, before: oldString, after: newString, ts }];
  }
  if (toolName === 'MultiEdit') {
    const edits = Array.isArray(input.edits) ? input.edits : [];
    const out: FixEdit[] = [];
    for (const e of edits) {
      const inner = e as { old_string?: unknown; new_string?: unknown };
      const oldString = typeof inner.old_string === 'string' ? inner.old_string : '';
      const newString = typeof inner.new_string === 'string' ? inner.new_string : '';
      if (oldString === '' && newString === '') continue;
      out.push({ kind: 'edit', path: filePath, displayPath, before: oldString, after: newString, ts });
    }
    return out;
  }
  return [];
}

/**
 * Recover a Claude session id from disk by inspecting the project entry
 * directory mapped to `workdir`. Returns the basename (without `.jsonl`)
 * of the most recently modified session file, or null when no entry
 * exists. Used at boot to restore a sessionId that was never flushed to
 * `run.json` before the daemon crashed — without it, the timeline view
 * cannot locate the Claude conversation jsonl.
 */
function findLatestClaudeSessionId(workdir: string): string | null {
  const projectsDir = join(homedir(), '.claude', 'projects', encodeProjectPath(workdir));
  if (!existsSync(projectsDir)) return null;
  let entries: string[];
  try {
    entries = readdirSync(projectsDir).filter((n) => n.endsWith('.jsonl'));
  } catch {
    return null;
  }
  if (entries.length === 0) return null;
  let bestName: string | null = null;
  let bestMtime = -Infinity;
  for (const name of entries) {
    try {
      const mtime = statSync(join(projectsDir, name)).mtimeMs;
      if (mtime > bestMtime) {
        bestMtime = mtime;
        bestName = name;
      }
    } catch {
      // ignore
    }
  }
  return bestName ? bestName.replace(/\.jsonl$/, '') : null;
}

// ─── Non-interactive apply-recommendation helper ───────────────────────────

/**
 * Resolves the context needed to build a non-interactive first prompt for a
 * given `*Target` field on the request. Returns `null` when no `*Target` is
 * set (skill-factory path — handled separately).
 */
function resolveApplyTarget(
  req: SkillAgentStartReq,
  workdir: string,
): {
  skillName: string;
  slashCmd: string;
  /** Where the agent must write (draft path or final target path). */
  writePath: string;
  /**
   * `'draft-md'`   — Claude Code blocks `.claude/**`; agent writes ./draft.md
   * `'draft-json'` — Claude Code blocks `.claude/**`; agent writes ./draft.json
   * `'direct'`     — agent may write the target file directly (no .claude/** constraint)
   */
  writeMode: 'draft-md' | 'draft-json' | 'direct';
  /** Short label describing what is being edited (for the prompt). */
  label: string;
} | null {
  if (req.claudemdTarget) {
    const targetPath = join(req.claudemdTarget.projectPath, 'CLAUDE.md');
    return {
      skillName: CLAUDEMD_EXPERT_SKILL_NAME,
      slashCmd: `/${CLAUDEMD_EXPERT_SKILL_NAME} edit`,
      writePath: targetPath,
      writeMode: 'direct',
      label: 'CLAUDE.md',
    };
  }
  if (req.rulesTarget) {
    return {
      skillName: RULES_EXPERT_SKILL_NAME,
      slashCmd: `/${RULES_EXPERT_SKILL_NAME} edit`,
      writePath: join(workdir, 'draft.md'),
      writeMode: 'draft-md',
      label: `rule \`${req.rulesTarget.ruleName}\``,
    };
  }
  if (req.subagentsTarget) {
    return {
      skillName: SUBAGENTS_EXPERT_SKILL_NAME,
      slashCmd: `/${SUBAGENTS_EXPERT_SKILL_NAME} edit`,
      writePath: join(workdir, 'draft.md'),
      writeMode: 'draft-md',
      label: `subagent \`${req.subagentsTarget.subagentName}\``,
    };
  }
  if (req.hooksTarget) {
    return {
      skillName: HOOKS_EXPERT_SKILL_NAME,
      slashCmd: `/${HOOKS_EXPERT_SKILL_NAME} edit`,
      writePath: join(workdir, 'draft.json'),
      writeMode: 'draft-json',
      label: 'hooks configuration',
    };
  }
  if (req.permissionsTarget) {
    const scope = req.permissionsTarget.scope ?? 'project';
    return {
      skillName: PERMISSIONS_EXPERT_SKILL_NAME,
      slashCmd: `/${PERMISSIONS_EXPERT_SKILL_NAME} edit`,
      writePath: join(workdir, 'draft.json'),
      writeMode: 'draft-json',
      label: `permissions configuration (scope: ${scope})`,
    };
  }
  if (req.mcpTarget) {
    const mcpPath = join(req.mcpTarget.projectPath, '.mcp.json');
    return {
      skillName: MCP_EXPERT_SKILL_NAME,
      slashCmd: `/${MCP_EXPERT_SKILL_NAME} edit`,
      writePath: mcpPath,
      writeMode: 'direct',
      label: '.mcp.json',
    };
  }
  if (req.outputStylesTarget) {
    return {
      skillName: OUTPUT_STYLES_EXPERT_SKILL_NAME,
      slashCmd: `/${OUTPUT_STYLES_EXPERT_SKILL_NAME} edit`,
      writePath: join(workdir, 'draft.md'),
      writeMode: 'draft-md',
      label: `output style \`${req.outputStylesTarget.styleName}\``,
    };
  }
  return null;
}


/**
 * Builds the non-interactive first prompt used when a run is spawned to
 * apply a Nakiros recommendation card. Embeds the `<apply-recommendation>`
 * block directly so the expert skill executes without waiting for user input.
 *
 * `ar.target` is always a real artefact name at this point — the `'new'`
 * sentinel was resolved to a kebab-case filename by `deriveEffectiveTarget`
 * in `recommendation-apply.ts` before the request was built.
 *
 * Only called when `req.applyRecommendation` is set.
 */
function buildNonInteractiveApplyPrompt(
  req: SkillAgentStartReq,
  workdir: string,
  languageLine: string,
): string {
  const ar = req.applyRecommendation!;
  const target = resolveApplyTarget(req, workdir);

  // Skill-factory path (skill artefacts — no *Target field set).
  if (target === null) {
    const isCreate = ar.action === 'create';
    const slashCmd = isCreate
      ? `/${FACTORY_SKILL_NAME} create ${req.skillName}`
      : `/${FACTORY_SKILL_NAME} fix ${req.skillName}`;

    return [
      slashCmd,
      '',
      languageLine,
      '- You are applying a Nakiros recommendation non-interactively.',
      '- Read your SKILL.md section "Applying a Nakiros recommendation (non-interactive)" and follow it strictly.',
      '- The user\'s spec is the `<apply-recommendation>` block below. Apply it directly. Do not ask follow-up questions.',
      '',
      `<apply-recommendation>`,
      `artifactType: ${ar.artifactType}`,
      `action: ${ar.action}`,
      `target: ${ar.target}`,
      `title: ${ar.title}`,
      `recId: ${ar.recId}`,
      `patternId: ${ar.patternId}`,
      '',
      ar.brief,
      `</apply-recommendation>`,
    ].join('\n');
  }

  const writeConstraintLine = target.writeMode === 'direct'
    ? `- You may edit the target file directly with your Write/Edit tools (Nakiros runs you with permissions on the project tree).`
    : `- IMPORTANT: Claude Code blocks every write under \`.claude/**\`. Write/Edit ONLY at \`${target.writePath}\`. Nakiros will sync it to the final destination when the user clicks "Apply & Deploy".`;

  return [
    target.slashCmd,
    '',
    languageLine,
    `- You are applying a Nakiros recommendation non-interactively to ${target.label}.`,
    '- Read your SKILL.md section "Applying a Nakiros recommendation (non-interactive)" and follow it strictly.',
    '- The user\'s spec is the `<apply-recommendation>` block below. Apply it directly. Do not ask follow-up questions.',
    writeConstraintLine,
    '',
    `<apply-recommendation>`,
    `artifactType: ${ar.artifactType}`,
    `action: ${ar.action}`,
    `target: ${ar.target}`,
    `title: ${ar.title}`,
    `recId: ${ar.recId}`,
    `patternId: ${ar.patternId}`,
    '',
    ar.brief,
    `</apply-recommendation>`,
  ].join('\n');
}

// ─── Spec ──────────────────────────────────────────────────────────────────

const spec: RunnerSpec<AuditRun, SkillAgentStartReq, FixEvent, SkillAgentExtras> = {
  kind: 'skill-agent',
  runsRoot: tempRoot,

  runIdPrefix(req) {
    return req.mode;
  },

  prepareWorkdir(req, runId) {
    if (req.mode === 'create' && existsSync(req.skillDir) && !req.claudemdTarget && !req.rulesTarget && !req.subagentsTarget && !req.hooksTarget && !req.permissionsTarget && !req.mcpTarget && !req.outputStylesTarget) {
      throw new Error(
        `Cannot create skill "${req.skillName}": target directory already exists (${req.skillDir}). ` +
          `Pick a different name or run "fix" on the existing skill instead.`,
      );
    }

    // Both fix and create work in a sandbox under `~/.nakiros/tmp-skills/<runId>/`
    // for two reasons:
    //   1. Claude Code blocks writes inside any `.claude/**` directory by hard
    //      rule (even with `acceptEdits`), so a draft folder under
    //      `<project>/.claude/skills-draft/<name>/` would be unwritable.
    //   2. Sandbox isolation lets the user Discard mid-run without leaving any
    //      partial files inside the project.
    // The destination folder (`req.skillDir`) is only materialised at finish
    // time via `syncBackToSkill` — fix targets `.claude/skills/<name>/`,
    // create targets `.claude/skills-draft/<name>/` (because the request
    // carries `draft: true`).
    const workdir = join(tempRoot(), runId);
    mkdirSync(workdir, { recursive: true });
    // outputs/ is where the agent writes fix-targets.jsonl + fix-findings.jsonl
    // when invoked by Nakiros. Pre-creating it avoids a race between the
    // daemon's first poll tick and the agent's first append.
    mkdirSync(join(workdir, 'outputs'), { recursive: true });

    let latestAuditFile: string | null = null;
    let latestIteration: number | null = null;

    if (req.claudemdTarget || req.rulesTarget || req.subagentsTarget || req.hooksTarget || req.permissionsTarget || req.mcpTarget || req.outputStylesTarget) {
      // For CLAUDE.md, rules, subagents, hooks, permissions, and mcp runs we
      // don't copy the bundled expert into the workdir — it's immutable. We only
      // symlink it under `.claude/skills/<name>` so the slash-command resolves
      // from cwd. The agent edits the target file directly via Write/Edit at
      // the absolute path injected in the first prompt.
      const claudeSkillsDir = join(workdir, '.claude', 'skills');
      mkdirSync(claudeSkillsDir, { recursive: true });
      const linkPath = join(claudeSkillsDir, req.skillName);
      if (!existsSync(linkPath)) {
        try {
          symlinkSync(realpathSync(req.skillDir), linkPath, 'dir');
        } catch (err) {
          console.warn(`[skill-agent-runner] Failed to symlink expert: ${(err as Error).message}`);
        }
      }
    } else if (req.mode === 'fix' || req.mode === 'edit') {
      // edit mode seeds the workdir identically to fix — same sandbox, same
      // content copy. The difference is only in the first prompt (no audit
      // findings) and that edit runs have no pre-existing findings to load.
      copySkillSourceForFix(req.skillDir, workdir);
      latestAuditFile = copyLatestAudit(req.skillDir, workdir);
      latestIteration = copyLatestIteration(req.skillDir, workdir);
    }

    writeExecutionSettings(workdir);

    // For CLAUDE.md fix/create runs, write a cross-entity snapshot so the expert
    // agent can detect coherence issues across the full .claude/ configuration.
    if (req.claudemdTarget) {
      try {
        const snapshot = buildDotClaudeSnapshot({
          projectId: req.claudemdTarget.projectId,
          projectPath: req.claudemdTarget.projectPath,
        });
        writeFileSync(
          join(workdir, 'dot-claude-snapshot.json'),
          JSON.stringify(snapshot, null, 2),
          'utf8',
        );
      } catch (err) {
        console.warn(`[skill-agent-runner] Could not write dot-claude-snapshot.json: ${(err as Error).message}`);
      }
      // Snapshot the live CLAUDE.md so the workspace diff panel can show a
      // clean before/after — the agent edits the project file in place.
      seedDiffSnapshot(workdir, 'CLAUDE.md', join(req.claudemdTarget.projectPath, 'CLAUDE.md'));
    }

    // For rules fix/create runs, write the same cross-entity snapshot so the
    // expert agent can reason about rule coherence in context.
    if (req.rulesTarget) {
      try {
        const snapshot = buildDotClaudeSnapshot({
          projectId: req.rulesTarget.projectId,
          projectPath: req.rulesTarget.projectPath,
        });
        writeFileSync(
          join(workdir, 'dot-claude-snapshot.json'),
          JSON.stringify(snapshot, null, 2),
          'utf8',
        );
      } catch (err) {
        console.warn(`[skill-agent-runner] Could not write dot-claude-snapshot.json for rules: ${(err as Error).message}`);
      }
    }

    // For subagents fix/create runs, write the cross-entity snapshot so the
    // expert agent can reason about the subagent in context.
    if (req.subagentsTarget) {
      try {
        const snapshot = buildDotClaudeSnapshot({
          projectId: req.subagentsTarget.projectId,
          projectPath: req.subagentsTarget.projectPath,
        });
        writeFileSync(
          join(workdir, 'dot-claude-snapshot.json'),
          JSON.stringify(snapshot, null, 2),
          'utf8',
        );
      } catch (err) {
        console.warn(`[skill-agent-runner] Could not write dot-claude-snapshot.json for subagents: ${(err as Error).message}`);
      }
    }

    // For hooks fix/create runs, write the cross-entity snapshot so the expert
    // agent can reason about the hooks block in context of the full .claude/
    // configuration.
    if (req.hooksTarget) {
      try {
        const snapshot = buildDotClaudeSnapshot({
          projectId: req.hooksTarget.projectId,
          projectPath: req.hooksTarget.projectPath,
        });
        writeFileSync(
          join(workdir, 'dot-claude-snapshot.json'),
          JSON.stringify(snapshot, null, 2),
          'utf8',
        );
      } catch (err) {
        console.warn(`[skill-agent-runner] Could not write dot-claude-snapshot.json for hooks: ${(err as Error).message}`);
      }
    }

    // For permissions fix/create runs, write the cross-entity snapshot so the
    // expert agent can reason about the permissions block in context of the
    // full .claude/ configuration (CLAUDE.md, hooks, other settings, etc.).
    if (req.permissionsTarget) {
      try {
        const snapshot = buildDotClaudeSnapshot({
          projectId: req.permissionsTarget.projectId,
          projectPath: req.permissionsTarget.projectPath,
        });
        writeFileSync(
          join(workdir, 'dot-claude-snapshot.json'),
          JSON.stringify(snapshot, null, 2),
          'utf8',
        );
      } catch (err) {
        console.warn(`[skill-agent-runner] Could not write dot-claude-snapshot.json for permissions: ${(err as Error).message}`);
      }
    }

    // For MCP fix/create runs, write the cross-entity snapshot so the expert
    // agent can reason about .mcp.json in context of the full .claude/
    // configuration (CLAUDE.md, hooks, other settings, etc.).
    if (req.mcpTarget) {
      try {
        const snapshot = buildDotClaudeSnapshot({
          projectId: req.mcpTarget.projectId,
          projectPath: req.mcpTarget.projectPath,
        });
        writeFileSync(
          join(workdir, 'dot-claude-snapshot.json'),
          JSON.stringify(snapshot, null, 2),
          'utf8',
        );
      } catch (err) {
        console.warn(`[skill-agent-runner] Could not write dot-claude-snapshot.json for mcp: ${(err as Error).message}`);
      }
      // Snapshot the live .mcp.json so the workspace diff panel can show a
      // clean before/after — the agent edits the project file in place.
      seedDiffSnapshot(workdir, '.mcp.json', join(req.mcpTarget.projectPath, '.mcp.json'));
    }

    // For rules fix/create runs, seed `<workdir>/draft.md` from the existing
    // rule file when present — Claude Code blocks all writes inside
    // `.claude/**`, so the agent must edit the workdir-relative draft and
    // Nakiros syncs it back on finish.
    if (req.rulesTarget) {
      try {
        const rt = req.rulesTarget;
        const sourcePath = join(rt.projectPath, '.claude', 'rules', rt.ruleName);
        const draftPath = join(workdir, 'draft.md');
        if (existsSync(sourcePath)) {
          copyFileSync(sourcePath, draftPath);
        }
        seedDiffSnapshot(workdir, 'draft.md', sourcePath);
      } catch (err) {
        console.warn(`[skill-agent-runner] Could not seed rules draft: ${(err as Error).message}`);
      }
    }

    // For subagents fix/create runs, seed `<workdir>/draft.md` from the
    // existing subagent file when present — same Claude Code write-block
    // constraint as rules.
    if (req.subagentsTarget) {
      try {
        const st = req.subagentsTarget;
        const sourcePath = join(st.projectPath, '.claude', 'agents', st.subagentName);
        const draftPath = join(workdir, 'draft.md');
        if (existsSync(sourcePath)) {
          copyFileSync(sourcePath, draftPath);
        }
        seedDiffSnapshot(workdir, 'draft.md', sourcePath);
      } catch (err) {
        console.warn(`[skill-agent-runner] Could not seed subagents draft: ${(err as Error).message}`);
      }
    }

    // For hooks fix/create runs, seed `<workdir>/draft.json` with the current
    // hooks block extracted from settings.json — Claude Code blocks writes
    // inside `.claude/**`, so the agent edits only the extracted sub-block and
    // Nakiros merges it back via saveHooksBlock on finish.
    if (req.hooksTarget) {
      try {
        const ht = req.hooksTarget;
        const { content } = readHooksBlock(ht.projectPath);
        writeFileSync(join(workdir, 'draft.json'), content, 'utf8');
        seedDiffSnapshot(workdir, 'draft.json', join(workdir, 'draft.json'));
      } catch (err) {
        console.warn(`[skill-agent-runner] Could not seed hooks draft: ${(err as Error).message}`);
      }
    }

    // For permissions fix/create runs, seed `<workdir>/draft.json` with the
    // current permissions block extracted from the scoped settings file —
    // same Claude Code write-block constraint as hooks.
    if (req.permissionsTarget) {
      try {
        const pt = req.permissionsTarget;
        const scope = pt.scope ?? 'project';
        const { content } = readPermissionsBlock(pt.projectPath, scope);
        writeFileSync(join(workdir, 'draft.json'), content, 'utf8');
        seedDiffSnapshot(workdir, 'draft.json', join(workdir, 'draft.json'));
      } catch (err) {
        console.warn(`[skill-agent-runner] Could not seed permissions draft: ${(err as Error).message}`);
      }
    }

    // For output-styles fix/create runs, write the cross-entity snapshot so
    // the expert agent can reason about the style in context of the full
    // .claude/ configuration (CLAUDE.md, rules, other styles, etc.).
    // Also seed `<workdir>/draft.md` from the existing file when present —
    // Claude Code blocks all writes inside `.claude/**`, so the agent must
    // edit the workdir-relative draft and Nakiros syncs it back on finish.
    if (req.outputStylesTarget) {
      try {
        const snapshot = buildDotClaudeSnapshot({
          projectId: req.outputStylesTarget.projectId,
          projectPath: req.outputStylesTarget.projectPath,
        });
        writeFileSync(
          join(workdir, 'dot-claude-snapshot.json'),
          JSON.stringify(snapshot, null, 2),
          'utf8',
        );
      } catch (err) {
        console.warn(`[skill-agent-runner] Could not write dot-claude-snapshot.json for output-styles: ${(err as Error).message}`);
      }
      try {
        const ost = req.outputStylesTarget;
        const sourcePath = join(ost.projectPath, '.claude', 'output-styles', ost.styleName);
        const draftPath = join(workdir, 'draft.md');
        if (existsSync(sourcePath)) {
          copyFileSync(sourcePath, draftPath);
        }
        seedDiffSnapshot(workdir, 'draft.md', sourcePath);
      } catch (err) {
        console.warn(`[skill-agent-runner] Could not seed output-style draft: ${(err as Error).message}`);
      }
    }

    // For non-skill fix runs, seed outputs/audit-report.md from the latest
    // archived audit so the expert agent can read it at the conventional path.
    // This mirrors what copyLatestAudit does for skill runs. Only applies to
    // mode === 'fix' — edit is audit-less by design, create has no prior audit.
    if (
      req.mode === 'fix' &&
      (req.claudemdTarget ||
        req.rulesTarget ||
        req.subagentsTarget ||
        req.hooksTarget ||
        req.permissionsTarget ||
        req.mcpTarget ||
        req.outputStylesTarget)
    ) {
      latestAuditFile = copyLatestNonSkillAudit(req, workdir);
    }

    return {
      workdir,
      extras: {
        mode: req.mode,
        realSkillDir: req.skillDir,
        latestAuditFile,
        latestIteration,
        syncTimer: null,
        targetsLineCount: 0,
      },
    };
  },

  buildFirstPrompt(req, ctx) {
    const { workdir, extras } = ctx;
    const language = getEffectiveLanguage();
    const languageLine =
      language === 'fr'
        ? '- IMPORTANT: communique avec l\'utilisateur en français. Toutes tes questions, résumés, demandes de clarification et messages de progression doivent être en français.'
        : '- IMPORTANT: communicate with the user in English. All your questions, summaries, clarifications and progress updates must be in English.';

    // Non-interactive apply-recommendation: skip the interactive first-turn
    // protocol entirely and embed the <apply-recommendation> block directly
    // so the expert skill executes without waiting for user input.
    if (req.applyRecommendation) {
      return buildNonInteractiveApplyPrompt(req, workdir, languageLine);
    }

    if (req.claudemdTarget) {
      const ct = req.claudemdTarget;
      const targetPath = join(ct.projectPath, 'CLAUDE.md');
      const exists = existsSync(targetPath);
      if (req.mode === 'edit') {
        return [
          `/${CLAUDEMD_EXPERT_SKILL_NAME} edit`,
          '',
          languageLine,
          `- You are in **edit mode** for CLAUDE.md.`,
          `- Project root: ${ct.projectPath}`,
          `- Target file: ${targetPath} (${exists ? 'exists' : 'does not exist yet'})`,
          '',
          `**First-turn protocol — do these in order before asking the user anything:**`,
          exists
            ? `1. Read \`${targetPath}\` so you have the current CLAUDE.md content in context.`
            : `1. Note that \`${targetPath}\` does not exist yet — you will create it from scratch.`,
          `2. Reply with ONE short sentence in the chat (use the language from the language directive above): "Ready to edit \`CLAUDE.md\`. What would you like to change?" / "Prêt à éditer \`CLAUDE.md\`. Que veux-tu modifier ?"`,
          `3. Then wait for the user's instructions. Once they reply, propose edits, iterate, and re-read the file after each substantive change.`,
          '',
          `- You may edit the target file directly with your Write/Edit tools (Nakiros runs you with permissions on the project tree).`,
          `- No findings file, no audit manifest. The user's chat is the spec.`,
          `- When the user is satisfied, they will Apply & Deploy from the UI; you do not need to call \`finish\` yourself.`,
          `- Reference: \`/${CLAUDEMD_EXPERT_SKILL_NAME} edit\` — see SKILL.md "Edit mode" section for the procedure.`,
        ].join('\n');
      }
      const command = req.mode === 'fix' ? 'fix' : 'create';
      return [
        `/${CLAUDEMD_EXPERT_SKILL_NAME} ${command}`,
        '',
        languageLine,
        `- Operate on the project root CLAUDE.md.`,
        `- Project root: ${ct.projectPath}`,
        `- Target file: ${targetPath} (${exists ? 'exists' : 'does not exist yet'})`,
        '',
        `- You may edit the target file directly with your Write/Edit tools (Nakiros runs you with permissions on the project tree).`,
        `- Follow the procedure for the "${command}" command in your SKILL.md.`,
      ].join('\n');
    }

    if (req.rulesTarget) {
      const rt = req.rulesTarget;
      const finalPath = join(rt.projectPath, '.claude', 'rules', rt.ruleName);
      const draftPath = join(workdir, 'draft.md');
      const seeded = existsSync(draftPath);
      if (req.mode === 'edit') {
        return [
          `/${RULES_EXPERT_SKILL_NAME} edit`,
          '',
          languageLine,
          `- You are in **edit mode** for rule \`${rt.ruleName}\`.`,
          `- Final destination: ${finalPath} (managed by Nakiros — DO NOT write there yourself).`,
          `- Project root: ${rt.projectPath}`,
          `- Draft file (your working copy): ${draftPath}`,
          '',
          `**First-turn protocol — do these in order before asking the user anything:**`,
          seeded
            ? `1. Read \`${draftPath}\` so you have the current rule content in context.`
            : `1. Note that \`${draftPath}\` does not exist yet — you will create it from scratch.`,
          `2. Reply with ONE short sentence in the chat (use the language from the language directive above): "Ready to edit rule \`${rt.ruleName}\`. What would you like to change?" / "Prêt à éditer la règle \`${rt.ruleName}\`. Que veux-tu modifier ?"`,
          `3. Then wait for the user's instructions. Once they reply, propose edits, iterate, and re-read \`./draft.md\` after each substantive change.`,
          '',
          `- IMPORTANT: Claude Code blocks every write under \`.claude/**\`. Write/Edit ONLY at \`./draft.md\` (absolute: ${draftPath}). Nakiros will copy it to the final destination when the user clicks "Apply & Deploy".`,
          `- No findings file, no audit manifest. The user's chat is the spec.`,
          `- When the user is satisfied, they will Apply & Deploy from the UI; you do not need to call \`finish\` yourself.`,
          `- Reference: \`/${RULES_EXPERT_SKILL_NAME} edit\` — see SKILL.md "Edit mode" section for the procedure.`,
        ].join('\n');
      }
      const command = req.mode === 'fix' ? 'fix' : 'create';
      return [
        `/${RULES_EXPERT_SKILL_NAME} ${command}`,
        '',
        languageLine,
        `- Final destination: ${finalPath} (managed by Nakiros — DO NOT write there yourself).`,
        `- Project root: ${rt.projectPath}`,
        `- Rule name (relative to .claude/rules/): ${rt.ruleName}`,
        '',
        `- IMPORTANT: Claude Code blocks every write under \`.claude/**\`. Write/Edit your rule ONLY at the workdir-relative path \`./draft.md\` (absolute: ${draftPath}). Nakiros will copy it to the final destination when the user clicks "Terminer".`,
        seeded
          ? `- An existing copy of the rule was seeded at ./draft.md. Read it first, then edit in place.`
          : `- ./draft.md does not exist yet — create it with the generated content.`,
        `- Follow the procedure for the "${command}" command in your SKILL.md, but treat \`./draft.md\` as the target instead of any \`.claude/rules/\` path.`,
      ].join('\n');
    }

    if (req.subagentsTarget) {
      const st = req.subagentsTarget;
      const finalPath = join(st.projectPath, '.claude', 'agents', st.subagentName);
      const draftPath = join(workdir, 'draft.md');
      const seeded = existsSync(draftPath);
      if (req.mode === 'edit') {
        return [
          `/${SUBAGENTS_EXPERT_SKILL_NAME} edit`,
          '',
          languageLine,
          `- You are in **edit mode** for subagent \`${st.subagentName}\`.`,
          `- Final destination: ${finalPath} (managed by Nakiros — DO NOT write there yourself).`,
          `- Project root: ${st.projectPath}`,
          `- Draft file (your working copy): ${draftPath}`,
          '',
          `**First-turn protocol — do these in order before asking the user anything:**`,
          seeded
            ? `1. Read \`${draftPath}\` so you have the current subagent content in context.`
            : `1. Note that \`${draftPath}\` does not exist yet — you will create it from scratch.`,
          `2. Reply with ONE short sentence in the chat (use the language from the language directive above): "Ready to edit subagent \`${st.subagentName}\`. What would you like to change?" / "Prêt à éditer le subagent \`${st.subagentName}\`. Que veux-tu modifier ?"`,
          `3. Then wait for the user's instructions. Once they reply, propose edits, iterate, and re-read \`./draft.md\` after each substantive change.`,
          '',
          `- IMPORTANT: Claude Code blocks every write under \`.claude/**\`. Write/Edit ONLY at \`./draft.md\` (absolute: ${draftPath}). Nakiros will copy it to the final destination when the user clicks "Apply & Deploy".`,
          `- No findings file, no audit manifest. The user's chat is the spec.`,
          `- When the user is satisfied, they will Apply & Deploy from the UI; you do not need to call \`finish\` yourself.`,
          `- Reference: \`/${SUBAGENTS_EXPERT_SKILL_NAME} edit\` — see SKILL.md "Edit mode" section for the procedure.`,
        ].join('\n');
      }
      const command = req.mode === 'fix' ? 'fix' : 'create';
      return [
        `/${SUBAGENTS_EXPERT_SKILL_NAME} ${command}`,
        '',
        languageLine,
        `- Final destination: ${finalPath} (managed by Nakiros — DO NOT write there yourself).`,
        `- Project root: ${st.projectPath}`,
        `- Subagent name (relative to .claude/agents/): ${st.subagentName}`,
        '',
        `- IMPORTANT: Claude Code blocks every write under \`.claude/**\`. Write/Edit your subagent ONLY at the workdir-relative path \`./draft.md\` (absolute: ${draftPath}). Nakiros will copy it to the final destination when the user clicks "Terminer".`,
        seeded
          ? `- An existing copy of the subagent was seeded at ./draft.md. Read it first, then edit in place.`
          : `- ./draft.md does not exist yet — create it with the generated content.`,
        `- Follow the procedure for the "${command}" command in your SKILL.md, but treat \`./draft.md\` as the target instead of any \`.claude/agents/\` path.`,
      ].join('\n');
    }

    if (req.hooksTarget) {
      const ht = req.hooksTarget;
      const settingsPath = join(ht.projectPath, '.claude', 'settings.json');
      const draftPath = join(workdir, 'draft.json');
      if (req.mode === 'edit') {
        return [
          `/${HOOKS_EXPERT_SKILL_NAME} edit`,
          '',
          languageLine,
          `- You are in **edit mode** for the hooks configuration.`,
          `- Final destination: ${settingsPath} (key "hooks" — managed by Nakiros — DO NOT write to settings.json yourself).`,
          `- Project root: ${ht.projectPath}`,
          `- Draft file (your working copy): ${draftPath} — contains ONLY the "hooks" sub-block, not the full settings file.`,
          '',
          `**First-turn protocol — do these in order before asking the user anything:**`,
          `1. Read \`${draftPath}\` so you have the current hooks configuration in context.`,
          `2. Reply with ONE short sentence in the chat (use the language from the language directive above): "Ready to edit the hooks configuration. What would you like to change?" / "Prêt à éditer la configuration des hooks. Que veux-tu modifier ?"`,
          `3. Then wait for the user's instructions. Once they reply, propose edits, iterate, and re-read \`./draft.json\` after each substantive change.`,
          '',
          `- IMPORTANT: Claude Code blocks every write under \`.claude/**\`. Edit ONLY \`./draft.json\` (absolute: ${draftPath}). Write valid JSON representing the hooks block only. Nakiros merges it back when the user clicks "Apply & Deploy".`,
          `- No findings file, no audit manifest. The user's chat is the spec.`,
          `- When the user is satisfied, they will Apply & Deploy from the UI; you do not need to call \`finish\` yourself.`,
          `- Reference: \`/${HOOKS_EXPERT_SKILL_NAME} edit\` — see SKILL.md "Edit mode" section for the procedure.`,
        ].join('\n');
      }
      const command = req.mode === 'fix' ? 'fix' : 'create';
      return [
        `/${HOOKS_EXPERT_SKILL_NAME} ${command}`,
        '',
        languageLine,
        `- Final destination: ${settingsPath} (key "hooks" — managed by Nakiros — DO NOT write to settings.json yourself).`,
        `- Project root: ${ht.projectPath}`,
        '',
        `- IMPORTANT: Claude Code blocks every write under \`.claude/**\`. Edit ONLY the workdir-relative file \`./draft.json\` (absolute: ${draftPath}). This file contains ONLY the "hooks" sub-block extracted from settings.json — it does NOT contain the full settings file. Write valid JSON representing the hooks block. Nakiros will merge it back into settings.json (preserving all other keys: permissions, env, model, etc.) when the user clicks "Terminer".`,
        `- ./draft.json was pre-seeded with the current hooks block (or "{}" if none existed). Read it first, then edit in place.`,
        `- Follow the procedure for the "${command}" command in your SKILL.md, but treat \`./draft.json\` as the target hooks block instead of any \`.claude/settings.json\` path.`,
      ].join('\n');
    }

    if (req.permissionsTarget) {
      const pt = req.permissionsTarget;
      const scope = pt.scope ?? 'project';
      const filename = scope === 'local' ? 'settings.local.json' : 'settings.json';
      const settingsPath = join(pt.projectPath, '.claude', filename);
      const draftPath = join(workdir, 'draft.json');
      if (req.mode === 'edit') {
        return [
          `/${PERMISSIONS_EXPERT_SKILL_NAME} edit`,
          '',
          languageLine,
          `- You are in **edit mode** for the permissions configuration (scope: ${scope}).`,
          `- Final destination: ${settingsPath} (key "permissions" — managed by Nakiros — DO NOT write to ${filename} yourself).`,
          `- Project root: ${pt.projectPath}`,
          `- Scope: ${scope}`,
          `- Draft file (your working copy): ${draftPath} — contains ONLY the "permissions" sub-block, not the full settings file.`,
          '',
          `**First-turn protocol — do these in order before asking the user anything:**`,
          `1. Read \`${draftPath}\` so you have the current permissions configuration in context.`,
          `2. Reply with ONE short sentence in the chat (use the language from the language directive above): "Ready to edit the ${scope} permissions configuration. What would you like to change?" / "Prêt à éditer la configuration des permissions ${scope}. Que veux-tu modifier ?"`,
          `3. Then wait for the user's instructions. Once they reply, propose edits, iterate, and re-read \`./draft.json\` after each substantive change.`,
          '',
          `- IMPORTANT: Claude Code blocks every write under \`.claude/**\`. Edit ONLY \`./draft.json\` (absolute: ${draftPath}). Write valid JSON representing the permissions block only. Nakiros merges it back when the user clicks "Apply & Deploy".`,
          `- No findings file, no audit manifest. The user's chat is the spec.`,
          `- When the user is satisfied, they will Apply & Deploy from the UI; you do not need to call \`finish\` yourself.`,
          `- Reference: \`/${PERMISSIONS_EXPERT_SKILL_NAME} edit\` — see SKILL.md "Edit mode" section for the procedure.`,
        ].join('\n');
      }
      const command = req.mode === 'fix' ? 'fix' : 'create';
      return [
        `/${PERMISSIONS_EXPERT_SKILL_NAME} ${command}`,
        '',
        languageLine,
        `- Final destination: ${settingsPath} (key "permissions" — managed by Nakiros — DO NOT write to ${filename} yourself).`,
        `- Project root: ${pt.projectPath}`,
        `- Scope: ${scope}`,
        '',
        `- IMPORTANT: Claude Code blocks every write under \`.claude/**\`. Edit ONLY the workdir-relative file \`./draft.json\` (absolute: ${draftPath}). This file contains ONLY the "permissions" sub-block extracted from ${filename} — it does NOT contain the full settings file. Write valid JSON representing the permissions block. Nakiros will merge it back into ${filename} (preserving all other keys: hooks, env, model, etc.) when the user clicks "Terminer".`,
        `- ./draft.json was pre-seeded with the current permissions block (or "{}" if none existed). Read it first, then edit in place.`,
        `- Follow the procedure for the "${command}" command in your SKILL.md, but treat \`./draft.json\` as the target permissions block instead of any \`.claude/${filename}\` path.`,
      ].join('\n');
    }

    if (req.mcpTarget) {
      const mt = req.mcpTarget;
      const mcpPath = join(mt.projectPath, '.mcp.json');
      const exists = existsSync(mcpPath);
      if (req.mode === 'edit') {
        return [
          `/${MCP_EXPERT_SKILL_NAME} edit`,
          '',
          languageLine,
          `- You are in **edit mode** for the MCP configuration.`,
          `- Project root: ${mt.projectPath}`,
          `- Target file: ${mcpPath} (${exists ? 'exists' : 'does not exist yet'})`,
          '',
          `**First-turn protocol — do these in order before asking the user anything:**`,
          exists
            ? `1. Read \`${mcpPath}\` so you have the current MCP configuration in context.`
            : `1. Note that \`${mcpPath}\` does not exist yet — you will create it from scratch.`,
          `2. Reply with ONE short sentence in the chat (use the language from the language directive above): "Ready to edit \`.mcp.json\`. What would you like to change?" / "Prêt à éditer \`.mcp.json\`. Que veux-tu modifier ?"`,
          `3. Then wait for the user's instructions. Once they reply, propose edits, iterate, and re-read the file after each substantive change.`,
          '',
          `- You may edit the target file directly with your Write/Edit tools (Nakiros runs you with permissions on the project tree).`,
          `- No findings file, no audit manifest. The user's chat is the spec.`,
          `- When the user is satisfied, they will Apply & Deploy from the UI; you do not need to call \`finish\` yourself.`,
          `- Reference: \`/${MCP_EXPERT_SKILL_NAME} edit\` — see SKILL.md "Edit mode" section for the procedure.`,
        ].join('\n');
      }
      const command = req.mode === 'fix' ? 'fix' : 'create';
      return [
        `/${MCP_EXPERT_SKILL_NAME} ${command}`,
        '',
        languageLine,
        `- Operate on the project MCP configuration file.`,
        `- Project root: ${mt.projectPath}`,
        `- Target file: ${mcpPath} (${exists ? 'exists' : 'does not exist yet'})`,
        '',
        `- You may edit the target file directly with your Write/Edit tools (Nakiros runs you with permissions on the project tree).`,
        `- Follow the procedure for the "${command}" command in your SKILL.md.`,
      ].join('\n');
    }

    if (req.outputStylesTarget) {
      const ost = req.outputStylesTarget;
      const finalPath = join(ost.projectPath, '.claude', 'output-styles', ost.styleName);
      const draftPath = join(workdir, 'draft.md');
      const seeded = existsSync(draftPath);
      if (req.mode === 'edit') {
        return [
          `/${OUTPUT_STYLES_EXPERT_SKILL_NAME} edit`,
          '',
          languageLine,
          `- You are in **edit mode** for output style \`${ost.styleName}\`.`,
          `- Final destination: ${finalPath} (managed by Nakiros — DO NOT write there yourself).`,
          `- Project root: ${ost.projectPath}`,
          `- Draft file (your working copy): ${draftPath}`,
          '',
          `**First-turn protocol — do these in order before asking the user anything:**`,
          seeded
            ? `1. Read \`${draftPath}\` so you have the current output style content in context.`
            : `1. Note that \`${draftPath}\` does not exist yet — you will create it from scratch.`,
          `2. Reply with ONE short sentence in the chat (use the language from the language directive above): "Ready to edit output style \`${ost.styleName}\`. What would you like to change?" / "Prêt à éditer le style de sortie \`${ost.styleName}\`. Que veux-tu modifier ?"`,
          `3. Then wait for the user's instructions. Once they reply, propose edits, iterate, and re-read \`./draft.md\` after each substantive change.`,
          '',
          `- IMPORTANT: Claude Code blocks every write under \`.claude/**\`. Write/Edit ONLY at \`./draft.md\` (absolute: ${draftPath}). Nakiros will copy it to the final destination when the user clicks "Apply & Deploy".`,
          `- No findings file, no audit manifest. The user's chat is the spec.`,
          `- When the user is satisfied, they will Apply & Deploy from the UI; you do not need to call \`finish\` yourself.`,
          `- Reference: \`/${OUTPUT_STYLES_EXPERT_SKILL_NAME} edit\` — see SKILL.md "Edit mode" section for the procedure.`,
        ].join('\n');
      }
      const command = req.mode === 'fix' ? 'fix' : 'create';
      return [
        `/${OUTPUT_STYLES_EXPERT_SKILL_NAME} ${command}`,
        '',
        languageLine,
        `- Final destination: ${finalPath} (managed by Nakiros — DO NOT write there yourself).`,
        `- Project root: ${ost.projectPath}`,
        `- Style name (relative to .claude/output-styles/): ${ost.styleName}`,
        '',
        `- IMPORTANT: Claude Code blocks every write under \`.claude/**\`. Write/Edit your style ONLY at the workdir-relative path \`./draft.md\` (absolute: ${draftPath}). Nakiros will copy it to the final destination when the user clicks "Terminer".`,
        seeded
          ? `- An existing copy of the style was seeded at ./draft.md. Read it first, then edit in place.`
          : `- ./draft.md does not exist yet — create it with the generated content.`,
        `- Follow the procedure for the "${command}" command in your SKILL.md, but treat \`./draft.md\` as the target instead of any \`.claude/output-styles/\` path.`,
      ].join('\n');
    }

    if (req.mode === 'edit') {
      const iterLine = extras.latestIteration !== null && extras.latestIteration !== undefined
        ? `- Latest eval iteration was copied to \`./evals/workspace/iteration-${extras.latestIteration}/\`. You may read it for context.`
        : '- No prior eval iteration in this workdir.';
      const seedIter = extras.latestIteration ?? 0;
      const nextIterHint = seedIter > 0 ? seedIter + 1 : 1;
      return [
        `/${FACTORY_SKILL_NAME} edit ${req.skillName}`,
        '',
        languageLine,
        `- You are in **edit mode** for skill \`${req.skillName}\`.`,
        `- Working directory (full skill copy): ${workdir}`,
        `- All paths are relative to cwd: \`SKILL.md\`, \`references/\`, \`assets/\`, \`evals/\`, etc.`,
        '',
        `**First-turn protocol — do these in order before asking the user anything:**`,
        `1. Read \`${workdir}/SKILL.md\` so you have the current skill definition in context. If \`evals/evals.json\` exists, read it too for context on the eval suite.`,
        `2. Reply with ONE short sentence in the chat (use the language from the language directive above): "Ready to edit skill \`${req.skillName}\`. What would you like to change?" / "Prêt à éditer le skill \`${req.skillName}\`. Que veux-tu modifier ?"`,
        `3. Then wait for the user's instructions. Once they reply, propose edits, iterate, and re-read the relevant files after each substantive change.`,
        '',
        `- IMPORTANT: before declaring any file missing, run \`ls -la <dir>/\` (or Glob) RECURSIVELY. Do not overwrite existing files without reading them first — the copy of the skill is complete.`,
        iterLine,
        `- Between your turns, the user may click "Run evals" to re-run the eval suite against your in-progress edits. The first fresh iteration will appear in \`./evals/workspace/iteration-${nextIterHint}/\`. Before you declare the edit done, suggest running evals and read the latest benchmark.json to confirm no regression.`,
        `- No audit findings, no audit manifest. The user's chat is the spec.`,
        `- When the user is satisfied, they will Apply & Deploy from the UI; you do not need to call \`finish\` yourself.`,
        `- Do not modify \`.claude/settings.local.json\` in this workdir — it's Nakiros's runtime config.`,
        `- Reference: \`/${FACTORY_SKILL_NAME} edit\` — see SKILL.md "Edit mode" section for the procedure.`,
      ].join('\n');
    }

    if (req.mode === 'fix') {
      const auditLine = extras.latestAuditFile
        ? `- Latest audit was copied to \`./audits/${extras.latestAuditFile}\` — read it first.`
        : '- No prior audit for this skill — Nakiros did not copy any `./audits/` file.';
      const iterLine = extras.latestIteration !== null && extras.latestIteration !== undefined
        ? `- Latest eval iteration was copied to \`./evals/workspace/iteration-${extras.latestIteration}/\`. Read its \`benchmark.json\` and \`feedback.json\` for signals. Older iterations were intentionally NOT copied.`
        : '- No prior eval iteration — Nakiros did not copy any `./evals/workspace/`.';

      const seedIter = extras.latestIteration ?? 0;
      const nextIterHint = seedIter > 0 ? seedIter + 1 : 1;
      return `/${FACTORY_SKILL_NAME} fix ${req.skillName}

You are working on a TEMPORARY copy of the skill, located at your current working directory (\`${workdir}\`).
${languageLine}
- Edit files here freely — all changes are synced back to the real skill (\`${extras.realSkillDir}\`) when the user clicks "Sync to skill". If the user clicks "Discard", your changes are thrown away.
- All paths are relative to cwd: \`SKILL.md\`, \`references/\`, \`assets/\`, \`evals/\`, etc.
- IMPORTANT: before declaring any file missing, run \`ls -la <dir>/\` (or Glob) RECURSIVELY. Empty-looking subdirs usually just weren't inspected. Do not overwrite existing files without reading them first — the copy of the skill is complete.
${auditLine}
${iterLine}
- Between your turns, the user may click "Run evals" to re-run the eval suite against your in-progress edits. The first fresh iteration will appear in \`./evals/workspace/iteration-${nextIterHint}/\`, the next in \`iteration-${nextIterHint + 1}/\`, etc. Before you declare the fix ready, suggest running evals and then read the latest benchmark.json to confirm the delta is positive (no regression).
- Do not modify \`.claude/settings.local.json\` in this workdir — it's Nakiros's runtime config.`;
    }

    return `/${FACTORY_SKILL_NAME} create ${req.skillName}

You are creating a NEW skill from scratch. Your current working directory is a TEMPORARY workdir (\`${workdir}\`).
${languageLine}
- Write every file of the skill here: \`SKILL.md\`, \`references/\`, \`assets/\`, \`scripts/\`, \`templates/\`, \`evals/evals.json\`, etc.
- All paths are relative to cwd. Do NOT try to write to \`${extras.realSkillDir}\` directly — Nakiros will copy the whole workdir there when the user clicks "Create skill".
- If the user clicks "Discard", everything is thrown away.
- Follow your own \`create\` procedure: ASK the user the design questions first, then write using \`assets/templates/skill-template.md\` as the skeleton.
- Do not modify \`.claude/settings.local.json\` in this workdir — it's Nakiros's runtime config.`;
  },

  createInitialRun(req, runId, workdir): AuditRun {
    return {
      runId,
      scope: req.scope,
      projectId: req.projectId,
      pluginName: req.pluginName,
      marketplaceName: req.marketplaceName,
      skillName: req.skillName,
      status: 'starting',
      sessionId: null,
      workdir,
      reportPath: null,
      turns: [],
      tokensUsed: 0,
      durationMs: 0,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      error: null,
      targets: [],
      findings: [],
      claudemdTarget: req.claudemdTarget,
      rulesTarget: req.rulesTarget,
      subagentsTarget: req.subagentsTarget,
      hooksTarget: req.hooksTarget,
      permissionsTarget: req.permissionsTarget,
      mcpTarget: req.mcpTarget,
      outputStylesTarget: req.outputStylesTarget,
    };
  },

  buildCliArgs(prompt, entry, isFirstTurn) {
    return {
      prompt,
      resumeSessionId: isFirstTurn ? undefined : (entry.run.sessionId ?? undefined),
      // Fix/create runs are user-initiated and explicitly modify the skill directory.
      // The workdir is scoped (nothing else is reachable); .claude/** files stay blocked
      // by Claude Code's hard rule even with `acceptEdits`.
      skipPermissions: true,
    };
  },

  /**
   * Tail `outputs/fix-targets.jsonl` + `outputs/fix-findings.jsonl` while the
   * agent is alive. Self-arrests on terminal status (also covered by
   * `cleanupOnTerminal` / `onTurnFailed`).
   */
  afterStart(entry) {
    entry.extras.syncTimer = setInterval(() => {
      const status = entry.run.status;
      if (entry.killed || status === 'completed' || status === 'failed' || status === 'stopped') {
        stopProgressPolling(entry.extras);
        return;
      }
      syncFixProgress(entry);
    }, PROGRESS_POLL_MS);
  },

  /** Fix/create runs never auto-complete — always wait for user input after a turn. */
  onTurnComplete(entry, helpers) {
    // One last sync before handing back to the user — captures any line the
    // agent appended in the very last tool call before returning.
    syncFixProgress(entry);
    helpers.wait(entry);
  },

  /** Discard temp modifications on failure — same policy as stop. */
  onTurnFailed(entry) {
    stopProgressPolling(entry.extras);
    cleanupRunWorkdir(entry.run.workdir);
  },

  cleanupOnTerminal(entry) {
    stopProgressPolling(entry.extras);
    cleanupRunWorkdir(entry.run.workdir);
  },

  /**
   * User-confirmed completion. Sync the sandbox workdir BACK to the target
   * skill directory:
   *   - Fix:    target = `<project>/.claude/skills/<name>/` (replaces source).
   *   - Create: target = `<project>/.claude/skills-draft/<name>/` (creates
   *             the draft folder fresh — surfaces in the listing as a Draft).
   *
   * `cleanupOnTerminal` then tears down the sandbox + Claude-Code project
   * entry. For create, the safety check below refuses sync-back if the
   * target somehow appeared during the run.
   */
  finish(entry, opts) {
    const { extras, run } = entry;
    console.log(
      `[fix-runner] finish start runId=${run.runId} mode=${extras.mode} realSkillDir=${extras.realSkillDir} workdir=${run.workdir}`,
    );

    // Output-styles use the workdir-draft pattern: the agent edits
    // `<workdir>/draft.md`, Nakiros copies it back to
    // `<projectPath>/.claude/output-styles/<styleName>` on finish (Claude Code
    // hard-blocks writes inside `.claude/**`).
    if (run.outputStylesTarget) {
      const ost = run.outputStylesTarget;
      const draftPath = join(run.workdir, 'draft.md');
      const finalPath = join(ost.projectPath, '.claude', 'output-styles', ost.styleName);
      try {
        if (!existsSync(draftPath)) {
          run.status = 'failed';
          run.error =
            'Le fichier draft.md est absent du workdir. L\'agent n\'a probablement rien généré — relance la création.';
          run.finishedAt = new Date().toISOString();
          opts.onEvent({ runId: run.runId, event: { type: 'done', exitCode: 1, error: run.error } });
          return;
        }
        mkdirSync(dirname(finalPath), { recursive: true });
        copyFileSync(draftPath, finalPath);
      } catch (err) {
        run.status = 'failed';
        run.error = `Sync-back vers ${finalPath} a échoué: ${(err as Error).message}`;
        run.finishedAt = new Date().toISOString();
        opts.onEvent({ runId: run.runId, event: { type: 'done', exitCode: 1, error: run.error } });
        return;
      }
      run.status = 'completed';
      run.finishedAt = new Date().toISOString();
      run.error = null;
      console.log(`[skill-agent-runner] ${extras.mode} ${run.runId} completed (workdir draft → ${finalPath})`);
      opts.onEvent({ runId: run.runId, event: { type: 'status', status: 'completed' } });
      opts.onEvent({ runId: run.runId, event: { type: 'done', exitCode: 0 } });
      return;
    }

    // Rules: workdir-draft pattern — copy draft.md back to .claude/rules/<name>.
    if (run.rulesTarget) {
      const rt = run.rulesTarget;
      const draftPath = join(run.workdir, 'draft.md');
      const finalPath = join(rt.projectPath, '.claude', 'rules', rt.ruleName);
      try {
        if (!existsSync(draftPath)) {
          run.status = 'failed';
          run.error =
            'Le fichier draft.md est absent du workdir. L\'agent n\'a probablement rien généré — relance la création.';
          run.finishedAt = new Date().toISOString();
          opts.onEvent({ runId: run.runId, event: { type: 'done', exitCode: 1, error: run.error } });
          return;
        }
        mkdirSync(dirname(finalPath), { recursive: true });
        copyFileSync(draftPath, finalPath);
      } catch (err) {
        run.status = 'failed';
        run.error = `Sync-back vers ${finalPath} a échoué: ${(err as Error).message}`;
        run.finishedAt = new Date().toISOString();
        opts.onEvent({ runId: run.runId, event: { type: 'done', exitCode: 1, error: run.error } });
        return;
      }
      run.status = 'completed';
      run.finishedAt = new Date().toISOString();
      run.error = null;
      console.log(`[skill-agent-runner] ${extras.mode} ${run.runId} completed (workdir draft → ${finalPath})`);
      opts.onEvent({ runId: run.runId, event: { type: 'status', status: 'completed' } });
      opts.onEvent({ runId: run.runId, event: { type: 'done', exitCode: 0 } });
      return;
    }

    // Subagents: workdir-draft pattern — copy draft.md back to .claude/agents/<name>.
    if (run.subagentsTarget) {
      const st = run.subagentsTarget;
      const draftPath = join(run.workdir, 'draft.md');
      const finalPath = join(st.projectPath, '.claude', 'agents', st.subagentName);
      try {
        if (!existsSync(draftPath)) {
          run.status = 'failed';
          run.error =
            'Le fichier draft.md est absent du workdir. L\'agent n\'a probablement rien généré — relance la création.';
          run.finishedAt = new Date().toISOString();
          opts.onEvent({ runId: run.runId, event: { type: 'done', exitCode: 1, error: run.error } });
          return;
        }
        mkdirSync(dirname(finalPath), { recursive: true });
        copyFileSync(draftPath, finalPath);
      } catch (err) {
        run.status = 'failed';
        run.error = `Sync-back vers ${finalPath} a échoué: ${(err as Error).message}`;
        run.finishedAt = new Date().toISOString();
        opts.onEvent({ runId: run.runId, event: { type: 'done', exitCode: 1, error: run.error } });
        return;
      }
      run.status = 'completed';
      run.finishedAt = new Date().toISOString();
      run.error = null;
      console.log(`[skill-agent-runner] ${extras.mode} ${run.runId} completed (workdir draft → ${finalPath})`);
      opts.onEvent({ runId: run.runId, event: { type: 'status', status: 'completed' } });
      opts.onEvent({ runId: run.runId, event: { type: 'done', exitCode: 0 } });
      return;
    }

    // Hooks: workdir-draft pattern — read draft.json and merge back into
    // settings.json via the hooks-writer service (preserves all other keys).
    if (run.hooksTarget) {
      const ht = run.hooksTarget;
      const draftPath = join(run.workdir, 'draft.json');
      try {
        if (!existsSync(draftPath)) {
          run.status = 'failed';
          run.error =
            'Le fichier draft.json est absent du workdir. L\'agent n\'a probablement rien généré — relance la création.';
          run.finishedAt = new Date().toISOString();
          opts.onEvent({ runId: run.runId, event: { type: 'done', exitCode: 1, error: run.error } });
          return;
        }
        const draftContent = readFileSync(draftPath, 'utf8');
        // Use the current mtime for the optimistic-lock — if the file was
        // modified externally during the run we still proceed (best-effort).
        const settingsPath = join(ht.projectPath, '.claude', 'settings.json');
        let mtimeAtRead = '';
        try {
          if (existsSync(settingsPath)) {
            mtimeAtRead = statSync(settingsPath).mtime.toISOString();
          }
        } catch {
          // ignore — proceed without lock
        }
        const result = saveHooksBlock(ht.projectPath, draftContent, mtimeAtRead);
        if (!result.ok) {
          run.status = 'failed';
          run.error = `Merge hooks échoué (${result.code}): ${result.message}`;
          run.finishedAt = new Date().toISOString();
          opts.onEvent({ runId: run.runId, event: { type: 'done', exitCode: 1, error: run.error } });
          return;
        }
      } catch (err) {
        run.status = 'failed';
        run.error = `Sync-back hooks a échoué: ${(err as Error).message}`;
        run.finishedAt = new Date().toISOString();
        opts.onEvent({ runId: run.runId, event: { type: 'done', exitCode: 1, error: run.error } });
        return;
      }
      run.status = 'completed';
      run.finishedAt = new Date().toISOString();
      run.error = null;
      console.log(`[skill-agent-runner] ${extras.mode} ${run.runId} completed (hooks draft → settings.json)`);
      opts.onEvent({ runId: run.runId, event: { type: 'status', status: 'completed' } });
      opts.onEvent({ runId: run.runId, event: { type: 'done', exitCode: 0 } });
      return;
    }

    // Permissions: workdir-draft pattern — read draft.json and merge back into
    // the scoped settings file via the permissions-writer service.
    if (run.permissionsTarget) {
      const pt = run.permissionsTarget;
      const scope = pt.scope ?? 'project';
      const filename = scope === 'local' ? 'settings.local.json' : 'settings.json';
      const draftPath = join(run.workdir, 'draft.json');
      try {
        if (!existsSync(draftPath)) {
          run.status = 'failed';
          run.error =
            'Le fichier draft.json est absent du workdir. L\'agent n\'a probablement rien généré — relance la création.';
          run.finishedAt = new Date().toISOString();
          opts.onEvent({ runId: run.runId, event: { type: 'done', exitCode: 1, error: run.error } });
          return;
        }
        const draftContent = readFileSync(draftPath, 'utf8');
        // Use the current mtime for the optimistic-lock (best-effort).
        const settingsPath = join(pt.projectPath, '.claude', filename);
        let mtimeAtRead = '';
        try {
          if (existsSync(settingsPath)) {
            mtimeAtRead = statSync(settingsPath).mtime.toISOString();
          }
        } catch {
          // ignore — proceed without lock
        }
        const result = savePermissionsBlock(pt.projectPath, scope, draftContent, mtimeAtRead);
        if (!result.ok) {
          run.status = 'failed';
          run.error = `Merge permissions échoué (${result.code}): ${result.message}`;
          run.finishedAt = new Date().toISOString();
          opts.onEvent({ runId: run.runId, event: { type: 'done', exitCode: 1, error: run.error } });
          return;
        }
      } catch (err) {
        run.status = 'failed';
        run.error = `Sync-back permissions a échoué: ${(err as Error).message}`;
        run.finishedAt = new Date().toISOString();
        opts.onEvent({ runId: run.runId, event: { type: 'done', exitCode: 1, error: run.error } });
        return;
      }
      run.status = 'completed';
      run.finishedAt = new Date().toISOString();
      run.error = null;
      console.log(`[skill-agent-runner] ${extras.mode} ${run.runId} completed (permissions draft → ${filename})`);
      opts.onEvent({ runId: run.runId, event: { type: 'status', status: 'completed' } });
      opts.onEvent({ runId: run.runId, event: { type: 'done', exitCode: 0 } });
      return;
    }

    // CLAUDE.md and MCP targets write outside `.claude/**` so direct edits
    // by the agent are permitted — no workdir-draft sync-back needed.
    if (run.claudemdTarget || run.mcpTarget) {
      run.status = 'completed';
      run.finishedAt = new Date().toISOString();
      run.error = null;
      console.log(`[skill-agent-runner] ${extras.mode} ${run.runId} completed (direct edit — no sync-back)`);
      opts.onEvent({ runId: run.runId, event: { type: 'status', status: 'completed' } });
      opts.onEvent({ runId: run.runId, event: { type: 'done', exitCode: 0 } });
      return;
    }

    if (extras.mode === 'create' && existsSync(extras.realSkillDir)) {
      run.status = 'failed';
      run.error = `Cannot finalize create: "${extras.realSkillDir}" already exists. Discard this run and pick a different skill name.`;
      run.finishedAt = new Date().toISOString();
      opts.onEvent({ runId: run.runId, event: { type: 'done', exitCode: 1, error: run.error } });
      return;
    }

    let syncInfo = '';
    try {
      const result = syncBackToSkill(run.workdir, extras.realSkillDir);
      syncInfo = ` (${result.filesCopied} file${result.filesCopied === 1 ? '' : 's'} synced)`;
    } catch (err) {
      run.status = 'failed';
      run.error = `Sync-back failed: ${(err as Error).message}`;
      run.finishedAt = new Date().toISOString();
      opts.onEvent({ runId: run.runId, event: { type: 'done', exitCode: 1, error: run.error } });
      return;
    }

    // Promote the latest `'fix-temp'` iter of this run to `'skill'` so the
    // next time the user opens the skill, the matrix shows the validated
    // iteration as a regular history entry — no need to re-run an eval.
    // Earlier fix-temp iterations of the same run remain `'fix-temp'` so
    // the user keeps the experimentation trail.
    try {
      promoteLatestFixTempIteration(extras.realSkillDir, run.runId);
    } catch (err) {
      console.warn(
        `[fix-runner] Failed to promote fix-temp iteration on finish: ${(err as Error).message}`,
      );
    }

    run.status = 'completed';
    run.finishedAt = new Date().toISOString();
    run.error = null;
    console.log(`[skill-agent-runner] ${extras.mode} ${run.runId} completed${syncInfo}`);
    opts.onEvent({ runId: run.runId, event: { type: 'status', status: 'completed' } });
    opts.onEvent({ runId: run.runId, event: { type: 'done', exitCode: 0 } });
  },

  findActiveForTarget(req, registry) {
    for (const entry of registry.values()) {
      if (entry.extras.mode !== req.mode) continue;
      const { run } = entry;
      if (run.scope !== req.scope) continue;
      if (run.projectId !== req.projectId) continue;
      if (run.skillName !== req.skillName) continue;
      if (req.claudemdTarget || run.claudemdTarget) {
        if (!req.claudemdTarget || !run.claudemdTarget) continue;
        if (req.claudemdTarget.projectPath !== run.claudemdTarget.projectPath) continue;
      }
      if (req.rulesTarget || run.rulesTarget) {
        if (!req.rulesTarget || !run.rulesTarget) continue;
        if (req.rulesTarget.projectId !== run.rulesTarget.projectId) continue;
        if (req.rulesTarget.ruleName !== run.rulesTarget.ruleName) continue;
      }
      // Subagents runs disambiguate by projectId + subagentName.
      if (req.subagentsTarget || run.subagentsTarget) {
        if (!req.subagentsTarget || !run.subagentsTarget) continue;
        if (req.subagentsTarget.projectId !== run.subagentsTarget.projectId) continue;
        if (req.subagentsTarget.subagentName !== run.subagentsTarget.subagentName) continue;
      }
      // Hooks runs: singleton per project — disambiguate by projectId only.
      if (req.hooksTarget || run.hooksTarget) {
        if (!req.hooksTarget || !run.hooksTarget) continue;
        if (req.hooksTarget.projectId !== run.hooksTarget.projectId) continue;
      }
      // Permissions runs: one per (projectId, scope) — a project fix and a local
      // fix may run concurrently.
      if (req.permissionsTarget || run.permissionsTarget) {
        if (!req.permissionsTarget || !run.permissionsTarget) continue;
        if (req.permissionsTarget.projectId !== run.permissionsTarget.projectId) continue;
        const reqScope = req.permissionsTarget.scope ?? 'project';
        const runScope = run.permissionsTarget.scope ?? 'project';
        if (reqScope !== runScope) continue;
      }
      // MCP runs: singleton per project — disambiguate by projectId only.
      if (req.mcpTarget || run.mcpTarget) {
        if (!req.mcpTarget || !run.mcpTarget) continue;
        if (req.mcpTarget.projectId !== run.mcpTarget.projectId) continue;
      }
      // Output-styles runs disambiguate by projectId + styleName.
      if (req.outputStylesTarget || run.outputStylesTarget) {
        if (!req.outputStylesTarget || !run.outputStylesTarget) continue;
        if (req.outputStylesTarget.projectId !== run.outputStylesTarget.projectId) continue;
        if (req.outputStylesTarget.styleName !== run.outputStylesTarget.styleName) continue;
      }
      if (isActiveRunStatus(run.status)) return entry;
    }
    return null;
  },

  rehydrate(persisted, workdir): RehydrateResult<AuditRun, SkillAgentExtras> {
    const blob = persisted as
      | (AuditRun & {
          _extras?: SkillAgentExtras;
          _mode?: SkillAgentMode;
          _realSkillDir?: string;
        })
      | null;
    if (!blob || !blob.runId) return { kind: 'cleanup' };

    // Legacy persistence stored mode + realSkillDir as `_mode` / `_realSkillDir`.
    const mode = blob._extras?.mode ?? blob._mode;
    const realSkillDir = blob._extras?.realSkillDir ?? blob._realSkillDir;
    if (!mode || !realSkillDir) return { kind: 'cleanup' };

    // Terminal runs that somehow didn't clean up — discard.
    if (blob.status === 'completed' || blob.status === 'failed' || blob.status === 'stopped') {
      return { kind: 'cleanup' };
    }

    // Non-terminal → rehydrate. Subprocess is gone.
    //
    // Fix: if we have a resumable sessionId we restore to `waiting_for_input`,
    // otherwise we collapse to `stopped` so the user can dismiss the
    // half-applied sandbox.
    //
    // Create AND Edit: ALWAYS restore to `waiting_for_input` regardless of
    // sessionId. The sandbox under `~/.nakiros/tmp-skills/<runId>/` is the
    // user's draft — marking it terminal here would (1) hide it from the
    // listing and (2) drop the cwd from `collectLiveProjectEntryNames`, letting
    // the boot sweep wipe `~/.claude/projects/<encoded>/<sessionId>.jsonl` and
    // erase the conversation history. Keeping it active preserves the tmp,
    // the Claude session jsonl, and lets the user resume on the next message
    // (with `--resume` if sessionId is recovered, fresh turn otherwise).
    const wasActive = blob.status === 'starting' || blob.status === 'running';
    // run.json may not have flushed sessionId before the crash. Recover it
    // from the most recent `*.jsonl` Claude wrote under the cwd-encoded
    // project entry — that's where `getFixTimeline` will read history from.
    const recoveredSessionId =
      blob.sessionId ?? findLatestClaudeSessionId(workdir);
    const sessionFile = recoveredSessionId
      ? join(
          homedir(),
          '.claude',
          'projects',
          encodeProjectPath(workdir),
          `${recoveredSessionId}.jsonl`,
        )
      : null;
    const canResume =
      !wasActive ||
      (Boolean(recoveredSessionId) && sessionFile !== null && existsSync(sessionFile));
    const restoredStatus: AuditRun['status'] =
      mode === 'create' || mode === 'edit' || canResume ? 'waiting_for_input' : 'stopped';
    const restoredRun: AuditRun = {
      runId: blob.runId,
      scope: blob.scope,
      projectId: blob.projectId,
      pluginName: blob.pluginName,
      marketplaceName: blob.marketplaceName,
      skillName: blob.skillName,
      status: restoredStatus,
      sessionId: recoveredSessionId,
      workdir,
      reportPath: blob.reportPath ?? null,
      turns: Array.isArray(blob.turns) ? blob.turns : [],
      tokensUsed: typeof blob.tokensUsed === 'number' ? blob.tokensUsed : 0,
      durationMs: typeof blob.durationMs === 'number' ? blob.durationMs : 0,
      startedAt: blob.startedAt ?? new Date().toISOString(),
      finishedAt: restoredStatus === 'stopped' ? new Date().toISOString() : null,
      error: null,
      interruptedByReboot:
        restoredStatus === 'waiting_for_input' && wasActive
          ? true
          : blob.interruptedByReboot,
      // Restore the live fix sidebar state — without this, a daemon restart
      // would surface an empty checklist even after the agent had registered
      // targets. The poller resumes from the same line indices via extras.
      targets: Array.isArray(blob.targets) ? blob.targets : [],
      findings: Array.isArray(blob.findings) ? blob.findings : [],
      claudemdTarget: blob.claudemdTarget,
      rulesTarget: blob.rulesTarget,
      subagentsTarget: blob.subagentsTarget,
      hooksTarget: blob.hooksTarget,
      permissionsTarget: blob.permissionsTarget,
      mcpTarget: blob.mcpTarget,
      outputStylesTarget: blob.outputStylesTarget,
    };

    console.log(
      `[skill-agent-runner] Restored ${mode} run ${restoredRun.runId} for "${restoredRun.skillName}" (sessionId=${restoredRun.sessionId ?? 'none'})`,
    );

    return {
      kind: 'rehydrate',
      run: restoredRun,
      extras: {
        mode,
        realSkillDir,
        syncTimer: null,
        // Resume the JSONL tail from where we left off. Persisted line counts
        // come from `_extras` if the daemon wrote them; otherwise re-derive
        // from the array length we just restored (works for targets since
        // each line registered a new id; rare double-emit on the boundary
        // line is harmless because we dedup by id).
        targetsLineCount:
          typeof blob._extras?.targetsLineCount === 'number'
            ? blob._extras.targetsLineCount
            : (Array.isArray(blob.targets) ? blob.targets.length : 0),
      },
    };
  },
};

const runner = createRunner(spec);

// ─── Public API ─────────────────────────────────────────────────────────────

interface ExternalRunOpts {
  skillDir: string;
  onEvent(event: AuditRunEvent): void;
}

function asInternalOpts(opts: ExternalRunOpts): RunOpts<FixEvent> {
  return { onEvent: opts.onEvent };
}

/**
 * Boot-time recovery: scan `~/.nakiros/tmp-skills/*` and rehydrate any
 * non-terminal fix/create run. Terminal leftovers are deleted. Reusable
 * subprocesses are gone after a daemon restart, but the agent's `sessionId`
 * is preserved — the next `sendUserMessage` spawns a fresh process with
 * `--resume <sessionId>` and the conversation picks back up.
 */
export function restoreOrCleanupTempWorkdirs(): void {
  runner.restoreOrCleanup(() => {
    /* no broadcast on boot — first IPC call rebinds */
  });
}

/** Back-compat alias — old name from before we added restore semantics. */
export const cleanupOrphanTempWorkdirs = restoreOrCleanupTempWorkdirs;

/**
 * Boot-time sweep of fix-temp artefacts across every known skill directory.
 *
 *  1. **Orphan `.fix-temp/<fixRunId>/`**: if no fix run with that id is in
 *     the registry (active or rehydrated waiting), wipe the directory.
 *     Covers the case where the user closed the app mid-fix without
 *     finish/stop.
 *  2. **Legacy `iteration-N/` residue with `kind: 'fix-temp'` in the main
 *     workspace**: produced by an older buggy build that wrote fix-temp
 *     iters into `evals/workspace/`. Wipe them — they could never be
 *     surfaced correctly anyway.
 *
 * Both passes are best-effort: per-skill failures are logged and don't
 * block the rest of boot.
 */
export function sweepFixTempArtifacts(skillDirs: string[]): {
  orphansDeleted: number;
  legacyDeleted: number;
} {
  const knownFixRunIds = new Set<string>();
  for (const run of runner.registry().values()) {
    knownFixRunIds.add(run.run.runId);
  }

  let orphansDeleted = 0;
  let legacyDeleted = 0;

  for (const skillDir of skillDirs) {
    // Pass 1: orphan .fix-temp/<fixRunId>/ session dirs.
    const fixTempRoot = join(skillDir, 'evals', '.fix-temp');
    if (existsSync(fixTempRoot)) {
      let entries: Dirent[] = [];
      try {
        entries = readdirSync(fixTempRoot, { withFileTypes: true }) as Dirent[];
      } catch (err) {
        console.warn(
          `[fix-runner] sweepFixTempArtifacts read ${fixTempRoot} failed: ${(err as Error).message}`,
        );
      }
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (knownFixRunIds.has(entry.name)) continue;
        const target = join(fixTempRoot, entry.name);
        try {
          rmSync(target, { recursive: true, force: true });
          orphansDeleted++;
        } catch (err) {
          console.warn(
            `[fix-runner] Failed to delete orphan fix-temp ${target}: ${(err as Error).message}`,
          );
        }
      }
    }

    // Pass 2: legacy fix-temp iters that were mistakenly written under the
    // main workspace by older builds.
    const workspaceDir = join(skillDir, 'evals', 'workspace');
    if (!existsSync(workspaceDir)) continue;
    let wsEntries: Dirent[] = [];
    try {
      wsEntries = readdirSync(workspaceDir, { withFileTypes: true }) as Dirent[];
    } catch {
      continue;
    }
    for (const entry of wsEntries) {
      if (!entry.isDirectory() || !entry.name.startsWith('iteration-')) continue;
      const iterDir = join(workspaceDir, entry.name);
      const benchmarkPath = join(iterDir, 'benchmark.json');
      if (!existsSync(benchmarkPath)) continue;
      let benchmark: { kind?: string };
      try {
        benchmark = JSON.parse(readFileSync(benchmarkPath, 'utf8'));
      } catch {
        continue;
      }
      if (benchmark.kind !== 'fix-temp') continue;
      try {
        rmSync(iterDir, { recursive: true, force: true });
        legacyDeleted++;
      } catch (err) {
        console.warn(
          `[fix-runner] Failed to delete legacy fix-temp iter ${iterDir}: ${(err as Error).message}`,
        );
      }
    }
  }

  return { orphansDeleted, legacyDeleted };
}

/**
 * Start (or resume) a fix run on an existing skill. Seeds the temp workdir
 * with a lean copy of the skill (source + latest audit + latest iteration),
 * then lets the agent edit under `/nakiros-skill-factory fix`. Sync-back to
 * the real skill happens on {@link finishFix}.
 */
export function startFix(request: StartAuditRequest, opts: ExternalRunOpts): AuditRun {
  return runner.start({ ...request, mode: 'fix', skillDir: opts.skillDir }, asInternalOpts(opts));
}

/**
 * Start (or resume) a create run for a new skill. Starts with an empty temp
 * workdir; the agent writes SKILL.md + friends from scratch. Sync-back only
 * fires if the target skill still doesn't exist when the user clicks Create.
 */
export function startCreate(request: StartAuditRequest, opts: ExternalRunOpts): AuditRun {
  return runner.start({ ...request, mode: 'create', skillDir: opts.skillDir }, asInternalOpts(opts));
}

/**
 * Forward a user message to a fix/create run in `waiting_for_input`. Re-binds
 * the event log, executes one claude turn via `--resume`, then transitions
 * back to `waiting_for_input` so the user can continue (fix runs never
 * auto-complete).
 */
export async function sendFixUserMessage(runId: string, message: string, opts: ExternalRunOpts): Promise<void> {
  await runner.sendUserMessage(runId, message, asInternalOpts(opts));
}

/**
 * User-confirmed completion. Syncs the temp workdir BACK to the real skill,
 * tears down the workdir + event log, and marks the run completed.
 */
export function finishFix(runId: string, opts: ExternalRunOpts): void {
  runner.finish(runId, asInternalOpts(opts));
}

/**
 * Cancel an in-flight fix/create run: `SIGTERM` the child, collapse status to
 * `stopped`, emit final events, delete the temp workdir + event log. Stopped
 * runs do NOT sync back — temp modifications are discarded.
 *
 * Also deletes every `'fix-temp'` iteration of this run from the real skill
 * workspace (they were tagged with `fix_run_id` at write time). The user
 * explicitly rejected these results, so they shouldn't pollute the matrix.
 */
export function stopFix(runId: string): void {
  // Capture the real skill dir BEFORE runner.stop tears down the entry —
  // afterwards `runner.registry().get(runId)` returns undefined.
  const realSkillDir = runner.registry().get(runId)?.extras.realSkillDir ?? null;
  runner.stop(runId);
  if (realSkillDir) {
    try {
      deleteFixTempIterations(realSkillDir, runId);
    } catch (err) {
      console.warn(
        `[fix-runner] Failed to clean up fix-temp iterations on stop: ${(err as Error).message}`,
      );
    }
  }
}

// Create runs share the same registry and lifecycle as fix. The runner spec
// branches internally on `mode === 'create'` only for the sync-back target
// (draft folder vs prod skill folder). Discard, cleanup and stream API are
// identical: a create sandbox under `~/.nakiros/tmp-skills/<runId>/` is wiped
// the same way a fix sandbox is.
export const finishCreate = finishFix;
export const stopCreate = stopFix;
export const sendCreateUserMessage = sendFixUserMessage;
export const getCreateRun = getFixRun;
export const getCreateTempWorkdir = getFixTempWorkdir;
export const getCreateRealSkillDir = getFixRealSkillDir;
export const getCreateBufferedEvents = getFixBufferedEvents;

/**
 * Start (or resume) an edit run for an existing skill or .claude/ entity.
 * Seeds the temp workdir identically to fix (source + latest audit + latest
 * iteration for skills) but the first prompt invites user-driven editing —
 * no audit findings, no fix targets. Sync-back on Apply is identical to fix.
 */
export function startEdit(request: StartAuditRequest, opts: ExternalRunOpts): AuditRun {
  return runner.start({ ...request, mode: 'edit', skillDir: opts.skillDir }, asInternalOpts(opts));
}

// Edit runs share the same registry and lifecycle as fix/create. The runner
// spec branches on `mode === 'edit'` only in the first-prompt builder. All
// other operations (sendUserMessage, finish, stop, diff, timeline, usage)
// are identical and reuse the fix path directly.
export const finishEdit = finishFix;
export const stopEdit = stopFix;
export const sendEditUserMessage = sendFixUserMessage;
export const getEditRun = getFixRun;
export const getEditTempWorkdir = getFixTempWorkdir;
export const getEditRealSkillDir = getFixRealSkillDir;
export const getEditBufferedEvents = getFixBufferedEvents;
/** Alias of {@link registerFixEvalBatch} for edit runs (same registry, same batch watcher). */
export const registerEditEvalBatch = registerFixEvalBatch;
/** Alias of {@link listFixEditsHistory} for edit runs (same session jsonl parsing). */
export const listEditEditsHistory = listFixEditsHistory;
/** Alias of {@link getFixTimeline} for edit runs (same session jsonl parsing). */
export const getEditTimeline = getFixTimeline;
/** Alias of {@link getFixUsage} for edit runs (same session jsonl billing). */
export const getEditUsage = getFixUsage;
/** Alias of {@link listFixDiff} for edit runs (same workdir diff logic). */
export const listEditDiff = listFixDiff;
/** Alias of {@link readFixDiffFile} for edit runs (same workdir diff logic). */
export const readEditDiffFile = readFixDiffFile;

/** Look up a fix or create run by id. Both run kinds share the registry. */
export function getFixRun(runId: string): AuditRun | null {
  return runner.getRun(runId);
}

// ─── Session jsonl replay ──────────────────────────────────────────────────

/**
 * Build the unified fix-conversation timeline directly from Claude Code's
 * session jsonl. This is the SINGLE SOURCE OF TRUTH for the chat view of
 * a fix run — replaces the previous patchwork of `run.turns[*]` (rendered
 * blocks), live `text`/`tool` event stream, custom events.jsonl buffer,
 * and the original `pastEdits` retrofit.
 *
 * The session jsonl is written by Claude Code as it processes each turn.
 * Every line carries an ISO `timestamp`, so by parsing it we get correct
 * positions on the timeline even after a refresh hours later — without
 * any synthetic `Date.now()` stamping.
 *
 * The path is canonical: `~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl`.
 * Returns an empty array when the run has no sessionId yet (fresh run,
 * first turn still streaming) or the file is missing.
 *
 * Filters:
 * - `tool_result` user blocks → skipped (noise; the tool's effect is
 *   already represented by the `tool` / `edit` entry).
 * - `<command-name>` / `<command-message>` user wrappers → skipped (Nakiros
 *   bootstrap noise the agent doesn't actually need to surface twice).
 * - `Write`/`Edit`/`MultiEdit` on Nakiros-internal paths
 *   (outputs/fix-targets.jsonl, etc.) → skipped, see {@link isRuntimeOnlyPath}.
 * - Empty assistant lines (no text + no tool_use) → skipped.
 */
export function getFixTimeline(runId: string): FixTimelineEntry[] {
  const entry = runner.registry().get(runId);
  if (!entry) return [];
  const { sessionId, workdir } = entry.run;
  if (!sessionId) return [];

  const sessionFile = join(
    homedir(),
    '.claude',
    'projects',
    encodeProjectPath(workdir),
    `${sessionId}.jsonl`,
  );
  if (!existsSync(sessionFile)) return [];

  let raw: string;
  try {
    raw = readFileSync(sessionFile, 'utf8');
  } catch {
    return [];
  }

  const out: FixTimelineEntry[] = [];

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const obj = parsed as {
      type?: string;
      timestamp?: string;
      isMeta?: boolean;
      isSidechain?: boolean;
      message?: { role?: string; content?: unknown };
    };

    if (obj.isMeta) continue;
    // Sidechains are agent-internal sub-conversations (e.g. SubagentStop
    // hooks). Hide them from the main chat — they'd just be noise.
    if (obj.isSidechain) continue;
    if (obj.type !== 'user' && obj.type !== 'assistant') continue;
    const ts = typeof obj.timestamp === 'string' ? obj.timestamp : null;
    if (!ts) continue;

    const content = obj.message?.content;

    if (obj.type === 'user') {
      // User content is either a string (initial prompt / replies) or an
      // array of blocks (tool_results, attachments). We only surface the
      // free-form string; tool_results are covered by the corresponding
      // `tool`/`edit` entry on the assistant side.
      if (typeof content === 'string') {
        if (isCommandWrapperText(content)) continue;
        out.push({ kind: 'user', ts, text: content });
      } else if (Array.isArray(content)) {
        const text = pickUserFreeText(content);
        if (text && !isCommandWrapperText(text)) {
          out.push({ kind: 'user', ts, text });
        }
      }
      continue;
    }

    // Assistant: array of blocks (text, thinking, tool_use, …).
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      const b = block as { type?: string; text?: string; name?: string; input?: Record<string, unknown> };
      if (b.type === 'text' && typeof b.text === 'string' && b.text.trim()) {
        out.push({ kind: 'assistant_text', ts, text: b.text });
        continue;
      }
      if (b.type === 'tool_use' && b.name) {
        const input = b.input ?? {};
        if (b.name === 'Write' || b.name === 'Edit' || b.name === 'MultiEdit') {
          // Special-case the findings JSONL: parse it as findings rather
          // than a diff card (toFixEdits would have filtered it as a
          // runtime path). This keeps the session jsonl as the single
          // source of truth — no separate file tail.
          const filePath = typeof input.file_path === 'string' ? input.file_path : '';
          if (filePath && isFindingsPath(filePath, workdir)) {
            const findings = extractFindingsFromInput(b.name, input);
            for (const finding of findings) {
              out.push({ kind: 'finding', ts, finding: { ...finding, ts } });
            }
            continue;
          }
          // toFixEdits returns [] for runtime-only paths so they're
          // naturally filtered. MultiEdit yields one entry per inner edit.
          const edits = toFixEdits(b.name, input, workdir);
          for (const edit of edits) {
            // Override the daemon-stamped `ts` with the session jsonl one
            // so timeline position is the real time the agent issued the
            // tool_use, not when we observed the line.
            out.push({ kind: 'edit', ts, edit: { ...edit, ts } });
          }
          continue;
        }
        // Other tools (Bash, Read, Glob, Grep, …) — generic tool box.
        // We deliberately keep these visible: hiding them would make the
        // chat feel like the agent is talking to thin air.
        const display = formatTool(b.name, input);
        out.push({ kind: 'tool', ts, name: b.name, display });
        continue;
      }
      // Other block kinds (`thinking`, `image`, …) — skip for now.
    }
  }

  // Merge persisted fix-eval-results.jsonl entries — each one becomes an
  // inline `eval_result` card in the timeline, dated at the ts the batch
  // finalised. Renders as the green pass/total card with a [diff >] button.
  for (const result of listFixEvalResults(runId)) {
    out.push({ kind: 'eval_result', ts: result.ts, result });
  }

  // The jsonl is already chronological in practice but a stable sort
  // protects against out-of-order writes during streaming. ISO compares
  // lexicographically when same length / UTC.
  out.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
  return out;
}

/**
 * Compute the billed-equivalent + agent-active stats for a fix run by
 * walking its Claude Code session JSONL. Delegates to the shared helper
 * — see {@link computeSessionUsage} for the full algorithm and pricing
 * rationale. Bypasses the runner's own token tally entirely because
 * `claude-stream.ts` currently drops the cache fields on the floor.
 */
export function getFixUsage(runId: string): FixUsage {
  const entry = runner.registry().get(runId);
  if (!entry) return computeSessionUsage('', null);
  const { sessionId, workdir, startedAt } = entry.run;
  return computeSessionUsage(workdir, sessionId, startedAt);
}

/**
 * True when `filePath` points at the Nakiros findings JSONL inside a fix
 * workdir. We need to special-case it so the timeline parser treats Writes
 * to it as `finding` entries rather than (filtered) `edit` entries.
 */
function isFindingsPath(filePath: string, workdir: string): boolean {
  const rel = relative(workdir, filePath);
  return rel === 'outputs/fix-findings.jsonl';
}

/**
 * Pull findings out of a `Write` / `Edit` / `MultiEdit` `input` object that
 * targets `outputs/fix-findings.jsonl`. The agent typically Writes the file
 * once per turn with all known findings; subsequent updates may use Edit to
 * append a new line or MultiEdit to insert several. We parse:
 *
 *  - `Write.content` → every JSONL line is one finding.
 *  - `Edit.new_string` → the appended slice (we treat all of it as new);
 *    the `old_string` covers content already emitted in a prior tool_use.
 *  - `MultiEdit.edits[*].new_string` → same idea per inner edit.
 *
 * Lines that don't parse to a `{ code, title }` JSON object are silently
 * skipped. The daemon ignores any `ts` the agent embeds — the caller stamps
 * with the session jsonl's tool_use timestamp.
 */
function extractFindingsFromInput(
  toolName: string,
  input: Record<string, unknown>,
): FixFinding[] {
  const out: FixFinding[] = [];
  const sources: string[] = [];
  if (toolName === 'Write' && typeof input.content === 'string') {
    sources.push(input.content);
  } else if (toolName === 'Edit' && typeof input.new_string === 'string') {
    sources.push(input.new_string);
  } else if (toolName === 'MultiEdit' && Array.isArray(input.edits)) {
    for (const e of input.edits) {
      const inner = e as { new_string?: unknown };
      if (typeof inner.new_string === 'string') sources.push(inner.new_string);
    }
  }
  for (const raw of sources) {
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        continue;
      }
      const f = parsed as Partial<FixFinding>;
      if (!f || typeof f.code !== 'string' || typeof f.title !== 'string') continue;
      const finding: FixFinding = { code: f.code, title: f.title };
      if (typeof f.detail === 'string') finding.detail = f.detail;
      if (Array.isArray(f.refs)) {
        finding.refs = f.refs.filter((r): r is string => typeof r === 'string');
      }
      out.push(finding);
    }
  }
  return out;
}

/**
 * Heuristic to drop the `<command-name>nakiros-skill-factory</command-message>`
 * wrappers Claude Code adds around slash-command bootstraps. The agent's
 * actual prompt comes through the next user line as plain text — no need
 * to render the wrapper.
 */
function isCommandWrapperText(text: string): boolean {
  const trimmed = text.trim();
  return (
    trimmed.startsWith('<command-name>') ||
    trimmed.startsWith('<command-message>') ||
    trimmed.startsWith('<local-command-')
  );
}

/**
 * From a user content array (tool_results + occasional text), extract the
 * first free-form text block. Returns `null` if the array is purely
 * tool_results or attachments.
 */
function pickUserFreeText(blocks: unknown[]): string | null {
  for (const b of blocks) {
    const block = b as { type?: string; text?: string };
    if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
      return block.text;
    }
  }
  return null;
}

/**
 * @deprecated kept for backward compat with `fix:getEditsHistory`. Prefer
 * {@link getFixTimeline} which returns the full conversation. Will be
 * removed once the frontend migrates.
 */
export function listFixEditsHistory(runId: string): FixEdit[] {
  const entry = runner.registry().get(runId);
  if (!entry) return [];
  const { sessionId, workdir } = entry.run;
  if (!sessionId) return [];

  const sessionFile = join(
    homedir(),
    '.claude',
    'projects',
    encodeProjectPath(workdir),
    `${sessionId}.jsonl`,
  );
  if (!existsSync(sessionFile)) return [];

  let raw: string;
  try {
    raw = readFileSync(sessionFile, 'utf8');
  } catch {
    return [];
  }

  const out: FixEdit[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const obj = parsed as {
      type?: string;
      timestamp?: string;
      message?: { content?: unknown[] };
    };
    if (obj.type !== 'assistant') continue;
    const ts = typeof obj.timestamp === 'string' ? obj.timestamp : new Date().toISOString();
    const content = obj.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      const b = block as { type?: string; name?: string; input?: Record<string, unknown> };
      if (b.type !== 'tool_use' || !b.name || !b.input) continue;
      // Reuse the same extractor as the live afterToolUse hook so the
      // mapping stays in one place — only difference is we override `ts`
      // with the session jsonl timestamp instead of Date.now().
      const edits = toFixEdits(b.name, b.input, workdir);
      for (const edit of edits) {
        out.push({ ...edit, ts });
      }
    }
  }

  // Sort by ts to be safe — the file is already chronological in practice
  // but a stable order is required for the frontend's sortMs merge.
  out.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
  return out;
}

/**
 * Return the temp workdir path for a fix run. Used by the eval runner to run
 * evals against the temp copy before sync-back.
 */
export function getFixTempWorkdir(runId: string): string | null {
  const entry = runner.registry().get(runId);
  return entry?.run.workdir ?? null;
}

// ─── Fix-temp iteration lifecycle ──────────────────────────────────────────
//
// Fix-evals (launched via `fix:runEvalsInTemp`) write their iteration
// artefacts directly into the real skill workspace, tagged with
// `kind: 'fix-temp'` + `fix_run_id` (see eval-benchmark.ts). The two
// helpers below close the lifecycle:
//  - On Finish (sync-back successful): promote the *latest* fix-temp iter
//    of this run to `'skill'` so it becomes part of the canonical history.
//    Earlier fix-temps of the same run stay tagged so the user can audit
//    the experimentation trail.
//  - On Stop (reject): delete every fix-temp iter of this run — they were
//    explicitly discarded.

/**
 * Iterate every `iteration-N/` of a fix session and call `cb` once per iter
 * (with its parsed `benchmark.json`). The fix-temp iterations live under
 * `<realSkillDir>/evals/.fix-temp/<fixRunId>/`, isolated from the main
 * `evals/workspace/`. Best-effort: corrupt benchmarks are skipped silently.
 */
function forEachFixTempIteration(
  realSkillDir: string,
  fixRunId: string,
  cb: (args: { iteration: number; iterDir: string; benchmarkPath: string; benchmark: Record<string, unknown> }) => void,
): void {
  const sessionDir = join(realSkillDir, 'evals', '.fix-temp', fixRunId);
  if (!existsSync(sessionDir)) return;
  let entries: Dirent[];
  try {
    entries = readdirSync(sessionDir, { withFileTypes: true }) as Dirent[];
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('iteration-')) continue;
    const iteration = parseInt(entry.name.replace('iteration-', ''), 10);
    if (Number.isNaN(iteration)) continue;
    const iterDir = join(sessionDir, entry.name);
    const benchmarkPath = join(iterDir, 'benchmark.json');
    if (!existsSync(benchmarkPath)) continue;
    let benchmark: Record<string, unknown>;
    try {
      benchmark = JSON.parse(readFileSync(benchmarkPath, 'utf8'));
    } catch {
      continue;
    }
    cb({ iteration, iterDir, benchmarkPath, benchmark });
  }
}

/**
 * Delete the entire fix-temp session directory of `fixRunId`. Used on Reject —
 * the user discarded the fix entirely.
 */
function deleteFixTempIterations(realSkillDir: string, fixRunId: string): void {
  const sessionDir = join(realSkillDir, 'evals', '.fix-temp', fixRunId);
  if (!existsSync(sessionDir)) return;
  try {
    rmSync(sessionDir, { recursive: true, force: true });
  } catch (err) {
    console.warn(
      `[fix-runner] Failed to remove fix-temp session at ${sessionDir}: ${(err as Error).message}`,
    );
  }
}

/**
 * Promote the latest fix-temp iteration of `fixRunId` into the canonical
 * `evals/workspace/` history with a fresh sequential number, retagged as
 * `'skill'`. Records `promoted_from_fix_run_id` for audit. The whole
 * `.fix-temp/<fixRunId>/` directory is removed afterwards (any earlier
 * intermediate iterations are discarded by design — only the validated
 * one survives). No-op when no fix-temp iter exists.
 */
function promoteLatestFixTempIteration(realSkillDir: string, fixRunId: string): void {
  const sessionDir = join(realSkillDir, 'evals', '.fix-temp', fixRunId);
  console.log(
    `[promote] start fixRunId=${fixRunId} realSkillDir=${realSkillDir} sessionDir=${sessionDir} sessionDirExists=${existsSync(sessionDir)}`,
  );

  let latest: { iteration: number; iterDir: string; benchmark: Record<string, unknown> } | null = null;
  let scanned = 0;
  forEachFixTempIteration(realSkillDir, fixRunId, ({ iteration, iterDir, benchmark }) => {
    scanned += 1;
    if (!latest || iteration > latest.iteration) {
      latest = { iteration, iterDir, benchmark };
    }
  });
  console.log(`[promote] scanned ${scanned} fix-temp iter(s) for fixRunId=${fixRunId}`);
  if (!latest) {
    console.warn(
      `[promote] no fix-temp iteration found for fixRunId=${fixRunId} — nothing to promote (the fix had no eval, or .fix-temp was wiped before Apply).`,
    );
    return;
  }
  const found = latest as { iteration: number; iterDir: string; benchmark: Record<string, unknown> };

  // Compute the next prod iteration number (independent from the fix-temp
  // session counter — the prod history advances by exactly one).
  const prodWorkspaceDir = join(realSkillDir, 'evals', 'workspace');
  let nextProdIter = 1;
  if (existsSync(prodWorkspaceDir)) {
    try {
      const nums = readdirSync(prodWorkspaceDir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && e.name.startsWith('iteration-'))
        .map((e) => parseInt(e.name.replace('iteration-', ''), 10))
        .filter((n) => !Number.isNaN(n));
      if (nums.length > 0) nextProdIter = Math.max(...nums) + 1;
    } catch {
      // best-effort — fall back to 1
    }
  } else {
    mkdirSync(prodWorkspaceDir, { recursive: true });
  }

  const destIterDir = join(prodWorkspaceDir, `iteration-${nextProdIter}`);
  console.log(
    `[promote] moving fix-temp iter ${found.iteration} → prod iter ${nextProdIter} (${found.iterDir} → ${destIterDir})`,
  );

  // Move the iteration folder. Same filesystem (both under the skill
  // workspace) so rename is atomic and cheap.
  try {
    renameSync(found.iterDir, destIterDir);
  } catch (err) {
    console.warn(
      `[fix-runner] Failed to promote fix-temp iter ${found.iterDir} → ${destIterDir}: ${(err as Error).message}`,
    );
    return;
  }

  // Rewrite the benchmark to reflect its new identity in prod history.
  const benchmark = found.benchmark;
  benchmark.kind = 'skill';
  benchmark.iteration = nextProdIter;
  benchmark.promoted_from_fix_run_id = benchmark.fix_run_id;
  delete benchmark.fix_run_id;
  try {
    writeFileSync(
      join(destIterDir, 'benchmark.json'),
      JSON.stringify(benchmark, null, 2),
      'utf8',
    );
  } catch (err) {
    console.warn(
      `[fix-runner] Failed to rewrite promoted benchmark.json: ${(err as Error).message}`,
    );
  }

  // Wipe the rest of the fix-temp session (intermediate iterations + now
  // empty session dir).
  try {
    rmSync(sessionDir, { recursive: true, force: true });
  } catch {
    // best-effort
  }
  console.log(`[promote] done fixRunId=${fixRunId} → iteration-${nextProdIter}`);
}

// ─── Fix-eval batch watcher ────────────────────────────────────────────────
//
// `fix:runEvalsInTemp` returns synchronously with the eval runIds, then the
// runs execute asynchronously inside the eval-runner. We need to know when
// the *whole batch* is done so the fix timeline can render a single eval
// result card per evalName. The watcher subscribes to the global event bus,
// filters `eval:event` payloads for our runIds, and finalises once every
// runId has reached a terminal status.
//
// Persistence: each finalised batch appends one line per eval to
// `outputs/fix-eval-results.jsonl` so a daemon restart still surfaces the
// past results in the timeline.

const TERMINAL_EVAL_STATUSES: ReadonlySet<EvalRunStatus> = new Set([
  'completed',
  'failed',
  'stopped',
]);
const FIX_EVAL_RESULTS_FILE = 'fix-eval-results.jsonl';

interface FixEvalBatchState {
  fixRunId: string;
  iteration: number;
  evalRunIds: Set<string>;
  statusByRunId: Map<string, EvalRunStatus>;
  unsubscribe: () => void;
}

/**
 * Register a fix-eval batch so the watcher knows which eval runIds belong
 * to this fix run. Subscribes to `eval:event` broadcasts and finalises the
 * batch once every tracked run reaches a terminal status. Idempotent — the
 * subscription auto-cleans on completion.
 *
 * @param args.onComplete Optional callback invoked once all runs in the batch
 *   have reached a terminal state and {@link finaliseFixEvalBatch} has run.
 *   Used by callers (e.g. `fix:runEvalsInTemp`) to release any resource held
 *   for the duration of the batch (e.g. a symlink override).
 */
export function registerFixEvalBatch(args: {
  fixRunId: string;
  iteration: number;
  evalRunIds: string[];
  onComplete?: () => void;
}): void {
  const { fixRunId, iteration, evalRunIds } = args;
  if (evalRunIds.length === 0) return;

  const state: FixEvalBatchState = {
    fixRunId,
    iteration,
    evalRunIds: new Set(evalRunIds),
    statusByRunId: new Map(),
    unsubscribe: () => undefined,
  };

  state.unsubscribe = eventBus.onBroadcast((msg) => {
    if (msg.channel !== IPC_CHANNELS['eval:event']) return;
    const payload = msg.payload as EvalRunEvent | undefined;
    if (!payload || !state.evalRunIds.has(payload.runId)) return;
    // The runner-core emits two flavours of terminal signal:
    //  - `{ type: 'status', status: 'completed' | 'stopped' }` for the
    //    happy path and user-stop cases.
    //  - `{ type: 'done' }` for failures (where the runner skips the
    //    `status: 'failed'` broadcast and goes straight to `done`).
    // Tracking only `status` would miss every failed eval and the batch
    // would never be finalised. Look at both.
    let isTerminal = false;
    if (payload.event.type === 'status') {
      isTerminal = TERMINAL_EVAL_STATUSES.has(payload.event.status);
    } else if (payload.event.type === 'done') {
      isTerminal = true;
    }
    if (!isTerminal) return;
    // Idempotent — `done` may follow `status: 'stopped'` for a stop case.
    if (state.statusByRunId.has(payload.runId)) return;
    state.statusByRunId.set(payload.runId, 'completed' as EvalRunStatus);
    if (state.statusByRunId.size < state.evalRunIds.size) return;
    // All runs terminal → finalise once and detach the listener.
    state.unsubscribe();
    try {
      finaliseFixEvalBatch(state);
    } finally {
      args.onComplete?.();
    }
  });
}

/**
 * Read `iteration-N/benchmark.json` from the fix-temp session, aggregate the
 * with_skill stats across every eval, compare against the latest `kind: skill`
 * iteration in the real skill's prod workspace, and emit ONE `fix_eval_result`
 * event for the batch. Best-effort: missing benchmark (eval-runner crash,
 * partial write) emits nothing.
 *
 * Path layout:
 *  - fix-temp iter:  `<realSkillDir>/evals/.fix-temp/<fixRunId>/iteration-N/`
 *  - prod baseline:  `<realSkillDir>/evals/workspace/iteration-M/` (last `kind: skill`)
 */
function finaliseFixEvalBatch(state: FixEvalBatchState): void {
  console.log(
    `[finaliseFixEvalBatch] fire fixRunId=${state.fixRunId} iteration=${state.iteration} runs=${state.evalRunIds.size}`,
  );
  const entry = runner.registry().get(state.fixRunId);
  if (!entry) {
    console.warn(`[finaliseFixEvalBatch] fix run ${state.fixRunId} not in registry (discarded?)`);
    return;
  }

  const realSkillDir = entry.extras.realSkillDir;
  const fixTempDir = join(realSkillDir, 'evals', '.fix-temp', state.fixRunId);
  const benchmark = readBenchmarkFile(fixTempDir, state.iteration);
  if (!benchmark) {
    console.warn(
      `[finaliseFixEvalBatch] no benchmark.json at ${join(fixTempDir, `iteration-${state.iteration}`, 'benchmark.json')}`,
    );
    return;
  }

  // Mirror the new fix-temp iter into the agent's tmp workdir at
  // `iteration-${seedIter + N}/` so the agent finds it where the boot
  // prompt told it to look (`./evals/workspace/iteration-{N+1}/`). The
  // backend stores it under `.fix-temp/<fixRunId>/iteration-N/` to keep
  // it isolated from prod history; the mirror gives the agent a flat
  // view that matches its mental model.
  try {
    const mirrored = mirrorFixTempIterToWorkdir({
      tmpWorkdir: entry.run.workdir,
      fixTempIterDir: join(fixTempDir, `iteration-${state.iteration}`),
      seedIteration: entry.extras.latestIteration ?? 0,
      sessionIteration: state.iteration,
    });
    if (mirrored) {
      console.log(
        `[finaliseFixEvalBatch] mirrored ${mirrored.from} → ${mirrored.to}`,
      );
    }
  } catch (err) {
    console.warn(
      `[fix-runner] Failed to mirror fix-temp iter to workdir: ${(err as Error).message}`,
    );
  }

  // Aggregate batch-level status from each run's actual on-disk status
  // (the watcher only knows "terminal" — failed runs come through `done`
  // with no `status: 'failed'` broadcast). Propagate worst-of.
  let batchStatus: FixEvalResult['status'] = 'completed';
  for (const runId of state.evalRunIds) {
    const evalRun = getEvalRun(runId);
    if (!evalRun) continue;
    if (evalRun.status === 'failed') {
      batchStatus = 'failed';
      break;
    }
    if (evalRun.status === 'stopped') batchStatus = 'stopped';
  }

  // Aggregate the with_skill stats across every eval in the batch. Skip
  // evals without a with_skill block (cache-only baselines, partial runs).
  const perEval = benchmark.per_eval ?? {};
  const evals: FixEvalResult['evals'] = [];
  let passed = 0;
  let total = 0;
  for (const [evalName, stats] of Object.entries(perEval)) {
    const withSkill = stats.with_skill;
    if (!withSkill) continue;
    const p = withSkill.passed ?? 0;
    const t = withSkill.total ?? 0;
    evals.push({ evalName, passed: p, total: t });
    passed += p;
    total += t;
  }

  // Compare against the last `kind: skill` iteration in the real skill's
  // prod workspace — that's "the skill as it ran in production before this
  // fix session", which is what the user wants to know about.
  const previous = computeFixEvalPrevious(realSkillDir, evals);

  const result: FixEvalResult = {
    iteration: state.iteration,
    ts: new Date().toISOString(),
    runIds: [...state.evalRunIds],
    modelFullId: benchmark.model ?? null,
    status: batchStatus,
    passed,
    total,
    evals,
    previous,
  };

  entry.eventLog.emit({ type: 'fix_eval_result', result } as unknown as FixEvent);

  const outputsDir = join(entry.run.workdir, 'outputs');
  try {
    mkdirSync(outputsDir, { recursive: true });
    appendFileSync(
      join(outputsDir, FIX_EVAL_RESULTS_FILE),
      JSON.stringify(result) + '\n',
      'utf8',
    );
  } catch (err) {
    console.warn(
      `[fix-runner] Failed to persist fix-eval-results.jsonl: ${(err as Error).message}`,
    );
  }
}

/**
 * Mirror a fix-temp iteration directory into the fix's tmp workdir so the
 * agent can read it at `./evals/workspace/iteration-${seedIter + N}/` —
 * the path its boot prompt advertised. Patches the `iteration` field in
 * the copied `benchmark.json` to match the displayed number so the agent
 * doesn't see a mismatch between the path and the embedded number.
 *
 * The seed (`extras.latestIteration`) is the prod iteration number that
 * was copied at fix start; fix-temp iter 1 maps to `seed + 1`, iter 2 to
 * `seed + 2`, etc. When no prod iter was seeded, the displayed number is
 * just `N` (1-based).
 */
function mirrorFixTempIterToWorkdir(args: {
  tmpWorkdir: string;
  fixTempIterDir: string;
  seedIteration: number;
  sessionIteration: number;
}): { from: string; to: string } | null {
  if (!existsSync(args.fixTempIterDir)) {
    console.warn(`[mirrorFixTempIter] source missing: ${args.fixTempIterDir}`);
    return null;
  }
  const displayedIter =
    args.seedIteration > 0
      ? args.seedIteration + args.sessionIteration
      : args.sessionIteration;
  const destDir = join(args.tmpWorkdir, 'evals', 'workspace', `iteration-${displayedIter}`);
  mkdirSync(join(destDir, '..'), { recursive: true });
  // If a previous mirror call already populated this iter (shouldn't
  // happen since session iter numbers are unique within a fix run), wipe
  // it first so we don't accumulate stale eval artefacts.
  if (existsSync(destDir)) {
    rmSync(destDir, { recursive: true, force: true });
  }
  copyDirRecursive(args.fixTempIterDir, destDir);

  // Patch the embedded `iteration` field in the mirrored benchmark.json
  // so the agent sees a consistent path↔value pair (mirrored at
  // `iteration-${displayedIter}/`, with `iteration: displayedIter` inside).
  const mirroredBenchmarkPath = join(destDir, 'benchmark.json');
  if (existsSync(mirroredBenchmarkPath)) {
    try {
      const parsed = JSON.parse(readFileSync(mirroredBenchmarkPath, 'utf8')) as Record<string, unknown>;
      parsed.iteration = displayedIter;
      writeFileSync(mirroredBenchmarkPath, JSON.stringify(parsed, null, 2), 'utf8');
    } catch {
      // best-effort — agent can still read the file even if the iter field is off
    }
  }
  return { from: args.fixTempIterDir, to: destDir };
}

function readBenchmarkFile(workspaceDir: string, iteration: number): BenchmarkFile | null {
  const path = join(workspaceDir, `iteration-${iteration}`, 'benchmark.json');
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as BenchmarkFile;
  } catch {
    return null;
  }
}

/**
 * Build the `previous` block for a fix-eval result by walking the real
 * skill's prod workspace from highest iteration down and stopping at the
 * first `kind: 'skill'` benchmark — that's "the skill as it ran in
 * production right before this fix session started", which is the
 * semantically right baseline. Returns null when no such iteration exists
 * (brand new skill that never had a prod run).
 */
function computeFixEvalPrevious(
  realSkillDir: string,
  evals: FixEvalResult['evals'],
): FixEvalResult['previous'] {
  const prodWorkspaceDir = join(realSkillDir, 'evals', 'workspace');
  if (!existsSync(prodWorkspaceDir)) return null;

  let iterNums: number[];
  try {
    iterNums = readdirSync(prodWorkspaceDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name.startsWith('iteration-'))
      .map((e) => parseInt(e.name.replace('iteration-', ''), 10))
      .filter((n) => !Number.isNaN(n))
      .sort((a, b) => b - a);
  } catch {
    return null;
  }

  for (const iteration of iterNums) {
    const benchmark = readBenchmarkFile(prodWorkspaceDir, iteration);
    if (!benchmark) continue;
    const kind = (benchmark as { kind?: string }).kind;
    // Only `kind: 'skill'` iterations represent the production state.
    // `'baseline'` is a baseline-only refresh (no with_skill data).
    if (kind && kind !== 'skill') continue;
    const prevPerEval = benchmark.per_eval ?? {};
    let prevPassed = 0;
    let prevTotal = 0;
    const regressions: string[] = [];
    for (const evalEntry of evals) {
      const prev = prevPerEval[evalEntry.evalName]?.with_skill;
      if (!prev) continue;
      const prevP = prev.passed ?? 0;
      const prevT = prev.total ?? 0;
      prevPassed += prevP;
      prevTotal += prevT;
      const prevRate = prevT > 0 ? prevP / prevT : 0;
      const currRate = evalEntry.total > 0 ? evalEntry.passed / evalEntry.total : 0;
      if (currRate < prevRate) regressions.push(evalEntry.evalName);
    }
    return {
      iteration,
      passed: prevPassed,
      total: prevTotal,
      regressions,
    };
  }
  return null;
}

/**
 * Read the persisted `outputs/fix-eval-results.jsonl` for a fix run. Used by
 * `getFixTimeline` to merge eval result cards into the timeline at remount,
 * surviving daemon restarts.
 */
export function listFixEvalResults(runId: string): FixEvalResult[] {
  const entry = runner.registry().get(runId);
  if (!entry) return [];
  const filePath = join(entry.run.workdir, 'outputs', FIX_EVAL_RESULTS_FILE);
  if (!existsSync(filePath)) return [];
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch {
    return [];
  }
  const out: FixEvalResult[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.parse(trimmed) as FixEvalResult);
    } catch {
      // skip corrupt lines
    }
  }
  return out;
}

/**
 * Subset of `benchmark.json` we read after a fix-eval batch. Mirrors the
 * on-disk shape produced by {@link writeIterationBenchmark} — `per_eval`
 * stores {@link EvalConfigStats} per config, with the `passed/total`
 * fields (NOT `passed_assertions/total_assertions`, which only live at
 * the `run_summary` aggregate level).
 */
interface BenchmarkFile {
  model?: string | null;
  per_eval?: Record<
    string,
    {
      with_skill?: {
        passed?: number;
        total?: number;
      };
    }
  >;
}

/** Return the real skill directory associated with a fix run. */
export function getFixRealSkillDir(runId: string): string | null {
  const entry = runner.registry().get(runId);
  return entry?.extras.realSkillDir ?? null;
}

/**
 * Return the buffered stream events for the current (in-flight) turn. Works
 * for both fix and create runs (same runId space).
 */
export function getFixBufferedEvents(runId: string): FixEvent[] {
  return runner.getBufferedEvents(runId);
}

function listByMode(mode: SkillAgentMode, opts: { activeOnly: boolean }): AuditRun[] {
  const out: AuditRun[] = [];
  for (const entry of runner.registry().values()) {
    if (entry.extras.mode !== mode) continue;
    if (opts.activeOnly && !isActiveRunStatus(entry.run.status)) continue;
    out.push(entry.run);
  }
  return out;
}

/** List every non-terminal fix run (starting / running / waiting_for_input). */
export function listActiveFixRuns(): AuditRun[] {
  return listByMode('fix', { activeOnly: true });
}

/** List every non-terminal create run (starting / running / waiting_for_input). */
export function listActiveCreateRuns(): AuditRun[] {
  return listByMode('create', { activeOnly: true });
}

/** List every fix run currently in memory — active **and** terminal — for the runs center. */
export function listAllFixRuns(): AuditRun[] {
  return listByMode('fix', { activeOnly: false });
}

/** List every create run currently in memory — active **and** terminal — for the runs center. */
export function listAllCreateRuns(): AuditRun[] {
  return listByMode('create', { activeOnly: false });
}

/** List every non-terminal edit run (starting / running / waiting_for_input). */
export function listActiveEditRuns(): AuditRun[] {
  return listByMode('edit', { activeOnly: true });
}

/** List every edit run currently in memory — active **and** terminal — for the runs center. */
export function listAllEditRuns(): AuditRun[] {
  return listByMode('edit', { activeOnly: false });
}

// ─── Review diff API ─────────────────────────────────────────────────────────

/**
 * Walk a skill directory and return every file path (relative to the root)
 * that is NOT runtime-only. Used on both real skill and temp workdir so the
 * comparison sees the same things the sync step would actually copy.
 */
function listSyncableFiles(root: string): string[] {
  const results: string[] = [];
  function walk(dir: string): void {
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true }) as Dirent[];
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const rel = relative(root, fullPath);
      if (isRuntimeOnlyPath(rel)) continue;
      if (entry.isDirectory()) walk(fullPath);
      else if (entry.isFile()) results.push(rel);
    }
  }
  walk(root);
  results.sort();
  return results;
}

function isLikelyBinary(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(4096, buffer.length));
  for (const byte of sample) {
    if (byte === 0) return true;
  }
  return false;
}

function readPair(relativePath: string, originalDir: string | null, modifiedDir: string): SkillDiffFilePayload {
  let originalContent: string | null = null;
  let modifiedContent: string | null = null;
  let isBinary = false;

  if (originalDir) {
    const origPath = join(originalDir, relativePath);
    if (existsSync(origPath)) {
      const buf = readFileSync(origPath);
      if (isLikelyBinary(buf)) isBinary = true;
      else originalContent = buf.toString('utf8');
    }
  }

  const modPath = join(modifiedDir, relativePath);
  if (existsSync(modPath)) {
    const buf = readFileSync(modPath);
    if (isLikelyBinary(buf)) isBinary = true;
    else modifiedContent = buf.toString('utf8');
  }

  return {
    relativePath,
    originalContent: isBinary ? null : originalContent,
    modifiedContent: isBinary ? null : modifiedContent,
    isBinary,
  };
}

/**
 * List every file that exists either in the original skill or in the temp
 * workdir. The UI uses this to render the before/after file picker in the
 * diff preview panel. Entries carry `inOriginal` / `inModified` flags so
 * created / deleted / modified states render distinctly.
 */
export function listFixDiff(runId: string, opts?: { includeUnchanged?: boolean }): SkillDiffEntry[] {
  const entry = runner.registry().get(runId);
  if (!entry) return [];
  const includeUnchanged = opts?.includeUnchanged === true;

  // Non-skill targets (claudemd / rules / subagents / hooks / permissions /
  // mcp / output-styles) compare against a frozen snapshot under
  // `<workdir>/.snapshot/`, not the bundled-expert directory.
  const nonSkillSpec = getNonSkillTargetDiffSpec(entry.run);
  if (nonSkillSpec) {
    return listNonSkillTargetDiff(nonSkillSpec, includeUnchanged);
  }

  const realDir = entry.extras.realSkillDir;
  const tempDir = entry.run.workdir;
  const isCreate = entry.extras.mode === 'create';

  const originalExists = !isCreate && existsSync(realDir);
  const originalPaths = originalExists ? new Set(listSyncableFiles(realDir)) : new Set<string>();
  const modifiedPaths = new Set(listSyncableFiles(tempDir));

  const all = new Set<string>([...originalPaths, ...modifiedPaths]);
  const diffs: SkillDiffEntry[] = [];
  for (const rel of [...all].sort()) {
    const inOriginal = originalPaths.has(rel);
    const inModified = modifiedPaths.has(rel);
    let addedLines = 0;
    let removedLines = 0;

    if (inOriginal && inModified) {
      try {
        const a = readFileSync(join(realDir, rel));
        const b = readFileSync(join(tempDir, rel));
        if (a.equals(b)) {
          if (!includeUnchanged) continue;
          // includeUnchanged: surface the entry with zero deltas so the IDE
          // file list can show the file as a navigable, unmodified entry.
        } else if (isLikelyBinary(a) || isLikelyBinary(b)) {
          // Binary — surface as modified but no line counts.
        } else {
          const stats = countLineDiff(a.toString('utf8'), b.toString('utf8'));
          addedLines = stats.added;
          removedLines = stats.removed;
        }
      } catch {
        // surface as a diff entry if we can't read — UI will show the error
      }
    } else if (!inOriginal && inModified) {
      try {
        const buf = readFileSync(join(tempDir, rel));
        if (!isLikelyBinary(buf)) addedLines = countLines(buf.toString('utf8'));
      } catch {
        // ignore
      }
    } else if (inOriginal && !inModified) {
      try {
        const buf = readFileSync(join(realDir, rel));
        if (!isLikelyBinary(buf)) removedLines = countLines(buf.toString('utf8'));
      } catch {
        // ignore
      }
    }

    diffs.push({ relativePath: rel, inOriginal, inModified, addedLines, removedLines });
  }
  return diffs;
}

/**
 * Build the single-entry diff list for a non-skill target. Compares the
 * frozen snapshot taken at run start against the live "after" file (the
 * project file for direct-write targets, the workdir draft for the rest).
 * Returns an empty array when both sides are absent or identical so the
 * UI doesn't render a stale row.
 */
function listNonSkillTargetDiff(
  spec: NonSkillTargetDiffSpec,
  includeUnchanged = false,
): SkillDiffEntry[] {
  const inOriginal = spec.snapshotPath !== null && existsSync(spec.snapshotPath);
  const inModified = existsSync(spec.modifiedPath);
  if (!inOriginal && !inModified) return [];

  let addedLines = 0;
  let removedLines = 0;

  if (inOriginal && inModified) {
    try {
      const a = readFileSync(spec.snapshotPath!);
      const b = readFileSync(spec.modifiedPath);
      if (a.equals(b)) {
        // Identical: hide from the existing workspace panel (which only
        // surfaces changed files), but surface for the IDE file list which
        // wants to show the entity even before any edit happens.
        if (!includeUnchanged) return [];
      } else if (!isLikelyBinary(a) && !isLikelyBinary(b)) {
        const stats = countLineDiff(a.toString('utf8'), b.toString('utf8'));
        addedLines = stats.added;
        removedLines = stats.removed;
      }
    } catch {
      // surface the entry anyway so the user sees something
    }
  } else if (inModified) {
    try {
      const buf = readFileSync(spec.modifiedPath);
      if (!isLikelyBinary(buf)) addedLines = countLines(buf.toString('utf8'));
    } catch {
      // ignore
    }
  } else if (inOriginal) {
    try {
      const buf = readFileSync(spec.snapshotPath!);
      if (!isLikelyBinary(buf)) removedLines = countLines(buf.toString('utf8'));
    } catch {
      // ignore
    }
  }

  return [
    {
      relativePath: spec.displayPath,
      inOriginal,
      inModified,
      addedLines,
      removedLines,
    },
  ];
}

/**
 * Count added/removed lines between two text blobs via a basic LCS DP.
 * O(m*n) — fine for skill files (typically a few hundred lines max). For
 * very large files we cap the work and fall back to a coarse line-count
 * delta so the UI still gets a meaningful chip.
 */
function countLineDiff(before: string, after: string): { added: number; removed: number } {
  const a = before.split('\n');
  const b = after.split('\n');
  const m = a.length;
  const n = b.length;
  // Cap LCS work — beyond ~2M cell ops we degrade to a length-only delta.
  if (m * n > 2_000_000) {
    const delta = n - m;
    return { added: Math.max(0, delta), removed: Math.max(0, -delta) };
  }
  const prev = new Int32Array(n + 1);
  const curr = new Int32Array(n + 1);
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) curr[j] = prev[j - 1]! + 1;
      else curr[j] = Math.max(prev[j]!, curr[j - 1]!);
    }
    prev.set(curr);
  }
  const lcs = prev[n]!;
  return { removed: m - lcs, added: n - lcs };
}

function countLines(text: string): number {
  if (text.length === 0) return 0;
  return text.split('\n').length;
}

/**
 * Read one file from BOTH the original skill and the temp workdir, returning
 * their contents side-by-side for the diff viewer. Binary files are flagged
 * so the UI can fall back to an opaque message instead of garbling the view.
 */
export function readFixDiffFile(runId: string, relativePath: string): SkillDiffFilePayload {
  const entry = runner.registry().get(runId);
  if (!entry) throw new Error(`Unknown run: ${runId}`);
  if (relativePath.includes('..')) throw new Error(`Refused suspicious path: ${relativePath}`);

  // Non-skill targets read the snapshot + the live "after" file directly.
  // The relative path is the synthetic display label produced by listFixDiff.
  const nonSkillSpec = getNonSkillTargetDiffSpec(entry.run);
  if (nonSkillSpec) {
    if (relativePath !== nonSkillSpec.displayPath) {
      throw new Error(`Unknown diff entry: ${relativePath}`);
    }
    return readNonSkillTargetDiffFile(nonSkillSpec);
  }

  if (isRuntimeOnlyPath(relativePath)) {
    throw new Error(`Refused runtime-only path: ${relativePath}`);
  }
  const realDir = entry.extras.realSkillDir;
  const originalDir = entry.extras.mode === 'create' ? null : existsSync(realDir) ? realDir : null;
  return readPair(relativePath, originalDir, entry.run.workdir);
}

function readNonSkillTargetDiffFile(spec: NonSkillTargetDiffSpec): SkillDiffFilePayload {
  let originalContent: string | null = null;
  let modifiedContent: string | null = null;
  let isBinary = false;

  if (spec.snapshotPath && existsSync(spec.snapshotPath)) {
    const buf = readFileSync(spec.snapshotPath);
    if (isLikelyBinary(buf)) isBinary = true;
    else originalContent = buf.toString('utf8');
  }
  if (existsSync(spec.modifiedPath)) {
    const buf = readFileSync(spec.modifiedPath);
    if (isLikelyBinary(buf)) isBinary = true;
    else modifiedContent = buf.toString('utf8');
  }

  return {
    relativePath: spec.displayPath,
    originalContent: isBinary ? null : originalContent,
    modifiedContent: isBinary ? null : modifiedContent,
    isBinary,
  };
}
