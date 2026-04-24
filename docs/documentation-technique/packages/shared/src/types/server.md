# server.ts

**Path:** `packages/shared/src/types/server.ts`

Ambient-context types populated by the context-generation workflow and consumed by agents when answering workspace-scoped prompts.

## Exports

### `interface RepoContext`

Ambient context captured for a single repo (architecture, stack, conventions, API, LLM docs).

```ts
export interface RepoContext {
  architecture?: string;
  stack?: string;
  conventions?: string;
  api?: string;
  llms?: string;
  updatedAt?: string;
  updatedBy?: string;
}
```

### `interface WorkspaceContext`

Ambient context for a whole workspace: shared fields at the top level plus per-repo subcontexts in `repos`.

```ts
export interface WorkspaceContext {
  architecture?: string;
  conventions?: string;
  entryPoints?: Record<string, string>;
  openQuestions?: string[];
  generatedAt?: string;
  updatedBy?: string;
  global?: string;
  product?: string;
  interRepo?: string;
  brainstorming?: string;
  repos?: Record<string, RepoContext>;
}
```
