---
name: shared package dist stale shadow
description: When editing packages/shared/src/types/, the stale dist/ can shadow source changes during tsc --noEmit runs
type: feedback
---

Even though `apps/nakiros/tsconfig.json` maps `@nakiros/shared` to `../shared/src/index.ts`, a stale `packages/shared/dist/index.d.ts` can interfere with type resolution under `moduleResolution: Bundler`.

**Why:** Experienced this 2026-05-04 when removing `ClaudeMdScope` — tsc kept reporting the old interface shape despite source changes being applied correctly.

**How to apply:** After any change to `packages/shared/src/types/`, run `pnpm -F @nakiros/shared build` before running `tsc --noEmit` on nakiros or frontend. This regenerates the dist and eliminates the stale shadow.
