# onboarding.ts

**Path:** `apps/nakiros/src/daemon/handlers/onboarding.ts`

Registers the `onboarding:*` IPC channels used by the Onboarding view to detect editors and run the Nakiros install.

## IPC channels

- `onboarding:detectEditors` — scans the user's machine for Claude / Cursor / Codex installs
- `onboarding:nakirosConfigExists` — tells the UI whether onboarding has already run
- `onboarding:install` — runs the Nakiros install for a list of selected editors

## Exports

### `const onboardingHandlers`

```ts
export const onboardingHandlers: HandlerRegistry
```
