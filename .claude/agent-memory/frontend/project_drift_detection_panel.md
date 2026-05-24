---
name: project_drift_detection_panel
description: DriftDetectionPanel settings panel — toggle install/uninstall drift hooks with diff preview modal
metadata:
  type: project
---

`DriftDetectionPanel` in `apps/frontend/src/views/DriftDetectionPanel.tsx` mirrors `ConversationIngestPanel` at ~95%.

**Pattern:**
- Calls `getDriftHookStatus()` on mount to derive `installed` boolean
- "Enable…" button → `getDriftHookDiff()` → opens `DriftDiffModal` (inline, not `ConfirmModal`) showing current/next JSON + script paths
- Confirm in modal → `installDriftHook()` → updates status in state
- "Disable" button → `uninstallDriftHook()` → updates status in state
- When installed, shows a `PathsSection` with `scriptPaths.stop`, `scriptPaths.userPromptSubmit`, `settingsPath` using `break-all` (no truncation)
- No progress events (status polled at mount only, unlike ConversationIngestPanel which has live onConversationIngestProgress)

**i18n:** namespace `drift-detection` — registered in `i18n/index.ts` (both EN + FR bundles)

**Integration:** added as `<DriftDetectionPanel />` directly below `<ConversationIngestPanel />` in `SettingsScreen.tsx`

**Why inline DiffModal instead of ConfirmModal:** diff preview needs a two-column before/after pane + 3 field rows — not a fit for ConfirmModal's text-only body prop. Same pattern as `ConversationIngestPanel`'s own `DiffModal`.
