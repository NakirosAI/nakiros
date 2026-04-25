# services/

**Path:** `apps/nakiros/src/services/`

Service layer behind the Nakiros daemon. Each run kind (eval / audit / fix / create / comparison) lives here as a `*-runner.ts`, plus the supporting readers / parsers / analyzers that feed them. Shared runner primitives (sandboxing, claude CLI driver, event log) live in `runner-core/`.

## Subfolders

- [runner-core/](./runner-core/README.md) — Domain-agnostic runner primitives: claude-CLI driver, sandboxing, isolated HOME, run-store, event log.
- [providers/](./providers/README.md) — Per-agent project scanners (Claude, eventually Cursor / Codex / Gemini).

## Runners

- [audit-runner.ts](./audit-runner.md) — Static-review run driving `/nakiros-skill-factory audit`. Archives the report under `{skill}/audits/`.
- [eval-runner.ts](./eval-runner.md) — Eval batch runner: parse `evals.json`, sandbox per run, spawn claude, grade assertions, write `grading.json` / `timing.json` / `diff.patch` / `run.json` / `benchmark.json`.
- [fix-runner.ts](./fix-runner.md) — Shared fix + create flow with temp workdir isolation. The tmp_skill pattern is load-bearing (eval-against-candidate before sync-back).
- [comparison-runner.ts](./comparison-runner.md) — A/B/C eval comparison across Haiku / Sonnet / Opus with fingerprint-aware artefact reuse.

## Readers (skill scopes)

- [bundled-skills-reader.ts](./bundled-skills-reader.md) — CRUD on Nakiros bundled skills (`~/.nakiros/skills/`).
- [bundled-skills-sync.ts](./bundled-skills-sync.md) — Three-way ROM / live / manifest sync with conflict resolution (`apply-rom` / `keep-mine` / `promote-mine`).
- [claude-global-skills-reader.ts](./claude-global-skills-reader.md) — CRUD on user-global skills (`~/.claude/skills/`), excluding Nakiros symlinks.
- [plugin-skills-reader.ts](./plugin-skills-reader.md) — CRUD on plugin-provided skills (`~/.claude/plugins/marketplaces/…`).
- [skill-reader.ts](./skill-reader.md) — CRUD on project-scoped skills (`<project>/.claude/skills/`).
- [skill-fingerprint.ts](./skill-fingerprint.md) — Deterministic content hash of a skill directory (used by the matrix and the comparison reuse logic).

## Parsers / analyzers

- [eval-parser.ts](./eval-parser.md) — Read `evals.json` + historical iterations into the full `SkillEvalSuite`.
- [eval-matrix.ts](./eval-matrix.md) — Build the Evolution matrix with fingerprint-aware behaviour tags.
- [eval-benchmark.ts](./eval-benchmark.md) — Write / read per-iteration `benchmark.json`.
- [eval-feedback.ts](./eval-feedback.md) — Read / write per-iteration human feedback.
- [eval-llm-grader.ts](./eval-llm-grader.md) — Batched LLM grader for `type: 'llm'` assertions (pinned to Sonnet).
- [eval-artifact-cleanup.ts](./eval-artifact-cleanup.md) — Sweep stray `nakiros-eval-*` skills from global dirs.
- [conversation-parser.ts](./conversation-parser.md) — Parse Claude Code JSONL into metadata + messages.
- [conversation-analyzer.ts](./conversation-analyzer.md) — Deterministic health analysis (score, tips, friction, cache waste).
- [conversation-deep-analyzer.ts](./conversation-deep-analyzer.md) — LLM-powered narrative report with Haiku/Sonnet routing.

## App-level + identity

- [agent-cli.ts](./agent-cli.md) — Detect `claude` / `codex` / `cursor-agent` binaries and version.
- [agent-installer.ts](./agent-installer.md) — Copy Nakiros command templates globally or per-repo.
- [onboarding-installer.ts](./onboarding-installer.md) — Seed `~/.nakiros/` layout on first run (`config.yaml`, `version.json`).
- [preferences.ts](./preferences.md) — Load/save `AppPreferences`; detect OS language.
- [project-scanner.ts](./project-scanner.md) — Persisted project registry; merges provider scans.
- [version-service.ts](./version-service.md) — Current vs latest-on-npm version info (6h cache).
