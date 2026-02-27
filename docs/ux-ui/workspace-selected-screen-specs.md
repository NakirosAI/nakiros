# UX/UI Specs - Workspace Selectionne

## Navigation globale
Tabs principales:
1. `Overview`
2. `Product`
3. `Delivery`
4. `Settings`

Objectif: remplacer la navigation par objets techniques par une navigation par intention utilisateur.

## Ecran 1 - Overview
### Objectif
Fournir un cockpit unique avec statut global et prochaine action.

### Sections
1. `Project health` (KPI)
2. `Next actions` (max 3)
3. `IA activity`
4. `Delivery snapshot`

### Règles CTA
1. `0 ticket + 0 doc -> Créer PRD avec IA`
2. `docs > 0 + 0 ticket -> Créer premier ticket`
3. `in_progress > 0 -> Ouvrir Delivery`

### KPI obligatoires
1. Tickets total
2. En cours
3. Bloques
4. Termines
5. Docs contexte
6. Sessions IA

## Ecran 2 - Product Context
### Objectif
Centraliser le contexte projet et les actions IA de cadrage.

### Layout
1. Colonne gauche: docs par repo
2. Panneau central: markdown viewer ou agent
3. Actions IA (bas colonne gauche)

### Actions IA
1. `PRD Assistant` (recommande)
2. `Generer le contexte`
3. `Contexte PM` (badge Beta)

### Etat vide
1. Aucun repo -> message explicite
2. Aucun doc -> CTA PRD Assistant

## Ecran 3 - PRD Assistant
### UI
Modal avec 4 champs:
1. Vision
2. Utilisateurs cibles
3. Probleme principal
4. Contraintes

### Submit
1. Construit un prompt structure
2. Lance `/tiq-agent-brainstorming`
3. Demande explicitement la sauvegarde dans `.tiqora/context/brainstorming.md`

### Completion
1. Fermeture modal
2. Re-scan docs
3. Toast de confirmation

### Fallback
1. Bouton `Copier le prompt`
2. Message erreur si lancement impossible

## Ecran 4 - Delivery
### Objectif
Executer les tickets sans quitter le contexte delivery.

### Layout
1. Kanban board principal
2. Ticket Hub a droite au clic ticket

### Toolbar
1. Recherche texte
2. Filtre statut
3. Filtre repo
4. Filtre priorite

### Etat vide
1. Aucun ticket -> CTA `Creer premier ticket`

## Ecran 5 - Ticket Hub
Onglets:
1. `Definition`
2. `Context`
3. `Execution`
4. `Artifacts`

### Definition
1. Champs ticket
2. Dependances
3. Acceptance criteria

### Context
1. Preview `generateContext`
2. Bouton copy
3. Refresh preview

### Execution
1. Selection repo
2. CTA principal `Lancer dev-story`
3. Lancement `/tiq-workflow-dev-story`
4. Stream agent integre via `AgentPanel`
5. Etat dernier run affiche

### Artifacts
1. Repo cible
2. Chemins docs ticket/dev notes
3. Infos remote/path

## Ecran 6 - Settings
### Ajout
Bloc `Workflow availability` dans General:
1. Liste workflows
2. Badge `Stable` ou `Beta`
3. Message fallback pour Beta

## Microcopies critiques
1. CTA principal Overview orienté action
2. Badge Beta toujours visible
3. Messages de fallback explicites (pas de dead-end)
