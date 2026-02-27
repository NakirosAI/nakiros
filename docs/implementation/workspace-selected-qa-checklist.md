# QA Checklist - Refonte UX Workspace Selectionne

## 1. Navigation et orientation
1. Ouvrir un workspace -> l'onglet actif est `Overview`.
2. Navigation `Overview/Product/Delivery/Settings` fonctionne sans erreur.
3. Aucun onglet legacy (`Board/Repos/Agents/Context`) visible dans la sidebar.

## 2. Overview
1. Les KPI sont affiches (tickets/docs/sessions IA).
2. `Next action` s'adapte correctement:
   - zero ticket + zero doc -> CTA PRD
   - docs presents + zero ticket -> CTA create ticket
   - ticket in progress -> CTA delivery
3. Boutons raccourcis vers Product/Delivery fonctionnent.

## 3. Product Context
1. Liste documents par repo affichage correct.
2. Viewer markdown charge correctement un doc selectionne.
3. Actions IA visibles:
   - PRD Assistant
   - Generer contexte
   - Contexte PM (Beta)
4. Badge Beta visible sur l'action PM.

## 4. PRD Assistant
1. Ouverture modal depuis Product Context.
2. Validation des champs requis.
3. Submit lance `/tiq-agent-brainstorming`.
4. Bouton copy prompt fonctionne.
5. Fin de session: re-scan docs et toast de confirmation.

## 5. Delivery et Ticket Hub
1. Board affiche tickets par colonnes.
2. Filtres statut/repo/priorite fonctionnent en combinaison.
3. Clic ticket ouvre le hub a droite.
4. Onglets hub visibles: Definition/Context/Execution/Artifacts.

## 6. Execution ticket
1. Dans `Execution`, CTA `Lancer dev-story` present.
2. Lancement utilise `/tiq-workflow-dev-story`.
3. Agent panel embarque s'ouvre dans le hub.
4. Statut run ticket se met a jour (`running` puis `success`).

## 7. Settings workflows
1. Bloc `Workflow availability` visible dans General.
2. Chaque workflow a un badge Stable/Beta.
3. Les workflows Beta affichent un fallback explicite.

## 8. Non-regression
1. Home, Setup workspace, Global Settings fonctionnent.
2. Jira OAuth toujours operationnel.
3. Sauvegarde ticket/epic/workspace inchangée.

## 9. Build
1. `pnpm --filter @tiqora/desktop build` passe.
2. Pas d'erreur TypeScript.
