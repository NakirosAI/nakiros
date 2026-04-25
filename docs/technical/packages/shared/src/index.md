# index.ts

**Path:** `packages/shared/src/index.ts`

Barrel entry point for `@nakiros/shared`. Re-exports every type, constant, and IPC channel declared under `types/`, `constants/`, and the top-level `ipc-channels.ts`. This is the only module the daemon + frontend import from — no deep imports into `@nakiros/shared/types/...` are allowed.

## Re-exports

- `types/project` — see [types/project.md](./types/project.md)
- `types/workspace` — see [types/workspace.md](./types/workspace.md)
- `types/server` — see [types/server.md](./types/server.md)
- `types/electron` — see [types/electron.md](./types/electron.md)
- `types/preferences` — see [types/preferences.md](./types/preferences.md)
- `types/installer` — see [types/installer.md](./types/installer.md)
- `types/workspace-settings` — see [types/workspace-settings.md](./types/workspace-settings.md)
- `types/conversation` — see [types/conversation.md](./types/conversation.md)
- `types/collab` — see [types/collab.md](./types/collab.md)
- `types/getting-started` — see [types/getting-started.md](./types/getting-started.md)
- `types/artifact-review` — see [types/artifact-review.md](./types/artifact-review.md)
- `types/file-change-review` — see [types/file-change-review.md](./types/file-change-review.md)
- `types/bundled-skill-conflict` — see [types/bundled-skill-conflict.md](./types/bundled-skill-conflict.md)
- `types/skill-diff` — see [types/skill-diff.md](./types/skill-diff.md)
- `types/version-info` — see [types/version-info.md](./types/version-info.md)
- `types/eval-matrix` — see [types/eval-matrix.md](./types/eval-matrix.md)
- `types/eval-comparison` — see [types/eval-comparison.md](./types/eval-comparison.md)
- `constants/claude-models` — see [constants/claude-models.md](./constants/claude-models.md)
- `ipc-channels` — see [ipc-channels.md](./ipc-channels.md)
