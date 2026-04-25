# types/

**Path:** `packages/shared/src/types/`

Shared TypeScript types consumed by the daemon, the frontend, and the landing. Every IPC contract, persisted record shape, and analysis result lives here so the two sides of the wire cannot drift out of sync.

## Files

- [artifact-review.ts](./artifact-review.md) — Types for the artifact-review flow (agent-proposed doc/backlog edits with diff/yolo modes).
- [bundled-skill-conflict.ts](./bundled-skill-conflict.md) — Conflict descriptors between the bundled Nakiros skill ROM and a user's locally-edited copy.
- [collab.ts](./collab.md) — Multi-agent collaboration thread primitives: `CollabMessage` and `CollabSession`.
- [conversation.ts](./conversation.md) — Chat-scope and conversation-state primitives: participants, stored conversations and tabs, agent run requests.
- [electron.ts](./electron.md) — Skill-command installer status + request types driving the `agents:*` IPC channels (not Electron-specific).
- [eval-comparison.ts](./eval-comparison.md) — Types for the A/B/C eval comparison view across Haiku / Sonnet / Opus for a single skill snapshot.
- [eval-matrix.ts](./eval-matrix.md) — Aggregated view of a skill's eval history (iterations × evals grid) with behaviour tags.
- [file-change-review.ts](./file-change-review.md) — Types used by the file-changes review UI (before/after content, approval session).
- [getting-started.ts](./getting-started.md) — Onboarding checklist state and the launch payload for pre-configured chat tabs.
- [installer.ts](./installer.md) — Persisted workspace record types stored under `~/.nakiros/`.
- [preferences.ts](./preferences.md) — App-level preference types (theme, language, agent provider) plus the default MCP daemon URL.
- [project.ts](./project.md) — Core shared types: project scanning, conversation analysis, skills, eval suite/run, audit run, fix benchmarks, dashboard stats.
- [server.ts](./server.md) — Ambient-context types (`RepoContext`, `WorkspaceContext`) populated by the context-generation workflow.
- [skill-diff.ts](./skill-diff.md) — Shapes for reviewing the diff between a skill's on-disk state and an in-progress fix/create edit.
- [version-info.ts](./version-info.md) — Shape returned by `meta:getVersionInfo` — drives the "update available" banner.
- [workspace-settings.ts](./workspace-settings.md) — Per-workspace configuration sub-types: MCP entries and ambient doc references.
- [workspace.ts](./workspace.md) — Workspace configuration primitives: agent profile enum, repo/workspace config shapes, canonical YAML schema.
