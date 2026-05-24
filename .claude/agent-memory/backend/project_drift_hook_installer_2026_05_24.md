---
name: project_drift_hook_installer_2026_05_24
description: Drift hook installer wired 2026-05-24 — Stop + UserPromptSubmit hooks as a managed pair in ~/.claude/settings.json
metadata:
  type: project
---

Drift hook installer shipped 2026-05-24 (étape finale drift detection). Mirrors `conversation-ingest/hook-installer.ts` at ~95%.

**New files:**
- `services/drift/hook-script.ts` — 2 CJS source constants (`HOOK_STOP_SCRIPT_SOURCE`, `HOOK_USER_PROMPT_SUBMIT_SCRIPT_SOURCE`). Use `node:http` instead of `fetch` for Node 18+ compat.
- `services/drift/hook-paths.ts` — path resolver (`getDriftHookDir`, `getDriftStopHookScriptPath`, `getDriftUserPromptSubmitHookScriptPath`, `getDriftStopHookCommandString`, `getDriftUserPromptSubmitHookCommandString`, `getClaudeGlobalSettingsPath`). Does NOT auto-create dirs.
- `services/drift/hook-installer.ts` — `getDriftHookStatus()`, `buildDriftHookDiff()`, `installDriftHook()`, `uninstallDriftHook()`. All return `DriftHookStatus`.
- `daemon/handlers/drift-hook.ts` — 4 IPC channels `driftHook:status/diff/install/uninstall`.
- `packages/shared/src/types/drift-hook.ts` — `DriftHookStatus`, `DriftHookDiff`.

**Wiring:** `ipc-channels.ts` += 4 `driftHook:*` channels. `handlers/index.ts` += `driftHookHandlers`. `server.ts` += 4 REST routes under `/api/drift-hook/` (GET status, GET diff, POST install, POST uninstall). `nakiros-client.ts` += 4 methods. `global.d.ts` += 4 type declarations.

**KEY DIFFERENCES vs conversation-ingest:**
- 2 hooks (Stop + UserPromptSubmit) managed together as a unit, not 1.
- `withDriftHookForEvent(parsed, eventKey, cmdString)` helper takes eventKey as param — reused for both events.
- `installDriftHook()` returns `DriftHookStatus` (not void like ingest's `installHook()`).
- `installed === true` requires BOTH hooks in settings.json AND both .cjs scripts on disk.
- UserPromptSubmit key auto-deleted from settings.json when empty on uninstall.

**REST routes work because** they are registered before `fastify-static` in `server.ts`. The SPA fallback only catches routes that aren't registered — these are.

**Idempotence verified:** install 2x → exactly 1 drift entry per event key. ingest Stop hook preserved through install+uninstall cycles.

Why: [[project_drift_integrated_in_analysis_2026_05_24]] — final UI-facing step to let users toggle drift hooks from Settings panel.
