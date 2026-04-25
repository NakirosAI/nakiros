# project.ts

**Path:** `packages/shared/src/types/project.ts`

Core shared types for the Nakiros Agent Team surface: project scanning, conversation analysis (deterministic and LLM-powered), skill record, eval suite/run, audit run, fix benchmarks, and dashboard stats. This is the biggest shared module and underpins most IPC contracts.

## Exports

### `type ProviderType`

Supported AI coding agents that Nakiros can scan for projects and skills.

```ts
export type ProviderType = 'claude' | 'gemini' | 'cursor' | 'codex';
```

### `type ProjectStatus`

Lifecycle status of a project tracked by Nakiros.

```ts
export type ProjectStatus = 'active' | 'inactive' | 'dismissed';
```

### `interface Project`

Persisted project record: scanned from a provider project directory + user metadata.

### `interface DetectedProject`

Project freshly detected by the scanner, not yet persisted. Same shape as `Project` minus `lastScannedAt` and `createdAt`.

### `interface ProjectConversation`

Compact metadata extracted from a single Claude Code JSONL conversation.

### `interface ConversationMessage`

Normalized message extracted from a Claude Code JSONL entry (type, content, timestamp, optional tool uses).

## Conversation analysis (deterministic)

### `type ConversationHealthZone`

Health zone displayed in the UI for a conversation's overall score.

```ts
export type ConversationHealthZone = 'healthy' | 'watch' | 'degraded';
```

### `interface ConversationCompaction`

A single compaction event (auto or manual) detected in the JSONL stream.

### `interface ConversationFrictionPoint`

User-message moment flagged as friction (correction / frustration / abort).

### `interface ConversationToolStats`

Per-tool usage stats aggregated across a conversation (count + error count).

### `interface ConversationHotFile`

File touched repeatedly by Edit / Write / NotebookEdit — candidate for rework pattern.

### `type ConversationTipCategory`

Category a `ConversationTip` belongs to.

```ts
export type ConversationTipCategory =
  | 'context' | 'cache' | 'friction' | 'tools' | 'workflow' | 'skills';
```

### `type ConversationTipSeverity`

Severity of a `ConversationTip`, used for sorting and badge colour.

```ts
export type ConversationTipSeverity = 'info' | 'warning' | 'critical';
```

### `interface ConversationTip`

One actionable tip surfaced by the rule-based conversation analyzer. The `id` maps to i18n keys `tips.<id>.title` and `tips.<id>.body`.

### `interface ConversationAnalysis`

Full deterministic analysis of a single conversation: metadata, context health, cache efficiency, friction, tool usage, composite score and tips. Consumed by `ConversationsView` and the diagnostic panel.

## Deep (LLM) conversation analysis

### `interface ConversationDeepAnalysis`

LLM-generated narrative report produced by the deep-analysis skill (Haiku for small sessions, Sonnet-1M for big ones).

## Skill record

### `interface SkillFileEntry`

Directory entry inside a skill folder — file or nested directory with children.

### `type SkillScope`

Unified scope discriminator for every skill-bound operation (list, read, eval, audit, fix, create). Keep in sync with `resolveEvalSkillDir` + `resolveSkillDir` on the daemon side.

```ts
export type SkillScope = 'project' | 'nakiros-bundled' | 'claude-global' | 'plugin';
```

Layout per scope:
- `project` → `<project>/.claude/skills/<name>`
- `nakiros-bundled` → `~/.nakiros/skills/<name>`
- `claude-global` → `~/.claude/skills/<name>`
- `plugin` → `~/.claude/plugins/marketplaces/<marketplaceName>/plugins/<pluginName>/skills/<name>`

### `interface Skill`

Complete skill record: content, directory tree, eval suite, audit count. `pluginName` / `marketplaceName` are only set for `scope: 'plugin'`.

## Eval suite

### `type SkillEvalAssertionType`

Type of an assertion: deterministic `script`, LLM judge, or `manual` review.

### `interface SkillEvalAssertion`

Single assertion result produced by the grader for one eval run.

### `interface SkillEvalTiming`

Token/duration stats captured from a single eval run's `timing.json`.

### `interface SkillEvalGradingRun`

Grading payload for one eval run (with_skill or without_skill baseline).

### `interface SkillEvalGrading`

Paired grading for one eval at one iteration — with_skill + baseline + deltas.

### `interface SkillEvalRunSummary`

Compact per-run summary used inside `SkillEvalIteration`.

### `interface SkillEvalIteration`

One iteration (a full eval round) for a skill — aggregates every eval + baseline.

### `interface SkillEvalAssertionDefinition`

Assertion declaration from the eval's definition file (script/llm/manual + text + optional script body).

### `type SkillEvalMode`

Execution mode: `autonomous` (single --print turn) vs `interactive` (multi-turn via --resume).

### `interface SkillEvalDefinition`

Complete eval definition as declared in the skill's evals folder (prompt, expected output, assertions, optional output files).

### `interface SkillEvalSuite`

Full eval suite for a skill: static definitions + history of iteration results.

## Eval run execution (live state)

### `type EvalRunStatus`

Lifecycle status of a single eval run.

```ts
export type EvalRunStatus =
  | 'queued' | 'starting' | 'running' | 'waiting_for_input'
  | 'grading' | 'completed' | 'failed' | 'stopped';
```

### `type EvalRunConfig`

Config flavour — `with_skill` loads the skill, `without_skill` is the baseline.

### `type EvalRunTurnBlock`

Ordered block inside an eval turn — text or tool invocation, in stream order.

### `interface EvalRunTurn`

One turn (user or assistant message) in an eval run. `blocks` preserves the stream order so the UI can render interleaved text + tool blocks.

### `interface SkillEvalRun`

Full in-memory state of a single eval run — status, turns, tokens, artefact paths, optional git-worktree sandbox path, model id.

### `interface EvalRunOutputEntry`

Output file metadata surfaced in the eval UI (size + mtime, no content).

### `interface EvalRunProgress`

Progress snapshot emitted while an eval run is active.

### `interface EvalRunEvent`

Event broadcast on `eval:event` while an eval run is alive (`status`, `text`, `tool`, `tokens`, `waiting_for_input`, `done`).

### `interface StartEvalRunRequest`

Request to start a suite of eval runs. If `evalNames` is empty/undefined, runs all evals defined for the skill. `skillDirOverride` is used by fix runs.

### `interface StartEvalRunResponse`

Response from `eval:startRuns` — the iteration index + the per-run `runIds`.

## Audit run

### `type AuditRunStatus`

Lifecycle status of an audit run.

### `interface AuditRunTurn`

One turn (user or assistant) inside an audit run conversation.

### `interface AuditRun`

Full in-memory state of an audit run — mirror of `SkillEvalRun` for the audit flow. `reportPath` is set once the run completes successfully and points at `{skill}/audits/audit-<ts>.md`.

### `interface AuditRunEvent`

Event broadcast on `audit:event` while an audit run is alive.

### `interface StartAuditRequest`

Request payload for the `audit:start` IPC channel.

## Fix benchmarks

### `interface FixBenchmarkSnapshot`

Single benchmark snapshot: one iteration's pass/tokens for with_skill + baseline.

### `interface FixBenchmarks`

Paired benchmarks used by the fix UI to compare real vs temp skill performance.

### `interface SkillAgentTempFileEntry`

File entry inside a fix/create run's temp workdir. Shown in the UI so the user can preview what will be written before clicking "Sync to skill" / "Create skill".

### `type SkillAgentTempFileContent`

Union value returned by `skillAgent:readTempFile` — text blob, image data URL, binary (size only), or missing.

### `interface AuditHistoryEntry`

Historical audit report entry listed by `audit:listHistory`.

## Dashboard stats

### `interface ProjectStats`

Per-project stats tile: total sessions, messages, tool frequency, top skills.

### `interface GlobalStats`

Aggregate stats across every tracked project, used for the Home dashboard.

### `interface SkillRecommendation`

Recommendation surfaced by the proposal engine: missing skill, friction point, or optimization.

### `interface ScanProgress`

Progress event broadcast on `project:scanProgress` while the scanner walks provider dirs.
