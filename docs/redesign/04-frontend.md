# 04 — Frontend Architecture

## Principle

The front is **the same for everyone**: a shared shell + a shared design system.
But each module **ships its own screens**. Installing `@nakirosai/techne` brings
Techne's screens; installing it pulls the shell and the design system as shared
dependencies (deduped if another module already brought them).

If the umbrella package embedded every module's front, you would have to install
the umbrella to get any UI at all — that breaks the self-sufficient
`npm install -g @nakirosai/techne`. So modules own their screens; the shell only
hosts them.

## The three front layers

| Layer | Package | Today's source |
|-------|---------|----------------|
| Shell (chrome, routing, transport, discovery) | `@nakirosai/host` front / shell | `App.tsx`, `components/shell/`, `lib/nakiros-client.ts`, `HomeScreen`, `SettingsScreen`, `StatusBar` |
| Design system (the canonical patterns) | `@nakirosai/ui` | `components/ui/`, `markdown/`, `diff/`, `runs/`, `RunScreen` |
| Module screens | each `@nakirosai/<module>` | see per-module mapping below |

### Module screen mapping (from current `apps/frontend`)

- **Techne** — `SkillsScreen`, `SkillDetailScreen`, `MarketplaceScreen`,
  `BundledSkillConflictsView`, `components/skill/`
- **Hestia** — `ClaudeMdScreen`, `RulesScreen`, `HooksScreen`, `McpScreen`,
  `PermissionsScreen`, `OutputStylesScreen`, `SubagentsScreen` (+ their
  subfolders), `Onboarding`, `CreateEntityModal`
- **Argos** — `DriftDetectionPanel`, `ConversationIngestPanel`, `ScanView`,
  `ProjectOverviewScreen`, `components/conversations/`, `recommendations/`,
  `viz/`

## How the shell mounts module screens

The shell calls `GET /modules`, gets the `ModuleManifest[]`, and renders the nav
from each manifest's `front.routes`. It mounts each module's `front.entry` for
its routes and hides anything not installed.

### v1: build-time composition (recommended)

Each module front is its own package. The shell statically imports the installed
module packages at build; a release is built per installed set. This is the
simplest path and still means "modules ship their own front" at the package
level. Adding a module is a build.

### later: runtime federation (optional)

If we want **third-party** modules to add UI without rebuilding the shell, the
manifest's `front.entry` points to a JS bundle the shell loads at runtime
(Module Federation). The cost is managing shared-dependency versions (React,
Tailwind, `@nakirosai/ui`) across independently built bundles. The manifest is
already shaped for this — switching does not change the contract. We do not build
it in v1.

## UX coherence becomes a component, not a convention

The project rule "new screens must mirror the Skill screen (tabs + audit/fix/
eval lifecycle)" is today a convention enforced by reviewers. Under the shared
design system it becomes **a reusable scaffold in `@nakirosai/ui`**:

- a `LifecycleScreen` scaffold (tab structure, audit → fix → eval flow, layout),
- shared run/diff/markdown viewers,
- shared entity-list and detail primitives.

Every module's screens are built from these primitives, so coherence holds **by
construction**. Diverging means not using the scaffold — visible in review,
instead of a subtle layout drift.

## Transport

The shell owns the single transport to `localhost:4242` (`nakiros-client`):
`POST /ipc/:channel` for calls, `GET /ws` for events. Module front code calls
typed methods derived from the module's namespaced channel map (see doc 03); it
never talks to the network directly.

## i18n

Each module declares an `i18nNamespace` in its manifest and ships its own bundle
under that namespace. The shell merges installed namespaces at runtime. No key
collisions, and a module's translations travel with the module.
