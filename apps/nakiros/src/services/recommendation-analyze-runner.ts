/**
 * Recommendation analyser runner. Single-turn agent that reads a friction
 * pattern + the project's `.claude/` inventory and writes 1..N markdown
 * recommendation cards under `./recos/`. After the turn:
 *   - parses each card via `recommendation-card-parser`
 *   - downgrades invalid `fix` targets to `create` against the same inventory
 *   - persists valid cards via `recommendation-store.writeRecoCard`
 *   - updates the parent pattern's `analysis` block
 *
 * Mirrors `classify-convo-runner.ts` for runner-core integration.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

import type {
  RecommendationAnalyzeRun,
  RecommendationAnalyzeRunEvent,
  RecommendationPattern,
  StartRecommendationAnalyzeRequest,
} from '@nakiros/shared';

import {
  cleanupRunWorkdir,
  createRunner,
  isActiveRunStatus,
  type RehydrateResult,
  type RunEntry,
  type RunnerSpec,
  writeExecutionSettings,
} from './runner-core/index.js';
import { buildProjectInventorySync, type ProjectInventory } from './recommendation-inventory.js';
import { parseRecoCardFromMarkdown } from './recommendation-card-parser.js';
import { readPatterns, updatePatternAnalysis, writeRecoCard } from './recommendation-store.js';
import { peekCachedAnalysis } from './conversation-analysis-cache.js';

const KIND = 'recommendation-analyze';
const MODEL = 'sonnet' as const;

// ─── Runner-internal types ────────────────────────────────────────────────────

interface AnalyzeExtras {
  /** Stable project identifier. */
  projectId: string;
  /** Absolute path to the project root on disk. */
  projectPath: string;
  /**
   * Absolute path to the Claude Code provider dir for this project
   * (`~/.claude/projects/<encoded>/`). Used by `peekCachedAnalysis` to locate
   * the source JSONL and validate the mtime guard.
   */
  providerProjectDir: string;
  /** Pattern being analysed — resolved from the store at start. */
  pattern: RecommendationPattern;
  /**
   * Inventory built at start and written to `inventory.json` in the workdir.
   * The agent reads this file directly; we keep a copy here for the parser
   * cross-check in `onTurnComplete`.
   */
  inventory: ProjectInventory;
}

/**
 * Internal start request — the public `StartRecommendationAnalyzeRequest` plus
 * the caller-resolved `projectPath` and `providerProjectDir` (handlers resolve
 * these from the project registry before calling `startRecommendationAnalyze`).
 */
interface AnalyzeStartReq extends StartRecommendationAnalyzeRequest {
  projectPath: string;
  providerProjectDir: string;
}

type AnalyzeEvent = RecommendationAnalyzeRunEvent['event'];
type AnalyzeEntry = RunEntry<RecommendationAnalyzeRun, AnalyzeEvent, AnalyzeExtras>;

// ─── Paths ────────────────────────────────────────────────────────────────────

/** Root directory where per-run workdirs are created. */
function runsRoot(): string {
  return join(homedir(), '.nakiros', 'runs', 'recommendation-analyze');
}

// ─── Zone hydration ───────────────────────────────────────────────────────────

/**
 * Resolve full `ConversationFrictionZone` records for the pattern's `zoneRefs`.
 * Reads each cached analysis via `peekCachedAnalysis`; missing analyses produce
 * a `{ missing: true }` stub so the agent knows the evidence is incomplete.
 *
 * @param providerProjectDir Absolute path to the Claude Code provider project dir.
 * @param pattern            Pattern whose `zoneRefs` are to be hydrated.
 * @returns An object containing the pattern and an array of hydrated zone records.
 */
function hydrateZones(
  providerProjectDir: string,
  pattern: RecommendationPattern,
): { pattern: RecommendationPattern; zones: unknown[] } {
  const zones: unknown[] = [];
  for (const ref of pattern.zoneRefs) {
    const analysis = peekCachedAnalysis(providerProjectDir, ref.convoId);
    const zone = analysis?.frictionZones?.find((z) => z.id === ref.zoneId);
    if (zone) {
      zones.push({ convoId: ref.convoId, zone });
    } else {
      zones.push({ convoId: ref.convoId, zoneId: ref.zoneId, missing: true });
    }
  }
  return { pattern, zones };
}

// ─── First prompt ─────────────────────────────────────────────────────────────

/**
 * Build the full first-turn prompt from the resolved extras. Self-contained —
 * does not read any files; the agent receives file paths and uses its own tools.
 *
 * @param extras Kind-specific extras resolved during `prepareWorkdir`.
 * @returns The first user prompt string passed to the Claude Code CLI.
 */
function buildInitialPrompt(extras: AnalyzeExtras): string {
  return `ROLE
====
You are the Nakiros recommendation agent. A friction pattern has been
detected across ${extras.pattern.zoneCount} conversations of this project.
Produce one or more recommendation cards proposing concrete \`.claude/\`
actions that would have prevented this friction.

PATTERN
=======
The pattern is in ./pattern.json. Read it with the Read tool. It contains:
- topTokens, filesTouched, signalKinds, severity, zoneCount.
- For each zone: reactionPoint.snippet (full text of the user message), agentContext
  (keyActions, filesTouched, toolErrorsCount, backtrackedFiles), originating convoId.

EXISTING .claude/ INVENTORY
===========================
The inventory is in ./inventory.json. Read it with the Read tool. It lists
existing rules/skills/claudemd/subagents/hooks/permissions/mcps/output-styles
with identifiers and short descriptions. Use it to decide whether to
\`fix\` an existing artefact or \`create\` a new one.

YOUR JOB
========
Write 1..N markdown cards to \`./recos/<kebab-title>.md\`. Each card = ONE
atomic action. If multiple levers are needed (fix rule X + create skill Y
+ add a CLAUDE.md note), write one card per lever.

Constraints:
- The 'Brief' body is passed verbatim to the downstream fix/create runner —
  make it self-contained: cite zone excerpts, exact file paths, exact errors.
  Never summarise.
- Don't invent artefacts. For 'fix', the target MUST exist in inventory.json.
  If unsure, prefer 'create'.
- Output language matches the user's language (auto-detect from zone excerpts).
- patternId in the frontmatter MUST equal "${extras.pattern.id}".

CARD TEMPLATE
=============
Use this exact structure. The frontmatter is YAML between two \`---\` lines.

\`\`\`markdown
---
recId: <kebab-title>
patternId: ${extras.pattern.id}
action: fix | create
artifactType: rules | skill | claudemd | subagent | hook | permission | mcp | output-style
target: <existing-id> | new
title: <short human title>
evidence:
  zoneRefs:
    - {convoId: <id>, zoneId: <id>}
  files:
    - <path>
---

# <title>

## Why
<2-3 sentences anchored in pattern evidence>

## Brief
<self-contained prompt for the downstream runner — detailed, includes zone
excerpts and exact targets. At least 20 characters.>

## Acceptance criteria
- bullet 1
- bullet 2
\`\`\`

When you are done writing all the cards, end your turn. Do not return the
cards inline — only write them to files.`;
}

// ─── Runner spec ──────────────────────────────────────────────────────────────

const spec: RunnerSpec<RecommendationAnalyzeRun, AnalyzeStartReq, AnalyzeEvent, AnalyzeExtras> = {
  kind: KIND,
  runsRoot,

  /**
   * Create the workdir, write `pattern.json` (with hydrated zones) and
   * `inventory.json`, then return extras. All I/O is synchronous.
   */
  prepareWorkdir(req, runId) {
    const patterns = readPatterns(req.projectId) ?? [];
    const pattern = patterns.find((p) => p.id === req.patternId);
    if (!pattern) {
      throw new Error(`Pattern ${req.patternId} not found for project ${req.projectId}.`);
    }

    const workdir = join(runsRoot(), runId);
    mkdirSync(workdir, { recursive: true });
    mkdirSync(join(workdir, 'recos'), { recursive: true });
    writeExecutionSettings(workdir);

    const hydrated = hydrateZones(req.providerProjectDir, pattern);
    writeFileSync(join(workdir, 'pattern.json'), JSON.stringify(hydrated, null, 2));

    const inventory = buildProjectInventorySync(req.projectId, req.projectPath);
    writeFileSync(join(workdir, 'inventory.json'), JSON.stringify(inventory, null, 2));

    return {
      workdir,
      extras: {
        projectId: req.projectId,
        projectPath: req.projectPath,
        providerProjectDir: req.providerProjectDir,
        pattern,
        inventory,
      },
    };
  },

  /**
   * Synchronous — the full prompt is derived from `ctx.extras` already resolved
   * in `prepareWorkdir`. Nothing is re-read from disk here.
   */
  buildFirstPrompt(_req, ctx) {
    return buildInitialPrompt(ctx.extras);
  },

  /**
   * Create the initial `RecommendationAnalyzeRun`. `sessionId` is set to
   * `patternId` as a stable placeholder; runner-core overwrites it on the
   * first stream event with the spawned Claude Code session id. Always use
   * `sourcePatternId` to identify which pattern this run belongs to.
   */
  createInitialRun(req, runId, workdir): RecommendationAnalyzeRun {
    return {
      runId,
      projectId: req.projectId,
      sourcePatternId: req.patternId,
      // Placeholder — runner-core overwrites this with the Claude Code session id
      // on the first stream event. See `feedback_runner_core_session_id_overwrite.md`.
      sessionId: req.patternId,
      status: 'starting',
      sessionClaudeId: null,
      workdir,
      model: MODEL,
      recoCount: 0,
      turns: [],
      tokensUsed: 0,
      durationMs: 0,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      error: null,
    };
  },

  /**
   * Build CLI args for the Claude Code subprocess. Always uses `MODEL` (sonnet).
   * First turn: no `--resume`. Subsequent turns: pass the spawned session id.
   */
  buildCliArgs(prompt, entry, isFirstTurn) {
    return {
      prompt,
      resumeSessionId: isFirstTurn ? undefined : (entry.run.sessionClaudeId ?? undefined),
      model: MODEL,
    };
  },

  /**
   * After the agent's turn completes, scan `./recos/*.md`, parse each card,
   * persist valid ones, then mark the run completed and update the pattern's
   * `analysis` block. Skipped files are logged as warnings — the run still
   * completes even if some cards are malformed.
   *
   * This runner is single-turn: we never call `helpers.wait()`.
   */
  onTurnComplete(entry, helpers) {
    const recosDir = join(entry.run.workdir, 'recos');
    const files = existsSync(recosDir)
      ? readdirSync(recosDir).filter((f) => f.endsWith('.md'))
      : [];

    let recoCount = 0;
    const skipped: Array<{ file: string; reason: string }> = [];

    for (const f of files) {
      const md = readFileSync(join(recosDir, f), 'utf8');
      const result = parseRecoCardFromMarkdown(md, entry.extras.pattern.id, entry.extras.inventory);
      if (!result.ok) {
        skipped.push({ file: f, reason: result.reason });
        continue;
      }
      writeRecoCard(entry.extras.projectId, result.card);
      recoCount++;
      if (result.downgraded) {
        console.log(
          `[recommendation-analyze] Card ${f}: action downgraded fix→create (target not in inventory).`,
        );
      }
    }

    entry.run.recoCount = recoCount;

    updatePatternAnalysis(entry.extras.projectId, entry.extras.pattern.id, {
      status: 'done',
      runId: entry.run.runId,
      recoCount,
      lastAnalyzedAt: new Date().toISOString(),
    });

    helpers.complete(entry);
    entry.eventLog.emit({ type: 'done', recoCount });

    if (skipped.length > 0) {
      console.warn(`[recommendation-analyze] ${skipped.length} card(s) skipped:`, skipped);
    }
  },

  /** Remove the workdir on stop / finish. */
  cleanupOnTerminal(entry) {
    cleanupRunWorkdir(entry.run.workdir);
  },

  /**
   * Idempotence guard: returns an active run if one is already running for the
   * same `(projectId, patternId)` pair. Compare against `sourcePatternId` —
   * `sessionId` is overwritten by runner-core and would not match.
   */
  findActiveForTarget(req, registry) {
    for (const entry of registry.values()) {
      if (entry.run.projectId !== req.projectId) continue;
      if (entry.run.sourcePatternId !== req.patternId) continue;
      if (isActiveRunStatus(entry.run.status)) return entry;
    }
    return null;
  },

  /**
   * Boot rehydration. Single-turn runs that were active at daemon shutdown
   * cannot be resumed safely (the Claude Code subprocess is gone). Mark them
   * `failed` so the UI shows a clear "Interrupted" state rather than a ghost
   * `running` run.
   *
   * Terminal runs (`completed` / `failed` / `stopped`) trigger a workdir
   * cleanup — they've already done their job (or failed to).
   */
  rehydrate(persisted, workdir): RehydrateResult<RecommendationAnalyzeRun, AnalyzeExtras> {
    const blob = persisted as (RecommendationAnalyzeRun & { _extras?: AnalyzeExtras }) | null;
    if (!blob || !blob.runId) return { kind: 'cleanup' };

    // Terminal runs are cleaned up on boot — their artefacts were persisted
    // during `onTurnComplete` so there's nothing to recover.
    if (
      blob.status === 'stopped' ||
      blob.status === 'failed' ||
      blob.status === 'completed'
    ) {
      return { kind: 'cleanup' };
    }

    // Active at boot — the subprocess died with the previous daemon process.
    // Mark the run failed and restore enough state for the UI to display it.
    const extras = blob._extras;
    if (!extras || !extras.projectId || !extras.projectPath || !extras.providerProjectDir || !extras.pattern) {
      return { kind: 'cleanup', reason: 'missing _extras' };
    }

    const restoredRun: RecommendationAnalyzeRun = {
      runId: blob.runId,
      projectId: blob.projectId,
      sourcePatternId: blob.sourcePatternId,
      sessionId: blob.sessionId,
      status: 'failed',
      sessionClaudeId: blob.sessionClaudeId ?? null,
      workdir,
      model: blob.model ?? MODEL,
      recoCount: blob.recoCount ?? 0,
      turns: Array.isArray(blob.turns) ? blob.turns : [],
      tokensUsed: typeof blob.tokensUsed === 'number' ? blob.tokensUsed : 0,
      durationMs: typeof blob.durationMs === 'number' ? blob.durationMs : 0,
      startedAt: blob.startedAt ?? new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      error: 'Daemon restarted while run was active',
      interruptedByReboot: true,
    };

    // Mark the pattern's analysis as failed so the UI can surface a retry button.
    updatePatternAnalysis(extras.projectId, extras.pattern.id, {
      status: 'failed',
      runId: blob.runId,
    });

    console.log(
      `[recommendation-analyze-runner] Boot recovery: run ${blob.runId} for pattern ${blob.sourcePatternId} → failed (interrupted by reboot)`,
    );
    return { kind: 'rehydrate', run: restoredRun, extras };
  },
};

const runner = createRunner(spec);

// ─── Public API ───────────────────────────────────────────────────────────────

/** Options resolved by the IPC handler before calling `startRecommendationAnalyze`. */
export interface RecommendationAnalyzeRunOpts {
  /** Absolute path to the project root on disk. */
  projectPath: string;
  /**
   * Absolute path to the Claude Code provider dir for this project
   * (`~/.claude/projects/<encoded>/`). Used by `peekCachedAnalysis` to locate
   * cached analyses.
   */
  providerProjectDir: string;
  /** Called for every broadcast event from the runner. */
  onEvent(event: RecommendationAnalyzeRunEvent): void;
}

/**
 * Boot recovery. Called once during daemon startup to rehydrate or clean up
 * persisted run workdirs from a previous daemon process.
 */
export function restoreOrCleanupRecommendationAnalyzeWorkdirs(): void {
  runner.restoreOrCleanup(() => {
    /* no broadcast on boot — first IPC call rebinds */
  });
}

/**
 * Start (or rebind to an active) recommendation analyser run for the given
 * pattern. Idempotent on `(projectId, patternId)` — calling this while an
 * active run exists for the same pattern simply rebinds the event log to the
 * new caller and returns the existing run.
 *
 * @param req  IPC request carrying `projectId` + `patternId`.
 * @param opts Caller-resolved context (`projectPath`, `providerProjectDir`, `onEvent`).
 * @returns The current (or freshly started) `RecommendationAnalyzeRun`.
 */
export function startRecommendationAnalyze(
  req: StartRecommendationAnalyzeRequest,
  opts: RecommendationAnalyzeRunOpts,
): RecommendationAnalyzeRun {
  return runner.start(
    {
      ...req,
      projectPath: opts.projectPath,
      providerProjectDir: opts.providerProjectDir,
    },
    { onEvent: opts.onEvent },
  );
}

/**
 * Cancel an in-flight recommendation analyser run. No-op when the run is
 * already in a terminal state or unknown.
 *
 * @param runId The `runId` of the run to stop.
 */
export function stopRecommendationAnalyze(runId: string): void {
  runner.stop(runId);
}

/**
 * Look up a recommendation analyser run by id.
 *
 * @param runId The `runId` to look up.
 * @returns The run, or `null` when unknown.
 */
export function getRecommendationAnalyzeRun(runId: string): RecommendationAnalyzeRun | null {
  return runner.getRun(runId);
}

/**
 * List all active (non-terminal) recommendation analyser runs across all
 * projects.
 *
 * @returns Array of active `RecommendationAnalyzeRun` objects.
 */
export function listActiveRecommendationAnalyzeRuns(): RecommendationAnalyzeRun[] {
  return runner.listActive();
}

/**
 * Return the replay buffer of events for the given run. Used when a frontend
 * component mounts after the run has already started so it can catch up on
 * missed events without re-subscribing.
 *
 * @param runId The `runId` of the target run.
 * @returns Array of buffered events, oldest first.
 */
export function getRecommendationAnalyzeBufferedEvents(runId: string): AnalyzeEvent[] {
  return runner.getBufferedEvents(runId);
}
