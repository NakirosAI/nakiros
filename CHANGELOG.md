# Changelog

All notable changes to `@nakirosai/nakiros` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.0] — 2026-04-22

Conversation-centric release. Nakiros now analyses your Claude Code
sessions end to end — from a zero-token deterministic scan to an
opt-in LLM narrative diagnosis — and surfaces the patterns across a
whole project.

### Added

- **Conversation health analyzer.** New deterministic pass over each
  Claude Code JSONL session extracts signals from `message.usage`:
  compactions (with pre/post token metadata), per-turn context size,
  friction patterns, cache misses with avoidable-waste estimation,
  tool errors, hot files, sidechains, and slash commands. Produces a
  composite health score (100 = healthy, 0 = critical) and a one-line
  rule-based diagnostic. Zero token cost.
- **Health-first Conversations view.** Sorted list with score chip,
  signal badges, sort/filter controls (critical only, compactions,
  friction, cache waste, tool errors). Replaces the raw message viewer
  as the primary surface — raw messages moved behind a "view raw" link.
- **Diagnostic drawer with context timeline.** Per-conversation
  drawer shows a sparkline of per-turn context tokens over three
  colour-coded zones (healthy / watch / degraded, as a fraction of the
  detected context window — 200k or 1M auto-detected), compaction
  flags, friction markers, top tools with error counts, hot files,
  and a cache-efficiency panel with directly-computed avoidable waste.
- **Actionable tips per conversation.** Rules-based engine emits up to
  five ranked tips per session — split sessions, restate intent after
  a compaction, clear before saturation, enable the 1h extended cache,
  address flaky tools, decompose heavy files, delegate to subagents,
  create a dedicated skill. i18n-friendly via `tips.<id>.title/body`
  keys (FR + EN).
- **Deep (LLM) conversation analysis.** Opt-in narrative diagnosis via
  the new bundled `nakiros-conversation-analyst` skill, routed to
  Haiku 4.5 for sessions ≤ 170k tokens and Sonnet 4.6 (1M context
  natively) for bigger ones. Detects tone-based frustration the regex
  pass can't catch and surfaces context-drift instances with turn
  gaps. Results cached to `~/.nakiros/analyses/{sessionId}.json` so
  re-opens don't re-bill. Live loader animation while running.
- **Cross-conversation Dashboard.** Project landing aggregates the last
  10 / 30 / 90 / all analysed sessions into headline metrics (count,
  avg score, % with compaction, total cache waste), a stacked health
  distribution bar, detected patterns (high compaction rate,
  late-session drift, cache-waste pattern, systemic low health),
  ranked lists of recurring tips / failing tools / hot files, and a
  drill-down to the five most critical conversations.

### Changed

- Modal header now truncates long titles cleanly (shared across the
  codebase for future callers).
- `Insights` tab reduced to a placeholder reserved for future
  LLM-powered cross-conversation recommendations.

## [0.4.2] — 2026-04-20

Internal refactor pass — no user-facing feature changes.

### Fixed

- Audit / Fix / Create actions now correctly propagate `pluginName` and
  `marketplaceName` when resolving a skill's directory, so these actions
  work on skills under the `plugin` scope (previously silently resolved
  to the wrong path).

### Changed

- Consolidated duplicated code across IPC handlers, runner services,
  and frontend views:
  - Extracted `run-helpers.ts` in the daemon (shared event broadcaster,
    run getters, skill-dir resolver) — broadcasters now use `IPC_CHANNELS`
    instead of hardcoded channel strings.
  - Extracted `runner-core` helpers: `isActiveRunStatus`,
    `cleanupRunWorkdir`, `writeExecutionSettings`.
  - Extracted frontend hooks: `useRunState` (polling + buffered event
    replay + live stream) and `useElapsedTimer`, shared by AuditView
    and FixView.
  - Extracted `useSkillActionErrorHandlers` hook + shared `skill-actions`
    i18n namespace (dedups 12 translation keys across 4 views).
  - `TabButton` consolidated into `skills/components`.

## [0.4.1] — 2026-04-20

### Fixed

- Plugin skills now read from the correct
  `marketplaces/<marketplace>/plugins/<plugin>/skills/` path.
- Added org drill-down UI in the plugin skills view.

## [0.4.0] — 2026-04-20

### Added

- **Claude Code plugin scope.** Nakiros now surfaces skills installed via
  Claude Code plugins under `~/.claude/plugins/`, with audit/fix actions
  scoped to their own audits tab.
- Unified status pills across eval / audit / fix runners.
- Thinking indicator and streamlined chat UX while an agent is active.

## [0.3.0] — 2026-04-19

### Added

- **Eval evolution matrix.** A grid view that tracks a skill's pass-rate,
  tokens, and duration iteration after iteration, with full baseline
  isolation (the `without_skill` baseline can no longer leak the skill's
  files into the sandbox).

## [0.2.0] — 2026-04-19

### Added

- Version indicator in the UI, polling the npm registry for the latest
  published release.
- Bundled-skill conflict detection with a git-style diff UI to resolve
  drift between the user's local copy and the one shipped with Nakiros.
- i18n pass covering all project views (EN + FR).
- Eval runs are now sandboxed in a detached git worktree; the captured
  diff is persisted as `diff.patch`.
- Revised skill-factory output-language policy and creation steps.

### Changed

- Dropped the GlobalSettings panel in favor of a topbar language
  dropdown.
- Extracted a shared `runner-core` package with resumable runs and
  several UX fixes on audit/fix/eval flows.

## [0.1.0] — 2026-04-18

First stable release. No code changes since `0.1.0-beta.3` — just a
version promotion.

## [0.1.0-beta.3] — 2026-04-18

### Changed

- Renamed the npm package to **`@nakirosai/nakiros`** (scoped under the
  `@nakirosai` org). Prior beta users should `npm uninstall nakiros &&
  npm install -g @nakirosai/nakiros`.

### Fixed

- Removed `workspace:*` dependencies from the published package — the
  package is now self-contained on npm.

### Infrastructure

- npm publish now uses **Trusted Publishing (OIDC)** via GitHub
  Actions — no long-lived `NPM_TOKEN` stored in the repo.
- Landing page deployed on Cloudflare (Workers Assets).

## [0.1.0-beta.2] — 2026-04-18

### Fixed

- CI release workflow now accepts tags both with and without the `v`
  prefix (`v0.1.0-beta.2` and `0.1.0-beta.2` are both valid).

## [0.1.0-beta.1] — 2026-04-18

First public beta. Initial scope:

- Local daemon + browser-based UI for introspecting Claude Code skills.
- Audit, eval, and fix flows powered by the `nakiros-skill-factory`
  skill.
- Landing page, install flow, and architecture documentation.
- `require('fs')` calls replaced with static imports for ESM
  compatibility.

[0.5.0]: https://github.com/NakirosAI/nakiros/compare/v0.4.2...v0.5.0
[0.4.2]: https://github.com/NakirosAI/nakiros/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/NakirosAI/nakiros/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/NakirosAI/nakiros/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/NakirosAI/nakiros/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/NakirosAI/nakiros/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/NakirosAI/nakiros/compare/v0.1.0-beta.3...v0.1.0
[0.1.0-beta.3]: https://github.com/NakirosAI/nakiros/compare/v0.1.0-beta.2...v0.1.0-beta.3
[0.1.0-beta.2]: https://github.com/NakirosAI/nakiros/compare/0.1.0-beta.1...v0.1.0-beta.2
[0.1.0-beta.1]: https://github.com/NakirosAI/nakiros/releases/tag/0.1.0-beta.1
