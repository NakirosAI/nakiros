---
name: project_cowork_provider_wired_2026_05_07
description: Cowork provider wired as second project source alongside Claude Code — scanner, ingest, handler routing
type: project
---

`cowork` provider wired 2026-05-07. `ProviderType` += `'cowork'`.

**Why:** Cowork (Anthropic local-agent-mode) stores sessions separately from Claude Code under `~/Library/Application Support/Claude/local-agent-mode-sessions/<spaceId>/<userId>/`. One space = one Nakiros project.

**Key files:**
- `services/providers/cowork-scanner.ts` (new) — scans spaces.json, matches groups via `userSelectedFolders`, id = `cowork:<spaceId>`, `skillCount: 0`
- `services/project-scanner.ts` — `scan()` signature changed: `onProgress` now receives `(provider: ProviderType, current, total, name)` (was just `(current, total, name)`)
- `daemon/handlers/projects.ts` — `project:scan` handler passes `provider` to broadcast. `ensureIndexed(project)` helper routes to `ensureCoworkProjectIndexed` for `provider === 'cowork'`, else `ensureProjectIndexed`
- `services/conversation-ingest/runner.ts` — `ingestSession` has new optional 4th arg `forcedProjectPath` that overrides `rawMeta.cwd || cwdHint`. New export `ensureCoworkProjectIndexed(userDir, projectPath)` walks matched groups and ingest with the forced path so sessions key under the real space folder, not the Cowork sandbox `<local_uuid>/outputs` path
- `services/conversation-ingest/index.ts` — re-exports `ensureCoworkProjectIndexed`

**Audit/fix/eval:** All runners work purely via `projectPath` which for Cowork = `space.folders[0].path` (a normal user directory). No provider filtering in runners — nothing to change.

**How to apply:** When extending to a new Cowork feature, always use `ensureCoworkProjectIndexed` for ingest and use `forcedProjectPath` in `ingestSession` whenever the JSONL `cwd` differs from the real project path.
