# eval-artifact-cleanup.ts

**Path:** `apps/nakiros/src/services/eval-artifact-cleanup.ts`

Boot-time + post-run cleanup of stray eval-produced skills under `~/.claude/skills/` and `~/.nakiros/skills/`. Eval prompts force agents to name generated skills with the `nakiros-eval-` prefix so this sweep can safely reclaim them. Symlinks and project-local skills are never touched.

## Exports

### `function cleanupEvalArtifacts`

Remove all skill directories whose name starts with `nakiros-eval-` from the user's global skill locations. Called after an eval run and at app boot. Returns the list of removed paths (for logging).

```ts
export function cleanupEvalArtifacts(): string[]
```
