import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, symlinkSync, writeFileSync } from 'fs';
import { join, basename, relative } from 'path';
import { homedir } from 'os';

import type {
  AuditCheckOutcome,
  AuditHistoryEntry,
  AuditManifest,
  AuditRun,
  AuditRunEvent,
  AuditTimelineEntry,
  FixUsage,
  StartAuditRequest,
} from '@nakiros/shared';

import {
  buildChatTimeline,
  cleanupRunWorkdir,
  computeSessionUsage,
  createRunner,
  createRunWorktree,
  destroyEvalSandbox,
  encodeProjectPath,
  findGitRoot,
  isActiveRunStatus,
  persistRunJson,
  type RehydrateResult,
  type RunEntry,
  type RunnerSpec,
  writeExecutionSettings,
} from './runner-core/index.js';
import { buildDotClaudeSnapshot } from './dot-claude-snapshot-builder.js';
import { rulesAuditArchiveDir } from './rules-audit-history.js';
import { subagentsAuditArchiveDir } from './subagents-audit-history.js';
import { hooksAuditArchiveDir } from './hooks-audit-history.js';
import { permissionsAuditArchiveDir } from './permissions-audit-history.js';
import { mcpAuditArchiveDir } from './mcp-audit-history.js';
import { outputStylesAuditArchiveDir } from './output-styles-audit-history.js';

const FACTORY_SKILL_NAME = 'nakiros-skill-factory';
const CLAUDEMD_EXPERT_SKILL_NAME = 'nakiros-claudemd-expert';
const RULES_EXPERT_SKILL_NAME = 'nakiros-rules-expert';
const SUBAGENTS_EXPERT_SKILL_NAME = 'nakiros-subagents-expert';
const HOOKS_EXPERT_SKILL_NAME = 'nakiros-hooks-expert';
const PERMISSIONS_EXPERT_SKILL_NAME = 'nakiros-permissions-expert';
const MCP_EXPERT_SKILL_NAME = 'nakiros-mcp-expert';
const OUTPUT_STYLES_EXPERT_SKILL_NAME = 'nakiros-output-styles-expert';
const KIND = 'audit';


interface AuditEntryExtras {
  /** Absolute path to the real skill directory — used to archive the audit report. */
  skillDir: string;
  /**
   * Polling timer that re-reads `outputs/audit-manifest.json` +
   * `outputs/audit-progress.jsonl` while the run is in flight. Started in
   * `afterStart`, self-arrests on terminal status, also cleared by
   * `cleanupOnTerminal`. NOT persisted to `run.json` (rebuilt at boot).
   */
  syncTimer: NodeJS.Timeout | null;
  /**
   * Absolute path to the git worktree used as Claude subprocess cwd.
   * `null` when the project is not in a git repo (fallback: workdir-only).
   * NOT persisted to `run.json` — rebuilt as `null` at boot (the boot-time
   * sweepOrphanSandboxes call handles any leftover worktrees).
   */
  worktreePath: string | null;
  /**
   * Git root of the project that owns the worktree. Passed to
   * `destroyEvalSandbox` so `git -C <gitRoot> worktree remove` keeps the
   * `.git/worktrees/` index clean. NOT persisted.
   */
  worktreeGitRoot: string | null;
}

const PROGRESS_POLL_MS = 1000;

/**
 * Re-read the two artefacts the skill writes during an audit and emit the
 * diff:
 *
 *   - `outputs/audit-manifest.json` — once, on first sight.
 *   - `outputs/audit-progress.jsonl` — append-only; emit each new line.
 *
 * Tolerates a partially-written file (truncated last line, malformed JSON):
 * skip the bad line, retry next tick. The full markdown report is still the
 * source of truth at the end — these events drive the live sidebar only.
 */
function syncAuditProgress(entry: RunEntry<AuditRun, AuditEvent, AuditEntryExtras>): void {
  const { run } = entry;
  // The fields are typed optional because `AuditRun` is also the shape for
  // fix-runner, which doesn't audit anything. Audit runs always initialise
  // them in `createInitialRun` / `rehydrate` — but narrow here to be safe.
  if (!run.checkResults) run.checkResults = [];
  // Progress artefacts are written relative to the agent's cwd. When a git
  // worktree is in use, that cwd is run.cwd (the worktree path), not workdir.
  const outputsDir = join(run.cwd ?? run.workdir, 'outputs');

  let mutated = false;

  if (!run.manifest) {
    const manifestPath = join(outputsDir, 'audit-manifest.json');
    if (existsSync(manifestPath)) {
      try {
        const raw = readFileSync(manifestPath, 'utf8');
        const manifest = JSON.parse(raw) as AuditManifest;
        if (manifest && Array.isArray(manifest.checks) && Array.isArray(manifest.sections)) {
          run.manifest = manifest;
          mutated = true;
          entry.eventLog.emit({ type: 'manifest', manifest });
        }
      } catch (err) {
        console.warn(`[audit-runner] Could not parse audit-manifest.json (run ${run.runId}): ${(err as Error).message}`);
      }
    }
  }

  const progressPath = join(outputsDir, 'audit-progress.jsonl');
  if (existsSync(progressPath)) {
    let raw: string;
    try {
      raw = readFileSync(progressPath, 'utf8');
    } catch {
      raw = '';
    }
    const known = new Set(run.checkResults.map((o) => o.checkId));
    const lines = raw.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        continue; // partial write, retry on next poll
      }
      const o = parsed as Partial<AuditCheckOutcome>;
      if (!o || typeof o.checkId !== 'string' || known.has(o.checkId)) continue;
      if (o.result !== 'pass' && o.result !== 'fail' && o.result !== 'na') continue;
      const outcome: AuditCheckOutcome = {
        checkId: o.checkId,
        result: o.result,
        detail: typeof o.detail === 'string' ? o.detail : '',
      };
      run.checkResults.push(outcome);
      known.add(outcome.checkId);
      mutated = true;
      entry.eventLog.emit({ type: 'check_result', outcome });
    }
  }

  // Persist whenever we mutated the run — without this, a daemon restart
  // would lose every check captured live and the rehydrated `run.json` would
  // show `manifest: null, checkResults: []` even on a completed audit. The
  // generic runner-core `persist()` is private; we duplicate the call shape
  // (`{ ...run, _extras }`) it uses so the rehydrate path keeps working.
  if (mutated) {
    persistRunJson(run.workdir, { ...run, _extras: entry.extras });
  }
}

function stopProgressPolling(extras: AuditEntryExtras): void {
  if (extras.syncTimer) {
    clearInterval(extras.syncTimer);
    extras.syncTimer = null;
  }
}

/** Internal start request — `StartAuditRequest` + the resolved skill directory. */
interface AuditStartReq extends StartAuditRequest {
  skillDir: string;
}

type AuditEvent = AuditRunEvent['event'];

function isoSafeTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function auditRunsRoot(): string {
  return join(homedir(), '.nakiros', 'runs', 'audit');
}

/**
 * Prepare a fresh audit workdir under `~/.nakiros/runs/audit/<runId>/`.
 * Symlinks the target skill into `{workdir}/.claude/skills/<skillName>` so
 * `/nakiros-skill-factory` finds it via cwd.
 */
function prepareWorkdir(skillDir: string, skillName: string, runId: string): string {
  if (!existsSync(skillDir)) {
    throw new Error(
      `Skill directory not found: ${skillDir}. If this is a Nakiros bundled skill, restart the daemon to re-sync ~/.nakiros/skills.`,
    );
  }

  const workdir = join(auditRunsRoot(), runId);
  mkdirSync(workdir, { recursive: true });
  mkdirSync(join(workdir, 'outputs'), { recursive: true });

  writeExecutionSettings(workdir);

  const claudeDir = join(workdir, '.claude');
  const skillsDir = join(claudeDir, 'skills');
  mkdirSync(skillsDir, { recursive: true });
  const linkPath = join(skillsDir, skillName);
  if (!existsSync(linkPath)) {
    symlinkSync(realpathSync(skillDir), linkPath, 'dir');
  }

  return workdir;
}

/**
 * True when the Claude session file backing this run still lives at the
 * canonical `~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl` path. If
 * the previous daemon (or a sweeping helper) wiped it, `--resume` would fail
 * with "No conversation found with session ID …" — better to surface the run
 * as `stopped` than offer a broken Reprendre button.
 */
function auditRunHasResumableSessionFile(blob: { sessionId?: string | null; workdir?: string; cwd?: string | null }, workdir: string): boolean {
  if (!blob.sessionId) {
    console.log(`[audit-runner] Resume check: sessionId is null/missing — not resumable`);
    return false;
  }
  if (!existsSync(workdir)) {
    console.log(`[audit-runner] Resume check: workdir ${workdir} doesn't exist — not resumable`);
    return false;
  }
  // Claude Code indexes its session files by the subprocess cwd. When a
  // worktree was used, that cwd was run.cwd (the worktree path), not workdir.
  const sessionBase = blob.cwd ?? workdir;
  const sessionFile = join(homedir(), '.claude', 'projects', encodeProjectPath(sessionBase), `${blob.sessionId}.jsonl`);
  const exists = existsSync(sessionFile);
  console.log(`[audit-runner] Resume check: sessionFile=${sessionFile} → ${exists ? 'OK' : 'MISSING'}`);
  return exists;
}

/**
 * After a successful turn that produced `audit-report.md`, archive the report
 * into `{skillDir}/audits/audit-{ISO}.md` and complete the run.
 */
function archiveReport(entry: RunEntry<AuditRun, AuditEvent, AuditEntryExtras>): { ok: true; reportPath: string } | { ok: false; error: string } {
  // The agent writes outputs/ relative to its cwd. When a worktree is in use
  // (run.cwd is set), the report lives there — not under workdir.
  const reportSrc = join(entry.run.cwd ?? entry.run.workdir, 'outputs', 'audit-report.md');
  if (!existsSync(reportSrc)) {
    return { ok: false, error: 'No audit-report.md was produced' };
  }
  // CLAUDE.md audits archive under `~/.nakiros/<projectId>/claudemd/audit/`.
  // The bundled expert is immutable so we never write into the skill dir.
  if (entry.run.claudemdTarget) {
    const ct = entry.run.claudemdTarget;
    const archiveDir = join(homedir(), '.nakiros', ct.projectId, 'claudemd', 'audit');
    mkdirSync(archiveDir, { recursive: true });
    const dest = join(archiveDir, `audit-${isoSafeTimestamp()}.md`);
    try {
      copyFileSync(reportSrc, dest);
      return { ok: true, reportPath: dest };
    } catch (err) {
      return { ok: false, error: `Failed to archive CLAUDE.md audit: ${(err as Error).message}` };
    }
  }

  // Rules audits archive under `~/.nakiros/<projectId>/rules-audits/<ruleName>/`.
  // Sub-folders per rule keep the history organised when a project has many rules.
  if (entry.run.rulesTarget) {
    const rt = entry.run.rulesTarget;
    const archiveDir = rulesAuditArchiveDir(rt.projectId, rt.ruleName);
    mkdirSync(archiveDir, { recursive: true });
    const dest = join(archiveDir, `audit-${isoSafeTimestamp()}.md`);
    try {
      copyFileSync(reportSrc, dest);
      return { ok: true, reportPath: dest };
    } catch (err) {
      return { ok: false, error: `Failed to archive rules audit: ${(err as Error).message}` };
    }
  }

  // Subagents audits archive under
  // `~/.nakiros/<projectId>/subagents-audits/<subagentName>/`.
  // Sub-folders per subagent keep the history organised.
  if (entry.run.subagentsTarget) {
    const st = entry.run.subagentsTarget;
    const archiveDir = subagentsAuditArchiveDir(st.projectId, st.subagentName);
    mkdirSync(archiveDir, { recursive: true });
    const dest = join(archiveDir, `audit-${isoSafeTimestamp()}.md`);
    try {
      copyFileSync(reportSrc, dest);
      return { ok: true, reportPath: dest };
    } catch (err) {
      return { ok: false, error: `Failed to archive subagents audit: ${(err as Error).message}` };
    }
  }

  // Hooks audits archive under `~/.nakiros/<projectId>/hooks-audits/`.
  // Singleton — no sub-folder per target name.
  if (entry.run.hooksTarget) {
    const ht = entry.run.hooksTarget;
    const archiveDir = hooksAuditArchiveDir(ht.projectId);
    mkdirSync(archiveDir, { recursive: true });
    const dest = join(archiveDir, `audit-${isoSafeTimestamp()}.md`);
    try {
      copyFileSync(reportSrc, dest);
      return { ok: true, reportPath: dest };
    } catch (err) {
      return { ok: false, error: `Failed to archive hooks audit: ${(err as Error).message}` };
    }
  }

  // Permissions audits archive under
  // `~/.nakiros/<projectId>/permissions-audits/<scope>/`.
  // Sub-folder per scope so project and local histories stay independent.
  if (entry.run.permissionsTarget) {
    const pt = entry.run.permissionsTarget;
    const archiveDir = permissionsAuditArchiveDir(pt.projectId, pt.scope ?? 'project');
    mkdirSync(archiveDir, { recursive: true });
    const dest = join(archiveDir, `audit-${isoSafeTimestamp()}.md`);
    try {
      copyFileSync(reportSrc, dest);
      return { ok: true, reportPath: dest };
    } catch (err) {
      return { ok: false, error: `Failed to archive permissions audit: ${(err as Error).message}` };
    }
  }

  // MCP audits archive under `~/.nakiros/<projectId>/mcp-audits/`.
  // Singleton — no sub-folder per target name.
  if (entry.run.mcpTarget) {
    const mt = entry.run.mcpTarget;
    const archiveDir = mcpAuditArchiveDir(mt.projectId);
    mkdirSync(archiveDir, { recursive: true });
    const dest = join(archiveDir, `audit-${isoSafeTimestamp()}.md`);
    try {
      copyFileSync(reportSrc, dest);
      return { ok: true, reportPath: dest };
    } catch (err) {
      return { ok: false, error: `Failed to archive MCP audit: ${(err as Error).message}` };
    }
  }

  // Output-styles audits archive under
  // `~/.nakiros/<projectId>/output-styles-audits/<styleName>/`.
  // Sub-folders per style keep the history organised when a project has many styles.
  if (entry.run.outputStylesTarget) {
    const ost = entry.run.outputStylesTarget;
    const archiveDir = outputStylesAuditArchiveDir(ost.projectId, ost.styleName);
    mkdirSync(archiveDir, { recursive: true });
    const dest = join(archiveDir, `audit-${isoSafeTimestamp()}.md`);
    try {
      copyFileSync(reportSrc, dest);
      return { ok: true, reportPath: dest };
    } catch (err) {
      return { ok: false, error: `Failed to archive output-styles audit: ${(err as Error).message}` };
    }
  }

  const auditsDir = join(entry.extras.skillDir, 'audits');
  mkdirSync(auditsDir, { recursive: true });
  const dest = join(auditsDir, `audit-${isoSafeTimestamp()}.md`);
  try {
    copyFileSync(reportSrc, dest);
    return { ok: true, reportPath: dest };
  } catch (err) {
    return { ok: false, error: `Failed to archive report: ${(err as Error).message}` };
  }
}

const spec: RunnerSpec<AuditRun, AuditStartReq, AuditEvent, AuditEntryExtras> = {
  kind: KIND,
  runsRoot: auditRunsRoot,

  prepareWorkdir(req, runId) {
    const workdir = prepareWorkdir(req.skillDir, req.skillName, runId);

    // Resolve the user's project root so we can anchor the git worktree there.
    // For *Target runs the projectPath is explicit; for skill runs we use the
    // skill directory itself (which lives inside the project's .claude/skills/).
    let resolvedProjectPath: string | null = null;
    if (req.claudemdTarget) resolvedProjectPath = req.claudemdTarget.projectPath;
    else if (req.rulesTarget) resolvedProjectPath = req.rulesTarget.projectPath;
    else if (req.subagentsTarget) resolvedProjectPath = req.subagentsTarget.projectPath;
    else if (req.hooksTarget) resolvedProjectPath = req.hooksTarget.projectPath;
    else if (req.permissionsTarget) resolvedProjectPath = req.permissionsTarget.projectPath;
    else if (req.mcpTarget) resolvedProjectPath = req.mcpTarget.projectPath;
    else if (req.outputStylesTarget) resolvedProjectPath = req.outputStylesTarget.projectPath;
    else resolvedProjectPath = req.skillDir;

    let worktreePath: string | null = null;
    const gitRoot = resolvedProjectPath ? findGitRoot(resolvedProjectPath) : null;
    if (gitRoot) {
      try {
        const result = createRunWorktree(gitRoot, runId, 'audit');
        worktreePath = result.path;
        writeExecutionSettings(worktreePath);

        // Symlink the expert skill into the worktree so the agent subprocess
        // can invoke it via /<skillName> when running from the worktree cwd.
        const wtClaudeDir = join(worktreePath, '.claude');
        const wtSkillsDir = join(wtClaudeDir, 'skills');
        mkdirSync(wtSkillsDir, { recursive: true });
        const wtLinkPath = join(wtSkillsDir, req.skillName);
        if (!existsSync(wtLinkPath)) {
          symlinkSync(realpathSync(req.skillDir), wtLinkPath, 'dir');
        }
      } catch (err) {
        console.warn(`[audit-runner] Could not create worktree for run ${runId}: ${(err as Error).message}. Falling back to workdir-only.`);
        worktreePath = null;
      }
    }

    // The expert SKILL.mds read `dot-claude-snapshot.json` at the shell cwd
    // root. When a worktree is in use it IS the cwd — writing to workdir
    // would leave the snapshot invisible to the agent (same convention as
    // bootstrap-runner and the outputs/ handling above).
    const snapshotRoot = worktreePath ?? workdir;

    // For CLAUDE.md audits, write a cross-entity snapshot so the expert agent
    // can detect coherence issues across the full .claude/ configuration.
    if (req.claudemdTarget) {
      try {
        const snapshot = buildDotClaudeSnapshot({
          projectId: req.claudemdTarget.projectId,
          projectPath: req.claudemdTarget.projectPath,
        });
        writeFileSync(
          join(snapshotRoot, 'dot-claude-snapshot.json'),
          JSON.stringify(snapshot, null, 2),
          'utf8',
        );
      } catch (err) {
        console.warn(`[audit-runner] Could not write dot-claude-snapshot.json: ${(err as Error).message}`);
      }
    }

    // For rules audits, write the same cross-entity snapshot so the expert
    // agent can reason about rule coherence in the context of the full
    // .claude/ configuration (other rules, CLAUDE.md, hooks, etc.).
    if (req.rulesTarget) {
      try {
        const snapshot = buildDotClaudeSnapshot({
          projectId: req.rulesTarget.projectId,
          projectPath: req.rulesTarget.projectPath,
        });
        writeFileSync(
          join(snapshotRoot, 'dot-claude-snapshot.json'),
          JSON.stringify(snapshot, null, 2),
          'utf8',
        );
      } catch (err) {
        console.warn(`[audit-runner] Could not write dot-claude-snapshot.json for rules: ${(err as Error).message}`);
      }
    }

    // For subagents audits, write the cross-entity snapshot so the expert
    // agent can reason about the subagent in the context of the full
    // .claude/ configuration (CLAUDE.md, tools, other subagents, etc.).
    if (req.subagentsTarget) {
      try {
        const snapshot = buildDotClaudeSnapshot({
          projectId: req.subagentsTarget.projectId,
          projectPath: req.subagentsTarget.projectPath,
        });
        writeFileSync(
          join(snapshotRoot, 'dot-claude-snapshot.json'),
          JSON.stringify(snapshot, null, 2),
          'utf8',
        );
      } catch (err) {
        console.warn(`[audit-runner] Could not write dot-claude-snapshot.json for subagents: ${(err as Error).message}`);
      }
    }

    // For hooks audits, write the cross-entity snapshot so the expert agent
    // can reason about the hooks block in the context of the full .claude/
    // configuration (CLAUDE.md, other settings, subagents, etc.).
    if (req.hooksTarget) {
      try {
        const snapshot = buildDotClaudeSnapshot({
          projectId: req.hooksTarget.projectId,
          projectPath: req.hooksTarget.projectPath,
        });
        writeFileSync(
          join(snapshotRoot, 'dot-claude-snapshot.json'),
          JSON.stringify(snapshot, null, 2),
          'utf8',
        );
      } catch (err) {
        console.warn(`[audit-runner] Could not write dot-claude-snapshot.json for hooks: ${(err as Error).message}`);
      }
    }

    // For permissions audits, write the cross-entity snapshot so the expert
    // agent can reason about the permissions block in the context of the full
    // .claude/ configuration (CLAUDE.md, hooks, other settings, etc.).
    if (req.permissionsTarget) {
      try {
        const snapshot = buildDotClaudeSnapshot({
          projectId: req.permissionsTarget.projectId,
          projectPath: req.permissionsTarget.projectPath,
        });
        writeFileSync(
          join(snapshotRoot, 'dot-claude-snapshot.json'),
          JSON.stringify(snapshot, null, 2),
          'utf8',
        );
      } catch (err) {
        console.warn(`[audit-runner] Could not write dot-claude-snapshot.json for permissions: ${(err as Error).message}`);
      }
    }

    // For MCP audits, write the cross-entity snapshot so the expert agent
    // can reason about .mcp.json in the context of the full .claude/
    // configuration (CLAUDE.md, hooks, other settings, etc.).
    if (req.mcpTarget) {
      try {
        const snapshot = buildDotClaudeSnapshot({
          projectId: req.mcpTarget.projectId,
          projectPath: req.mcpTarget.projectPath,
        });
        writeFileSync(
          join(snapshotRoot, 'dot-claude-snapshot.json'),
          JSON.stringify(snapshot, null, 2),
          'utf8',
        );
      } catch (err) {
        console.warn(`[audit-runner] Could not write dot-claude-snapshot.json for mcp: ${(err as Error).message}`);
      }
    }

    // For output-styles audits, write the cross-entity snapshot so the expert
    // agent can reason about the style in the context of the full .claude/
    // configuration (CLAUDE.md, rules, other styles, etc.).
    if (req.outputStylesTarget) {
      try {
        const snapshot = buildDotClaudeSnapshot({
          projectId: req.outputStylesTarget.projectId,
          projectPath: req.outputStylesTarget.projectPath,
        });
        writeFileSync(
          join(snapshotRoot, 'dot-claude-snapshot.json'),
          JSON.stringify(snapshot, null, 2),
          'utf8',
        );
      } catch (err) {
        console.warn(`[audit-runner] Could not write dot-claude-snapshot.json for output-styles: ${(err as Error).message}`);
      }
    }

    return {
      workdir,
      extras: {
        skillDir: req.skillDir,
        syncTimer: null,
        worktreePath,
        worktreeGitRoot: worktreePath ? gitRoot : null,
      },
    };
  },

  buildFirstPrompt(req) {
    if (req.claudemdTarget) {
      const ct = req.claudemdTarget;
      const targetPath = join(ct.projectPath, 'CLAUDE.md');
      const exists = existsSync(targetPath);
      return [
        `/${CLAUDEMD_EXPERT_SKILL_NAME} audit`,
        '',
        `Operate on the project root CLAUDE.md.`,
        `Project root: ${ct.projectPath}`,
        `Target file: ${targetPath} (${exists ? 'exists' : 'does not exist yet'})`,
        '',
        `Follow the procedure for the "audit" command in your SKILL.md and begin now.`,
      ].join('\n');
    }
    if (req.rulesTarget) {
      const rt = req.rulesTarget;
      const targetPath = join(rt.projectPath, '.claude', 'rules', rt.ruleName);
      const exists = existsSync(targetPath);
      return [
        `/${RULES_EXPERT_SKILL_NAME} audit`,
        '',
        `Operate on the rule file: ${targetPath} (${exists ? 'exists' : 'does not exist yet'})`,
        `Project root: ${rt.projectPath}`,
        `Rule name (relative to .claude/rules/): ${rt.ruleName}`,
        '',
        `Follow the procedure for the "audit" command in your SKILL.md and begin now.`,
      ].join('\n');
    }
    if (req.subagentsTarget) {
      const st = req.subagentsTarget;
      const targetPath = join(st.projectPath, '.claude', 'agents', st.subagentName);
      const exists = existsSync(targetPath);
      return [
        `/${SUBAGENTS_EXPERT_SKILL_NAME} audit`,
        '',
        `Operate on the subagent file: ${targetPath} (${exists ? 'exists' : 'does not exist yet'})`,
        `Project root: ${st.projectPath}`,
        `Subagent name (relative to .claude/agents/): ${st.subagentName}`,
        '',
        `Follow the procedure for the "audit" command in your SKILL.md and begin now.`,
      ].join('\n');
    }
    if (req.hooksTarget) {
      const ht = req.hooksTarget;
      const settingsPath = join(ht.projectPath, '.claude', 'settings.json');
      const exists = existsSync(settingsPath);
      return [
        `/${HOOKS_EXPERT_SKILL_NAME} audit`,
        '',
        `Operate on the hooks block of the project settings.`,
        `Project root: ${ht.projectPath}`,
        `Settings file: ${settingsPath} (${exists ? 'exists' : 'does not exist yet'})`,
        '',
        `Follow the procedure for the "audit" command in your SKILL.md and begin now.`,
      ].join('\n');
    }
    if (req.permissionsTarget) {
      const pt = req.permissionsTarget;
      const scope = pt.scope ?? 'project';
      const filename = scope === 'local' ? 'settings.local.json' : 'settings.json';
      const settingsPath = join(pt.projectPath, '.claude', filename);
      const exists = existsSync(settingsPath);
      return [
        `/${PERMISSIONS_EXPERT_SKILL_NAME} audit`,
        '',
        `Operate on the permissions block of the project settings.`,
        `Project root: ${pt.projectPath}`,
        `Scope: ${scope}`,
        `Settings file: ${settingsPath} (${exists ? 'exists' : 'does not exist yet'})`,
        '',
        `Follow the procedure for the "audit" command in your SKILL.md and begin now.`,
      ].join('\n');
    }
    if (req.mcpTarget) {
      const mt = req.mcpTarget;
      const mcpPath = join(mt.projectPath, '.mcp.json');
      const exists = existsSync(mcpPath);
      return [
        `/${MCP_EXPERT_SKILL_NAME} audit`,
        '',
        `Operate on the project MCP configuration file.`,
        `Project root: ${mt.projectPath}`,
        `Target file: ${mcpPath} (${exists ? 'exists' : 'does not exist yet'})`,
        '',
        `Follow the procedure for the "audit" command in your SKILL.md and begin now.`,
      ].join('\n');
    }
    if (req.outputStylesTarget) {
      const ost = req.outputStylesTarget;
      const targetPath = join(ost.projectPath, '.claude', 'output-styles', ost.styleName);
      const exists = existsSync(targetPath);
      return [
        `/${OUTPUT_STYLES_EXPERT_SKILL_NAME} audit`,
        '',
        `Operate on the output style file: ${targetPath} (${exists ? 'exists' : 'does not exist yet'})`,
        `Project root: ${ost.projectPath}`,
        `Style name (relative to .claude/output-styles/): ${ost.styleName}`,
        '',
        `Follow the procedure for the "audit" command in your SKILL.md and begin now.`,
      ].join('\n');
    }
    return `/${FACTORY_SKILL_NAME} audit ${req.skillName}`;
  },

  createInitialRun(req, runId, workdir, extras): AuditRun {
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
      // When a git worktree was created, set cwd so executeTurn uses the
      // worktree as Claude subprocess cwd (gives the agent access to real
      // project sources while keeping Nakiros artefacts in workdir).
      cwd: extras?.worktreePath ?? undefined,
      reportPath: null,
      turns: [],
      tokensUsed: 0,
      durationMs: 0,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      error: null,
      manifest: null,
      checkResults: [],
      claudemdTarget: req.claudemdTarget,
      rulesTarget: req.rulesTarget,
      subagentsTarget: req.subagentsTarget,
      hooksTarget: req.hooksTarget,
      permissionsTarget: req.permissionsTarget,
      mcpTarget: req.mcpTarget,
      outputStylesTarget: req.outputStylesTarget,
    };
  },

  afterStart(entry) {
    entry.extras.syncTimer = setInterval(() => {
      // Self-arrest as soon as the run reaches a terminal state, even if
      // cleanupOnTerminal hasn't fired yet (e.g. helpers.fail mid-turn).
      const status = entry.run.status;
      if (entry.killed || status === 'completed' || status === 'failed' || status === 'stopped') {
        stopProgressPolling(entry.extras);
        return;
      }
      syncAuditProgress(entry);
    }, PROGRESS_POLL_MS);
  },

  onTurnComplete(entry, helpers) {
    // One last sync before deciding what to do with the run — captures any
    // line the agent appended in the very last tool call before it returned.
    syncAuditProgress(entry);

    const result = archiveReport(entry);
    if (result.ok) {
      entry.run.reportPath = result.reportPath;
      stopProgressPolling(entry.extras);
      helpers.complete(entry);
      entry.eventLog.emit({ type: 'done', exitCode: 0, reportPath: result.reportPath });
      return;
    }
    // No report yet — agent is asking for clarification. Wait for the user.
    helpers.wait(entry);
  },

  onTurnFailed(entry) {
    stopProgressPolling(entry.extras);
    if (entry.extras.worktreePath) {
      destroyEvalSandbox(entry.extras.worktreePath, entry.extras.worktreeGitRoot ?? undefined);
      entry.extras.worktreePath = null;
    }
  },

  cleanupOnTerminal(entry) {
    stopProgressPolling(entry.extras);
    if (entry.extras.worktreePath) {
      // Before destroying the worktree, rescue the audit report into workdir
      // so that the archive step below can still find it. A stop before
      // the report was written is legitimate — the copy is best-effort.
      const reportInWorktree = join(entry.extras.worktreePath, 'outputs', 'audit-report.md');
      if (existsSync(reportInWorktree)) {
        try {
          const destDir = join(entry.run.workdir, 'outputs');
          mkdirSync(destDir, { recursive: true });
          copyFileSync(reportInWorktree, join(destDir, 'audit-report.md'));
        } catch (err) {
          console.warn(`[audit-runner] Could not rescue audit-report.md from worktree: ${(err as Error).message}`);
        }
      }
      destroyEvalSandbox(entry.extras.worktreePath, entry.extras.worktreeGitRoot ?? undefined);
      entry.extras.worktreePath = null;
      // Clear cwd so archiveReport (below) falls back to workdir — the rescue
      // copy above already moved the report there and the worktree is gone.
      entry.run.cwd = undefined;
    }
    // Archive the report if it was produced but the run was stopped before
    // onTurnComplete got to do it (user hit Stop after the agent wrote the
    // report but before Nakiros could call helpers.complete). Guard against
    // double-archiving when onTurnComplete already ran (reportPath non-null).
    if (!entry.run.reportPath) {
      const result = archiveReport(entry);
      if (result.ok) {
        entry.run.reportPath = result.reportPath;
        persistRunJson(entry.run.workdir, { ...entry.run, _extras: entry.extras });
        console.log(`[audit-runner] Archived report on stop: ${result.reportPath}`);
      }
    }
    cleanupRunWorkdir(entry.run.workdir);
  },

  findActiveForTarget(req, registry) {
    for (const entry of registry.values()) {
      const { run } = entry;
      if (run.scope !== req.scope) continue;
      if (run.projectId !== req.projectId) continue;
      if (run.skillName !== req.skillName) continue;
      // CLAUDE.md audits disambiguate by projectPath so two projects with the
      // same skill name don't collapse onto a single run.
      if (req.claudemdTarget || run.claudemdTarget) {
        if (!req.claudemdTarget || !run.claudemdTarget) continue;
        if (req.claudemdTarget.projectPath !== run.claudemdTarget.projectPath) continue;
      }
      // Rules audits disambiguate by projectId + ruleName.
      if (req.rulesTarget || run.rulesTarget) {
        if (!req.rulesTarget || !run.rulesTarget) continue;
        if (req.rulesTarget.projectId !== run.rulesTarget.projectId) continue;
        if (req.rulesTarget.ruleName !== run.rulesTarget.ruleName) continue;
      }
      // Subagents audits disambiguate by projectId + subagentName.
      if (req.subagentsTarget || run.subagentsTarget) {
        if (!req.subagentsTarget || !run.subagentsTarget) continue;
        if (req.subagentsTarget.projectId !== run.subagentsTarget.projectId) continue;
        if (req.subagentsTarget.subagentName !== run.subagentsTarget.subagentName) continue;
      }
      // Hooks audits: singleton per project — disambiguate by projectId only.
      if (req.hooksTarget || run.hooksTarget) {
        if (!req.hooksTarget || !run.hooksTarget) continue;
        if (req.hooksTarget.projectId !== run.hooksTarget.projectId) continue;
      }
      // Permissions audits: one per (projectId, scope) — a project audit and a
      // local audit may run concurrently.
      if (req.permissionsTarget || run.permissionsTarget) {
        if (!req.permissionsTarget || !run.permissionsTarget) continue;
        if (req.permissionsTarget.projectId !== run.permissionsTarget.projectId) continue;
        const reqScope = req.permissionsTarget.scope ?? 'project';
        const runScope = run.permissionsTarget.scope ?? 'project';
        if (reqScope !== runScope) continue;
      }
      // MCP audits: singleton per project — disambiguate by projectId only.
      if (req.mcpTarget || run.mcpTarget) {
        if (!req.mcpTarget || !run.mcpTarget) continue;
        if (req.mcpTarget.projectId !== run.mcpTarget.projectId) continue;
      }
      // Output-styles audits disambiguate by projectId + styleName.
      if (req.outputStylesTarget || run.outputStylesTarget) {
        if (!req.outputStylesTarget || !run.outputStylesTarget) continue;
        if (req.outputStylesTarget.projectId !== run.outputStylesTarget.projectId) continue;
        if (req.outputStylesTarget.styleName !== run.outputStylesTarget.styleName) continue;
      }
      if (isActiveRunStatus(run.status)) return entry;
    }
    return null;
  },

  rehydrate(persisted, workdir): RehydrateResult<AuditRun, AuditEntryExtras> {
    const blob = persisted as (AuditRun & { _extras?: AuditEntryExtras; _skillDir?: string }) | null;
    if (!blob || !blob.runId) return { kind: 'cleanup' };

    // Legacy persistence stored skillDir as `_skillDir`; current factory uses `_extras.skillDir`.
    const skillDir = blob._extras?.skillDir ?? blob._skillDir;
    if (!skillDir) return { kind: 'cleanup' };

    // Stopped/failed are genuinely disposable.
    if (blob.status === 'stopped' || blob.status === 'failed') return { kind: 'cleanup' };

    const wasActive = blob.status === 'starting' || blob.status === 'running';
    // Running/starting WITHOUT sessionId — or WITH a sessionId whose Claude
    // session file no longer lives on disk — can't be resumed via `--resume`.
    // Collapse to `stopped` instead of wiping so the user still sees the
    // partial conversation in the runs center and can dismiss when ready.
    const canResume = !wasActive || auditRunHasResumableSessionFile(blob, workdir);
    const restoredStatus: AuditRun['status'] = wasActive
      ? canResume
        ? 'waiting_for_input'
        : 'stopped'
      : blob.status;

    const restoredRun: AuditRun = {
      runId: blob.runId,
      scope: blob.scope,
      projectId: blob.projectId,
      pluginName: blob.pluginName,
      marketplaceName: blob.marketplaceName,
      skillName: blob.skillName,
      status: restoredStatus,
      sessionId: blob.sessionId ?? null,
      workdir,
      // Restore the worktree cwd so session JSONL lookups (getAuditTimeline,
      // getAuditUsage) keep pointing at the right ~/.claude/projects/<encoded>/
      // path. The worktree itself is gone (swept on boot) but we only need the
      // encoded path to find the existing session file.
      cwd: (blob as AuditRun).cwd ?? undefined,
      reportPath: blob.reportPath ?? null,
      turns: Array.isArray(blob.turns) ? blob.turns : [],
      tokensUsed: typeof blob.tokensUsed === 'number' ? blob.tokensUsed : 0,
      durationMs: typeof blob.durationMs === 'number' ? blob.durationMs : 0,
      startedAt: blob.startedAt ?? new Date().toISOString(),
      finishedAt: restoredStatus === 'stopped' && wasActive
        ? new Date().toISOString()
        : (blob.finishedAt ?? null),
      error: blob.error ?? null,
      // Surface the interruption to the UI when we collapsed an active run.
      // A `waiting_for_input` that was already waiting on disk keeps its
      // existing flag (preserved across reboots until the user resumes).
      // The flag is only useful when the run is actually resumable — for
      // `stopped` collapses (no sessionId), it stays false.
      interruptedByReboot:
        restoredStatus === 'waiting_for_input' && wasActive
          ? true
          : blob.interruptedByReboot,
      // Restore the claudemd target so the run keeps surfacing the right
      // CLAUDE.md context across reboots.
      claudemdTarget: blob.claudemdTarget,
      // Restore the rules target so the run keeps surfacing the right
      // rule context across reboots.
      rulesTarget: blob.rulesTarget,
      // Restore the subagents target so the run keeps surfacing the right
      // subagent context across reboots.
      subagentsTarget: blob.subagentsTarget,
      // Restore the hooks target so the run keeps surfacing the right
      // hooks context across reboots.
      hooksTarget: blob.hooksTarget,
      // Restore the permissions target so the run keeps surfacing the right
      // permissions context across reboots.
      permissionsTarget: blob.permissionsTarget,
      // Restore the MCP target so the run keeps surfacing the right
      // .mcp.json context across reboots.
      mcpTarget: blob.mcpTarget,
      // Restore the output-styles target so the run keeps surfacing the right
      // style context across reboots.
      outputStylesTarget: blob.outputStylesTarget,
      // Restore live audit state — sidebar resumes where it left off without
      // re-reading the workdir until the next turn (which re-syncs anyway).
      manifest: blob.manifest ?? null,
      checkResults: Array.isArray(blob.checkResults) ? blob.checkResults : [],
    };

    console.log(`[audit-runner] Restored audit ${restoredRun.runId} for "${restoredRun.skillName}" (status=${restoredStatus}, ${restoredRun.checkResults?.length ?? 0}/${restoredRun.manifest?.totalChecks ?? '?'} checks)`);
    // worktreePath is always null on boot — sweepOrphanSandboxes already
    // cleaned up any leftover worktrees. The path is not needed for session
    // JSONL lookups (run.cwd is used for that, restored above).
    return { kind: 'rehydrate', run: restoredRun, extras: { skillDir, syncTimer: null, worktreePath: null, worktreeGitRoot: null } };
  },
};

const runner = createRunner(spec);

// ─── Public API — preserved exports for IPC handlers ────────────────────────

interface RunOpts {
  skillDir: string;
  onEvent(event: AuditRunEvent): void;
}

/**
 * Boot recovery. Scans `~/.nakiros/runs/audit/*` and rehydrates any persisted
 * run that's still meaningful (completed for revisit, in-flight for resume),
 * cleaning up the rest.
 */
export function restoreOrCleanupAuditWorkdirs(): void {
  runner.restoreOrCleanup(() => {
    /* no broadcast on boot — the live listener will rebind on first IPC call */
  });
}

/** List all active (non-terminal) audit runs. */
export function listActiveAuditRuns(): AuditRun[] {
  return runner.listActive();
}

/**
 * List every audit run currently held in memory — active **and** terminal
 * (completed / failed / stopped). Used by the runs center so completed audits
 * restored at boot can be revisited and dismissed by the user.
 */
export function listAllAuditRuns(): AuditRun[] {
  return runner.listAll();
}

/**
 * Start (or resume) an audit run for `request.skillName`. Idempotent on the
 * `(scope, projectId, skillName)` triple — when a non-terminal run already
 * exists, the event log is re-pointed to the new caller and the existing run
 * is returned without spawning a new claude subprocess.
 */
export function startAudit(request: StartAuditRequest, opts: RunOpts): AuditRun {
  return runner.start(
    { ...request, skillDir: opts.skillDir },
    { onEvent: opts.onEvent },
  );
}

/**
 * Forward a user message to an audit run that's in `waiting_for_input`.
 * Re-points the event log to the current caller, executes one claude turn via
 * `--resume`, and checks whether the audit report was produced on completion.
 *
 * @throws {Error} when the run is unknown or not waiting for input
 */
export async function sendAuditUserMessage(runId: string, message: string, opts: RunOpts): Promise<void> {
  await runner.sendUserMessage(runId, message, { onEvent: opts.onEvent });
}

/**
 * Cancel an in-flight audit run: `SIGTERM` the child, collapse status to
 * `stopped`, emit the final events, and tear down the workdir + event log.
 * The entry stays in the registry so the UI can keep rendering the stopped
 * run until the user navigates away. No-op when the run is unknown.
 */
export function stopAudit(runId: string): void {
  runner.stop(runId);
}

/**
 * User-acknowledged completion ("Terminer" button). The archived audit-report.md
 * in `{skillDir}/audits/` is kept; the workdir (conversation + events) is deleted
 * and the entry leaves the registry.
 */
export function finishAudit(runId: string): void {
  runner.finish(runId, { onEvent: () => undefined });
}

/** Look up an audit run by id. Returns `null` when unknown. */
export function getAuditRun(runId: string): AuditRun | null {
  return runner.getRun(runId);
}

/**
 * Return the buffered stream events for the current (in-flight) turn. Used by
 * the frontend when remounting AuditView mid-run so the live activity panel
 * re-populates instead of appearing empty.
 */
export function getAuditBufferedEvents(runId: string): AuditEvent[] {
  return runner.getBufferedEvents(runId);
}

/**
 * Build the audit-conversation timeline directly from Claude Code's session
 * jsonl. Single source of truth for the chat view of an audit run — same
 * pattern as `getFixTimeline`. Returns the universal `user` /
 * `assistant_text` / `tool` kinds; the audit-progress sidebar (manifest,
 * sections, findings) is driven by a separate event stream and does not
 * appear in this timeline.
 *
 * Filters Write/Edit/MultiEdit on Nakiros-internal artefacts (the
 * audit-progress jsonl and the manifest json) so they don't surface as
 * generic tool calls — the user already sees them in the sidebar. The
 * archived audit report (`audits/audit-*.md`) IS surfaced as a tool box
 * since it represents work the user can recognize.
 *
 * Returns an empty array when the run has no sessionId yet (fresh run,
 * first turn still streaming) or the file is missing.
 */
export function getAuditTimeline(runId: string): AuditTimelineEntry[] {
  const entry = runner.registry().get(runId);
  if (!entry) return [];
  const { sessionId, workdir } = entry.run;
  if (!sessionId) return [];

  // Claude Code indexes sessions by subprocess cwd. When a worktree was used,
  // that cwd was run.cwd (the worktree path), not workdir.
  const sessionBase = entry.run.cwd ?? workdir;
  return buildChatTimeline(sessionBase, sessionId, isAuditProgressPath);
}

/**
 * Compute the billed-equivalent + agent-active stats for an audit run by
 * walking its Claude Code session JSONL. Delegates to the shared
 * {@link computeSessionUsage} helper — same algorithm and pricing rules
 * as fix and eval. Returns the empty-state value when the run has no
 * sessionId yet (still queued / first turn).
 */
export function getAuditUsage(runId: string): FixUsage {
  const entry = runner.registry().get(runId);
  if (!entry) return computeSessionUsage('', null);
  const { sessionId, workdir, cwd, startedAt } = entry.run;
  // Use run.cwd when available — Claude Code indexes sessions by subprocess cwd.
  return computeSessionUsage(cwd ?? workdir, sessionId, startedAt);
}

/**
 * True when the tool input targets `outputs/audit-progress.jsonl` or
 * `outputs/audit-manifest.json`. These are the live-progress artefacts the
 * skill writes during an audit; they're already streamed to the sidebar
 * via the typed `manifest` / `check_result` events, so re-rendering them
 * as generic tool calls in the chat would be redundant noise.
 */
function isAuditProgressPath(input: Record<string, unknown>, agentCwd: string): boolean {
  const filePath = typeof input.file_path === 'string' ? input.file_path : '';
  if (!filePath) return false;
  // Must be relative to the agent's effective cwd (worktree when one was
  // created, otherwise workdir) so paths written by Claude match correctly.
  const rel = relative(agentCwd, filePath);
  return rel === 'outputs/audit-progress.jsonl' || rel === 'outputs/audit-manifest.json';
}

/** List archived audit reports for a given skill, newest first. */
export function listAuditHistory(skillDir: string): AuditHistoryEntry[] {
  const auditsDir = join(skillDir, 'audits');
  if (!existsSync(auditsDir)) return [];
  let files: string[];
  try {
    files = readdirSync(auditsDir).filter((f) => f.startsWith('audit-') && f.endsWith('.md'));
  } catch {
    return [];
  }

  const result: AuditHistoryEntry[] = files.map((fileName) => {
    const path = join(auditsDir, fileName);
    let sizeBytes = 0;
    let timestamp = '';
    try {
      const stat = statSync(path);
      sizeBytes = stat.size;
      const m = basename(fileName).match(/^audit-(.+)\.md$/);
      if (m) {
        const isoLike = m[1].replace(/(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})/, '$1T$2:$3:$4');
        timestamp = new Date(isoLike).toISOString();
      } else {
        timestamp = stat.mtime.toISOString();
      }
    } catch {
      // ignore
    }
    return { fileName, path, timestamp, sizeBytes };
  });

  result.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
  return result;
}

/** Read the content of an archived audit report. Returns `null` on miss or read error. */
export function readAuditReport(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}
