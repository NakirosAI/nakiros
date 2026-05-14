# claude-rules-writer

**Path:** `apps/nakiros/src/services/claude-rules-writer.ts`

Write service for the `.claude/rules/` directory (Module 1 V2). Reads, creates, saves, and deletes rule markdown files with mtime optimistic-lock conflict detection and atomic writes. The lightweight YAML frontmatter emitted carries only the `paths:` field — the standardized Claude Code rule field. Name validation enforces the `[a-z0-9][a-z0-9-]*` pattern.

## Exports

### `readRuleForEditor`

```ts
export function readRuleForEditor(
  projectPath: string,
  name: string,
): RuleFileContent | null
```

Read a single rule for the editor. Returns the decomposed content (paths frontmatter + markdown body) plus the `mtime` to use as the save lock token.

Returns `null` when the name is invalid or the file does not exist.

**Parameters:**
- `projectPath` — Absolute path to the project root.
- `name` — Rule slug matching `[a-z0-9][a-z0-9-]*` (file: `.claude/rules/<name>.md`).

---

### `createRule`

```ts
export function createRule(
  projectPath: string,
  request: CreateRuleRequest,
): RuleMutationResult
```

Create a new rule file. Fails if the name is invalid or already exists.

**Parameters:**
- `projectPath` — Absolute path to the project root.
- `request` — Desired rule name and optional initial `paths` list.

---

### `saveRule`

```ts
export function saveRule(
  projectPath: string,
  request: SaveRuleRequest,
): RuleMutationResult
```

Save an existing rule. Aborts with `code: 'conflict'` if the file's on-disk mtime differs from `mtimeAtRead` — i.e. the file was modified externally between the editor's read and this save. Write is atomic.

**Parameters:**
- `projectPath` — Absolute path to the project root.
- `request` — Updated paths + body + mtime captured at the last read.

---

### `deleteRule`

```ts
export function deleteRule(projectPath: string, name: string): RuleMutationResult
```

Delete a rule file by name. Returns `not-found` if the file is missing, otherwise removes it. No mtime check — the caller has already confirmed via the UI.

**Parameters:**
- `projectPath` — Absolute path to the project root.
- `name` — Rule slug to delete.
