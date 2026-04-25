# bundled-skills-sync.ts

**Path:** `apps/nakiros/src/services/bundled-skills-sync.ts`

Three-way sync between the Nakiros bundled-skills ROM, the user's live copies at `~/.nakiros/skills/`, and the `~/.claude/skills/` symlinks Claude Code uses for discovery. Runs at daemon boot (`bootstrapDaemonRuntime`) and after every ROM update.

**Sync manifest** (`~/.nakiros/skills/.sync-manifest.json`) tracks the ROM hashes at the moment of the last agreed sync. Drift on either side is then unambiguous:
- `live ≠ manifest.fileHashes` — user has local modifications
- `rom ≠ manifest.romHash` — Nakiros has shipped an update
- both ≠ → a conflict surfaces for the user to resolve

User-owned directories (`audits/`, `evals/workspace/`, `outputs/`) are never touched regardless of the path taken — ROM hashing excludes them, conflict resolution skips them, promotion excludes them.

## Exports

### `function syncBundledSkills`

Sync bundled skills ROM → `~/.nakiros/skills/`. Case-split per skill: first-time seed, legacy seed without manifest, user untouched + ROM changed (auto-apply), user modified + ROM changed (surface as conflict). Returns the list of skill names available after sync.

```ts
export function syncBundledSkills(): string[]
```

### `function listBundledSkillConflicts`

Return the cached list of conflicts detected during the last `syncBundledSkills` pass.

```ts
export function listBundledSkillConflicts(): BundledSkillConflict[]
```

### `function readBundledSkillConflictDiff`

Produce a per-file diff payload for the conflict UI (ROM vs live content). Refuses user-owned paths and any path containing `..`.

```ts
export function readBundledSkillConflictDiff(skillName: string, relativePath: string): BundledSkillConflictFileDiff
```

**Throws:** `Error` — when `relativePath` is user-owned or contains `..`.

### `function resolveBundledSkillConflict`

Apply the user-chosen resolution:
- `apply-rom` — overwrite live with the ROM (user edits lost)
- `keep-mine` — record ROM as new baseline, keep live (next ROM update will re-surface)
- `promote-mine` — copy live BACK into the ROM (dev only — read-only in production)

```ts
export function resolveBundledSkillConflict(skillName: string, resolution: BundledSkillConflictResolution): void
```

**Throws:** `Error` — when ROM/live missing, or `promote-mine` on read-only ROM.

### `function getNakirosSkillsDir`

Absolute path to `~/.nakiros/skills/` — the live, editable Nakiros-owned skill location.

```ts
export function getNakirosSkillsDir(): string
```

### `function getBundledSkillsDir`

Absolute path to the bundled-skills ROM (source in dev, packaged assets in prod).

```ts
export function getBundledSkillsDir(): string
```

### `function promoteBundledSkill`

Copy a skill from `~/.nakiros/skills/` back into the ROM. Dev-only.

```ts
export function promoteBundledSkill(skillName: string): string
```

### `function removeClaudeSkillLink`

Remove the symlink `~/.claude/skills/<skillName>` if it exists.

```ts
export function removeClaudeSkillLink(skillName: string): void
```
