# Architecture - Refonte UX Workspace Selectionne

## Cartographie existante
Composants principaux deja en place:
1. `views/Dashboard.tsx`
2. `components/Sidebar.tsx`
3. `components/KanbanBoard.tsx`
4. `components/TicketDetail.tsx`
5. `components/ContextPanel.tsx`
6. `components/AgentPanel.tsx`

## Nouvelle structure UI
Navigation unique:
1. `overview`
2. `product`
3. `delivery`
4. `settings`

## Flux de donnees
### Dashboard
`Dashboard.tsx` devient orchestrateur de l'etat workspace:
1. Tickets + epics (storage local)
2. Scan docs (doc scanner)
3. Conversations IA (conversation store)
4. Statut MCP

### Overview
Nouveau composant `WorkspaceOverview.tsx` avec:
1. KPI project health
2. Next actions contextuelles
3. AI activity
4. Delivery snapshot

### Product Context
`ContextPanel.tsx` evolue en studio contexte:
1. Liste documents par repo
2. Viewer markdown
3. Actions IA
4. `PrdAssistant` modal

### Delivery
`KanbanBoard.tsx` + `TicketDetail.tsx`:
1. Board operationnel
2. Ticket Hub onglets
3. Execution IA embarquee via `AgentPanel`

## Reutilisation APIs preload
Endpoints reutilises:
1. `getTickets`, `saveTicket`, `getEpics`
2. `scanDocs`, `readDoc`
3. `generateContext`, `writeClipboard`
4. `agentRun` (indirect via `AgentPanel`)
5. `getConversations`
6. `getServerStatus`

## Types et contrats
### Ticket
`LocalTicket` etendu avec:
1. `lastRunAt?: string`
2. `lastRunStatus?: 'idle' | 'running' | 'success' | 'failed'`
3. `lastRunProvider?: 'claude' | 'codex' | 'cursor'`
4. `lastRunCommand?: string`

### Workflow capabilities
Nouveau type UI `WorkflowCapability`:
1. `id`
2. `label`
3. `command`
4. `status` (`stable|beta`)
5. `fallbackMessage`

## Politique de compatibilite
1. Pas de rupture storage workspaces/tickets
2. Pas de migration mandatory
3. Champs ticket optionnels pour backward compatibility

## Politique workflows
1. Stable: `dev-story`, `generate-context`
2. Beta: `create-ticket`, `create-story`, `fetch-project-context`, `qa-review`

## PRD Assistant
1. Trigger standard: `/tiq-agent-brainstorming`
2. Sortie attendue: `.tiqora/context/brainstorming.md`
3. Re-scan docs apres execution pour remonter le document
