# tmp-sandbox.ts

**Path:** `apps/nakiros/src/services/runner-core/tmp-sandbox.ts`

Fallback sandbox for skills that don't live inside a git repo (bundled, globally-installed, or any skill under `~/.nakiros/skills/`). The worktree mode in `git-worktree.ts` can't apply — no repo to branch from — and we don't want to run the agent in-place inside the real skill directory (Claude would walk up, read the real SKILL.md, see past iterations in `evals/workspace/`, and write into the real skill path).

Layout written:

```
<sandbox>/
└── .claude/
    └── skills/
        └── <skillName>/        ← copied from real skill, MINUS evals/workspace/
```

The `.claude/skills/` layout is the convention Claude Code uses to discover project-scoped skills, so invoking `/skillName` from inside `<sandbox>/` loads the copy, not the real one. For `without_skill` baselines the copy is skipped entirely — the agent sees an empty sandbox with no skill at all.

Sandboxes live under `~/.nakiros/sandboxes/` (same root as worktrees) so cleanup stays centralised.

## Exports

### `interface CreateTmpSandboxArgs`

Arguments for `createTmpSandbox`.

```ts
export interface CreateTmpSandboxArgs {
  runId: string;
  skillDir: string;
  skillName: string;
  includeSkill: boolean;
}
```

### `interface CreateTmpSandboxResult`

Return value of `createTmpSandbox` — path to the fresh sandbox.

```ts
export interface CreateTmpSandboxResult {
  path: string;
}
```

### `function createTmpSandbox`

Create a throwaway sandbox directory. Always starts from a clean slate (force-removes any existing directory at the target path). When `includeSkill` is false the sandbox stays empty — matches the `without_skill` baseline config.

```ts
export function createTmpSandbox(args: CreateTmpSandboxArgs): CreateTmpSandboxResult
```

### `function destroyTmpSandbox`

Remove a sandbox created by `createTmpSandbox`. Best-effort.

```ts
export function destroyTmpSandbox(sandboxPath: string): void
```
