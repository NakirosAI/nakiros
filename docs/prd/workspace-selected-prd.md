# PRD - Refonte UX Workspace Selectionne

## Contexte
L'interface actuelle segmente le parcours utilisateur par zones techniques (`Board`, `Repos`, `Agents`, `Context`). Cette structure augmente la charge cognitive et rend difficile l'identification de la prochaine action.

## Probleme utilisateur
1. Les utilisateurs se perdent entre board, contexte, agent et repos.
2. Le statut global du projet n'est pas visible en un seul ecran.
3. Le demarrage d'un projet vide (sans ticket/sans docs) n'est pas guide naturellement.
4. L'execution ticket IA est decouplee de la fiche ticket.

## Objectif produit
Permettre a l'utilisateur de comprendre l'etat du workspace et de lancer la prochaine action en moins de 10 secondes.

## Personas cibles
1. Developer
2. PO
3. PM
4. SM

La V1 conserve une **vue unique** pour tous les profils, avec des informations partagees et des CTA contextuels.

## Jobs-to-be-done
1. Comprendre le statut global du projet.
2. Cadrer un projet vide avec l'aide de l'IA.
3. Executer un ticket de bout en bout avec un agent.

## Principes UX
1. `overview-first`
2. `next-action centric`
3. `ticket hub unique`

## KPI de succes
1. Temps d'orientation initial (< 10 secondes)
2. Temps de lancement d'une execution IA sur ticket
3. Taux d'usage de la vue `Overview`

## Scope V1
1. Nouvelle navigation: `Overview -> Product -> Delivery -> Settings`
2. Ecran `Overview` par defaut
3. `Product Context` avec actions IA
4. `PRD Assistant` via `/nak-agent-brainstorming`
5. `Delivery` avec Ticket Hub unifie
6. Affichage des workflows `Stable/Beta`

## Hors scope V1
1. Segmentation de vues par role (dev/PO/PM/SM)
2. Refonte visuelle lourde
3. Nouvelles APIs Electron/IPC (reuse de l'existant)

## Decisons verrouillees
1. Commande PRD Assistant: `/nak-agent-brainstorming`
2. Sortie attendue brainstorming: `~/.nakiros/workspaces/{workspace_slug}/context/brainstorming.md`
3. Aucune reference produit a `tiq-workflow-brainstorming`
4. Rollout progressif en phases
