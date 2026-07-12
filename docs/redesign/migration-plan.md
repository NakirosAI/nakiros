# Migration Plan (detailed, executable)

> Execution plan for the split described in [`07-migration.md`](07-migration.md)
> (read it first for the file-by-module mapping and the 3 hard couplings). This
> document is the **sequenced, PR-by-PR plan**.

## Strategy

- **Strangler, never big-bang.** The monolith keeps working throughout. We
  extract the kernel *under* it, introduce the loader with the monolith as one
  synthetic module, then carve real modules one at a time. The synthetic module
  is removed only in the final phase.
- **One PR per phase (or sub-phase).** Each merges green:
  ```bash
  pnpm -F <pkg> exec tsc --noEmit   # every touched workspace
  turbo build
  ```
- **Rollback = revert the PR.** Because the monolith stays runnable until the
  last phase, any phase can be reverted without breaking users.

## End state

Lean host (`@nakirosai/nakiros`, no bundled modules) + opt-in modules discovered
by manifest, one process on `:4242`, one shared runner. Then **Pinax** is built
greenfield against the finished kernel.

---

## Phase 0 — Workspace prep *(risk: low, no logic moves)*

- Add `modules/*` to `pnpm-workspace.yaml` (alongside `apps/*`, `packages/*`).
- **Unify the npm namespace to `@nakirosai/*`**: rename `@nakiros/shared` →
  `@nakirosai/shared`, `@nakiros/frontend` → `@nakirosai/frontend`. Update all
  imports, `tsconfig` path aliases, `turbo.json` task keys
  (`@nakiros/frontend#build` → `@nakirosai/frontend#build`), and the file
  references in `.claude/rules/ipc-contract.md`.
- Establish `tsconfig` project references skeleton across workspaces.

**Gate:** all workspaces `tsc --noEmit` green, `turbo build` green, app runs
unchanged. Mechanical, wide but safe.

## Phase 1 — Extract the kernel under the monolith *(risk: medium, behaviour unchanged)*

Three sub-PRs; the monolith imports from the new packages after each.

- **1a `@nakirosai/runner`** ← `services/runner-core/*` (16 files: claude-binary,
  claude-stream, run-store, session-jsonl, session-usage, git-worktree,
  isolated-home, run-id, run-status, execution-settings, tmp-sandbox,
  tool-format, cluster-tokens, claude-projects, event-log, index).
- **1b `@nakirosai/ui`** ← `frontend/components/{ui,markdown,diff,runs}`,
  `RunScreen`, plus the extracted **`LifecycleScreen` scaffold** (audit→fix→eval
  tabs). Frontend imports from it.
- **1c `apps/host` skeleton** ← reshape `apps/nakiros`: Fastify server,
  `POST /ipc/:channel` dispatcher, `event-bus`, `port`, `service-manager`
  (launchd/systemd/paths), provider layer (`providers/claude-scanner`,
  `cowork-scanner`), shared read layer (`conversation-parser`,
  `claude-config-reader`, `preferences`, `version-service`). Module handlers stay
  inline here for now (not yet carved).
- **`@nakirosai/shared`**: add the `ModuleManifest` type and `RecoCard.applyModule`
  (prep for phases 2–3).

**Gate** after each sub-PR: green tsc/build, app unchanged.

## Phase 2 — Loader + `ModuleManifest`, monolith as ONE synthetic module *(risk: medium)*

- Implement manifest discovery (scan + `register(host)`) in the host.
- Wrap **all** current handlers as a single synthetic module
  (`nakiros-legacy`) with a manifest, registered **through the loader** instead
  of the static registry.
- Front: add the `GET /modules` endpoint + shell discovery; the synthetic module
  advertises all current routes.

**Gate:** behaviour identical, but everything now flows through the loader.
Proves the plug path before any real carving.

## Phase 3 — Cut coupling #2: the recommendation bridge *(risk: HIGH — do it on one codebase)*

- Move `RecoCard` fully into `@nakirosai/shared`; finalise `applyModule`
  (`skill → techne`, everything else → `hestia`).
- Route `recommendations:applyReco` through the host by `applyModule`.
- Add `provides`/`consumes` capability matching in the loader.
- Producer and consumer are still inside the synthetic module, but now
  communicate via the **contract + host routing**, not direct calls.

**Gate:** recommendations work end-to-end, now decoupled. This is the riskiest
phase — keep it isolated and well-tested while there is still one codebase.

## Phase 4 — Carve modules one at a time *(risk: medium, iterative)*

Order: **Hestia → Techne → Argos** (Hestia = cleanest boundary, validates the
recipe; Argos last, after the bridge is cut, since it is the producer).

For each module:

1. Create `modules/<name>` package; move its services + handlers + front screens
   + bundled skills (per [`07-migration.md`](07-migration.md) mapping).
2. Write its `ModuleManifest` (backend `register`, `ipcNamespace`, front routes,
   skills, `provides`/`consumes`); declare kernel packages as **`peerDependencies`**.
3. Migrate its channels to `<ns>:*` in its own channel map, re-exported from
   `@nakirosai/shared` (no hardcoded channel strings — ipc-contract rule).
4. Remove those handlers/screens from the synthetic module.

**Gate per module:** loads standalone **and** alongside others on `:4242`;
green tsc/build.

## Phase 5 — Generalise the lifecycle runner (coupling #1) *(risk: medium)*

- Extract `audit-runner` + `fix-runner` into a **generic lifecycle runner** in
  the kernel, parameterised per module.
- Done incrementally as modules are carved (Hestia and Techne both need it).

**Gate:** audit/fix/eval flows unchanged for every carved module.

## Phase 6 — Cleanup & lean-host finalisation *(risk: low)*

- Remove the now-empty `nakiros-legacy` synthetic module.
- `@nakirosai/nakiros` becomes the **lean host** (no bundled modules); modules
  publish as separate `@nakirosai/*` packages.
- Ship the first-run **module catalog** in the shell.
- Finalise per-module IPC contracts; rewrite `.claude/rules/ipc-contract.md` to
  the per-module form (doc 03).

**Gate:** fresh `npm install -g @nakirosai/nakiros` = lean host + catalog;
installing a module lights it up with no second service/port/runner.

---

## Then: Pinax

Built greenfield as a module against the finished kernel — its own design
session.

## Risk register

| Phase | Risk | Mitigation |
|-------|------|------------|
| 0 | wide rename, many files | mechanical; rely on tsc to catch every miss |
| 1c | host reshape | keep handlers inline; no logic change, only relocation |
| 3 | recommendation bridge | isolate, test end-to-end on the single codebase |
| 4 | per-module carve | one module per PR; synthetic module keeps the rest working |

## Validation (every PR)

```bash
pnpm -F @nakirosai/host exec tsc --noEmit
pnpm -F @nakirosai/<touched> exec tsc --noEmit
turbo build
```
