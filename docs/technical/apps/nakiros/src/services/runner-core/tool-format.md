# tool-format.ts

**Path:** `apps/nakiros/src/services/runner-core/tool-format.ts`

Shared tool-invocation formatter used by every runner so the UI's tool labels look identical regardless of domain (audit "$ rm -rf" vs eval "$ rm -rf" both render the same).

## Exports

### `function formatTool`

Format a claude CLI tool invocation into a short human-readable label. Handles `Read`, `Write`, `Edit`, `MultiEdit`, `Bash`, `Glob`, `Grep`; falls back to the raw tool name for anything else.

```ts
export function formatTool(name: string, input: Record<string, unknown>): string
```
