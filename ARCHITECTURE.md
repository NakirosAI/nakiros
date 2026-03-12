# Desktop App - Architecture & Conventions (Reference)

## Purpose
This document is the long-term memory for `apps/desktop`.
Use it as the single reference during future vibe-coding sessions.

## Stack
- Electron + `electron-vite`
- React 19 + TypeScript strict
- Tailwind CSS v4 + CSS variables
- i18next + react-i18next
- Shared contracts/types in `@nakiros/shared`

## High-Level Architecture

### 1) Electron Main Process
- File: `electron/main.ts`
- Owns native capabilities and business services:
  - filesystem, shell, clipboard, dialogs
  - git bootstrap/sync
  - ticket/epic storage
  - agent runner + terminal
  - Jira OAuth/sync
  - docs scan/read
  - onboarding/install
  - update checks/apply
  - preferences persistence
- Registers IPC handlers with `ipcMain.handle(...)`.

### 2) Electron Preload Bridge
- File: `electron/preload.ts`
- Exposes a typed API via `window.nakiros`.
- No business logic here; bridge only:
  - `ipcRenderer.invoke(...)`
  - event subscriptions + unsubscribe cleanup.

### 3) Renderer (React)
- Entry: `src/main.tsx`, root orchestration: `src/App.tsx`.
- Views in `src/views/`.
- Feature components in `src/components/`.
- Shared UI kit in `src/components/ui/`.
- State split:
  - app/workspace orchestration in `App.tsx`
  - shared context for preferences/workspace
  - feature hooks (tickets, forms, debounce, IPC listener).

### 4) Shared Package
- `packages/shared/src/types/*` for cross-process types.
- `packages/shared/src/ipc-channels.ts` for IPC channel constants.

## Source Tree (Important Areas)

### Desktop app
- `apps/desktop/electron/`
  - `main.ts`
  - `preload.ts`
  - `services/*.ts` (domain services)
- `apps/desktop/src/`
  - `views/` page-level screens
  - `components/` feature UI
  - `components/ui/` reusable primitives
  - `components/settings/` split sections for project settings
  - `components/ticket/` split tabs for ticket detail
  - `components/context/` split display parts for context panel
  - `components/dashboard/DashboardRouter.tsx` tab routing layer
  - `hooks/` custom hooks
  - `constants/` central UI/app constants
  - `utils/` reusable pure utilities
  - `i18n/` i18next setup + namespaces
  - `global.d.ts` typed `window.nakiros` contract

### Shared package
- `packages/shared/src/index.ts` exports shared public API
- `packages/shared/src/ipc-channels.ts` source of truth for channel names

## Current State Management Model

### Global state (kept intentionally small)
- `usePreferences` context (`src/hooks/usePreferences.tsx`)
- `useWorkspace` context (`src/hooks/useWorkspace.tsx`)

### Feature state
- `useTickets(workspaceId)` for tickets/epics lifecycle
- local component state for per-screen interactions
- `useIpcListener` for typed/clean event subscriptions

### Decision on Zustand
- Evaluated and intentionally not adopted (for now).
- Rationale:
  - global state scope is limited
  - context usage is still readable and controlled
  - no strong pain point requiring store migration.

## Renderer Composition (Post-Refactor)

### App shell
- `App.tsx`:
  - bootstraps workspaces/preferences/server status
  - controls top-level view state (`home`, `setup`, `dashboard`, etc.)
  - hosts `PreferencesProvider` + `WorkspaceProvider`.

### Dashboard
- `views/Dashboard.tsx`:
  - shell/header/sidebar orchestration
  - delegates page body routing to `DashboardRouter`.
- `components/dashboard/DashboardRouter.tsx`:
  - routes tab content (`overview`, `product`, `delivery`, `chat`, `settings`).

### Project settings
- `components/ProjectSettings.tsx` is orchestration only.
- Sections in `components/settings/`:
  - `SettingsGeneral`
  - `SettingsGit`
  - `SettingsPM`
  - `SettingsMCP`
  - `SettingsDanger` (wired through section usage where needed).

### Ticket detail
- `components/TicketDetail.tsx` is shell/state coordinator.
- Tab components in `components/ticket/`:
  - `TicketTabDefinition`
  - `TicketTabContext`
  - `TicketTabExecution`
  - `TicketTabArtifacts`.

### Context panel
- `components/ContextPanel.tsx` focuses on scan/preview orchestration.
- Display parts extracted to `components/context/ContextPanelParts.tsx`.

### Global settings
- `components/GlobalSettings.tsx` uses section helpers from
  `components/settings/GlobalSettingsSections.tsx`.

## IPC Contract Rules

### Single source of truth
- Always use `IPC_CHANNELS[...]` from `@nakiros/shared`.
- Do not introduce string channel literals in `main.ts` or `preload.ts`.

### Type alignment rule
- Any API change must stay aligned across:
  1. `electron/main.ts` handlers
  2. `electron/preload.ts` bridge signatures
  3. `src/global.d.ts` `window.nakiros` contract
  4. shared types in `@nakiros/shared` when cross-process payloads exist.

### Unknown/any policy
- No new `any`.
- `unknown` only when truly unavoidable and explicitly narrowed.

## UI & Styling Conventions

### Tailwind-first
- Use Tailwind utility classes for UI.
- Avoid inline `style={{...}}` unless strictly required and documented.

### Design tokens
- Tokens live in `src/styles.css` as CSS variables.
- Tailwind mapping lives in `tailwind.config.ts`.

### Reusable UI primitives first
- Before creating new UI pieces, check `src/components/ui/`:
  - `Button`, `Input`, `Select`, `Textarea`, `Modal`, `Card`, `Badge`, `EmptyState`, `FormField`.

### Theme policy
- Desktop is currently dark-first in practice (runtime forced to dark in app flow).
- Keep behavior consistent unless a dedicated theme project is reopened.

## i18n Conventions
- Always use `useTranslation('<namespace>')`.
- Never use `isFr` checks or hardcoded FR/EN ternaries in JSX.
- Keep translation keys in:
  - `src/i18n/locales/fr/*.json`
  - `src/i18n/locales/en/*.json`
- Namespaces currently used:
  - `common`, `home`, `dashboard`, `sidebar`, `board`, `settings`,
    `onboarding`, `toast`, `feedback`, `context`, `overview`, `ticket`, `agent`.

## Constants & Utilities
- Centralize hardcoded UI values:
  - `src/constants/layout.ts`
  - `src/constants/zIndex.ts`
  - `src/constants/agents.ts`
- Reusable helpers:
  - `src/utils/dates.ts`
  - `src/utils/strings.ts`
  - `src/utils/ids.ts`
  - `src/utils/language.ts`
  - `src/utils/workflow-capabilities.ts`
  - `src/utils/profiles.ts`

## Guardrails for Future Sessions

### Do not edit generated output
- Never manually edit `apps/desktop/dist-electron/*`.

### Keep components focused
- Favor orchestrator + subcomponents for complex screens.
- Keep responsibilities narrow and files reasonably small.

### Prefer extension over duplication
- Reuse existing hooks, constants, and UI primitives first.
- If duplicate logic appears in 2 places, extract.

### Keep IPC stable
- Add/rename channels in shared first.
- Then propagate to main/preload/global typing.

## New Feature Checklist
1. Define payload types in `@nakiros/shared` if cross-process.
2. Add/extend `IPC_CHANNELS` if a new channel is needed.
3. Implement handler in `electron/main.ts`.
4. Expose bridge method/listener in `electron/preload.ts`.
5. Update `src/global.d.ts`.
6. Use/update hooks in renderer (`useIpcListener`, contexts, feature hooks).
7. Add i18n keys in FR/EN namespaces.
8. Use UI kit + constants (no ad-hoc styling duplication).
9. Validate with `pnpm tsc --noEmit` and `pnpm dev`.

## Session Start Checklist (Vibe Coding)
1. Read this file (`ARCHITECTURE.md`) first.
2. Identify affected layer(s): renderer, preload, main, shared.
3. Confirm existing reusable components/hooks/constants before coding.
4. If touching IPC, update all 4 contract layers (shared/main/preload/global).
5. Keep changes incremental and composable (orchestrator + leaf components).
6. Run strict typing before closing a session.

