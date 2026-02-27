# Implementation Plan - Workspace Selectionne

## Phase 0 - Documentation
1. Creer le pack docs PRD/Architecture/UX/UI/Plan/QA.
2. Verifier alignement commande PRD Assistant (`/tiq-agent-brainstorming`).

## Phase 1 - Shell + Overview (priorite P1)
### Fichiers
1. `components/Sidebar.tsx`
2. `views/Dashboard.tsx`
3. `components/WorkspaceOverview.tsx` (nouveau)

### Taches
1. Remplacer tabs par `overview|product|delivery|settings`
2. Definir `Overview` comme landing workspace
3. Agreger KPI et `next actions`

### Done criteria
1. Ouverture workspace => onglet Overview
2. CTA next action fonctionnel

## Phase 2 - Delivery + Ticket Hub
### Fichiers
1. `components/KanbanBoard.tsx`
2. `components/TicketDetail.tsx`
3. `packages/shared/src/types/tickets.ts`

### Taches
1. Ajouter filtres board (statut/repo/priorite)
2. Refactor TicketDetail en hub onglets
3. Integrer execution IA `dev-story` dans hub
4. Persister statut dernier run ticket

### Done criteria
1. Execution ticket IA possible sans changer de section
2. Etat run visible sur ticket

## Phase 3 - Product Context + PRD Assistant
### Fichiers
1. `components/ContextPanel.tsx`
2. `components/PrdAssistant.tsx` (nouveau)

### Taches
1. Transformer ContextPanel en studio contexte
2. Ajouter action PRD Assistant
3. Lancer `/tiq-agent-brainstorming` avec prompt structure
4. Re-scan docs a la fin

### Done criteria
1. Brainstorming lance depuis Product Context
2. `.tiqora/context/brainstorming.md` visible apres run

## Phase 4 - Workflow availability
### Fichiers
1. `utils/workflow-capabilities.ts` (nouveau)
2. `components/ProjectSettings.tsx`
3. `i18n.ts`

### Taches
1. Ajouter matrice workflows stable/beta
2. Afficher fallback messages pour beta

### Done criteria
1. Bloc visible en settings general
2. Badges + fallback affiches

## Phase 5 - Stabilisation
1. Relecture microcopies
2. QA manuelle complete
3. Build desktop
4. Verification non-regression

## Ordre d'execution recommande
1. Navigation + Overview
2. Delivery + Ticket Hub
3. Product + PRD Assistant
4. Workflow availability
5. QA + polish

## Notes techniques
1. Reuse APIs preload existantes, pas de nouvelle IPC V1.
2. Types ticket etendus de maniere backward-compatible.
3. Workflows beta exposes avec signal explicite.
