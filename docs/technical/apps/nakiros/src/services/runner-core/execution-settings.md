# execution-settings.ts

**Path:** `apps/nakiros/src/services/runner-core/execution-settings.ts`

Writes the `.claude/settings.local.json` file that configures what the claude CLI is allowed to do inside a run's workdir. Used by audit / eval so edits are auto-accepted and the tool allow/deny list is enforced without the user having to confirm each action.

## Exports

### `interface ExecutionSettingsOptions`

Options controlling `writeExecutionSettings`.

```ts
export interface ExecutionSettingsOptions {
  /** Block the Skill tool — used by without_skill eval baselines. */
  denySkill?: boolean;
  /** No-op when `.claude/settings.local.json` already exists. Required when
   * the caller may be re-entering the same workdir (eval iterations). */
  skipIfExists?: boolean;
}
```

### `function writeExecutionSettings`

Write `<dir>/.claude/settings.local.json` so the claude CLI running with `cwd=dir` auto-accepts edits and respects the configured allow/deny list. Creates `.claude/` as needed. No-op when settings already exist and `skipIfExists` is set.

The default allow-list is `Read`, `Write`, `Edit`, `Glob`, `Grep`, `Bash`. Setting `denySkill: true` adds `Skill` to the deny-list (used by `without_skill` eval baselines).

```ts
export function writeExecutionSettings(dir: string, options?: ExecutionSettingsOptions): void
```
