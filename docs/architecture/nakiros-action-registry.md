# Architecture — Registre des Nakiros Actions

> Document de référence pour les `nakiros-actions`.
> Il définit les catégories d'actions, leur sémantique métier, leurs noms canoniques et leur forme de transport actuelle.

---

## 1. Objectif

Les agents Nakiros ne doivent pas appeler Jira, Linear, GitHub ou d'autres systèmes externes comme primitives métier directes.

Ils doivent demander des **Nakiros Actions**.

Le backend SaaS Nakiros est responsable de :

- router l'action vers le bon système
- appliquer les règles du workspace
- gérer l'authentification et les tokens
- normaliser la réponse

Principe :

> **l'agent demande une intention métier ; Nakiros décide comment l'exécuter techniquement**

---

## 2. Rôle architectural des Nakiros Actions

Les Nakiros Actions sont la couche d'effet réel du système.

Elles servent à :

- lire des données de workspace
- lire ou écrire du contexte
- créer ou modifier des tickets
- écrire dans le backlog Nakiros
- piloter la review
- coordonner certaines opérations runtime

Elles ne servent pas à :

- raisonner à la place de l'agent
- choisir une stratégie produit ou technique
- déduire des intentions métier depuis du texte libre

L'action est une primitive d'exécution, pas une primitive d'intelligence.

---

## 3. Chaîne d'exécution

```text
Agent
  -> émet une nakiros-action
Desktop / Orchestrateur
  -> parse et valide
Backend SaaS Nakiros
  -> résout le handler d'action
  -> route vers le système réel
    -> PM tool / context store / review engine / backlog / sync
Résultat
  -> normalisé
  -> réinjecté dans la conversation
```

---

## 4. Deux niveaux de nommage

Pour éviter la confusion entre l'intention métier et le format de transport, on distingue deux niveaux.

### 4.1 Nom canonique

Le nom canonique est le nom métier utilisé dans l'architecture.

Exemples :

- `pm.create_ticket`
- `pm.update_ticket_status`
- `context.repo.get`
- `context.workspace.set`
- `review.open`
- `agent.consult`

### 4.2 Nom de transport

Le nom de transport est la valeur actuelle du champ `tool` dans un bloc `nakiros-action`.

Exemples actuels :

- `create_ticket`
- `update_ticket_status`
- `repo_context_get`
- `workspace_context_set`
- `workspace_info`

### Règle

Dans la documentation d'architecture :

- on raisonne en **noms canoniques**

Dans l'implémentation v1 actuelle :

- on tolère les **noms de transport** plats, pour compatibilité

Exemple :

| Canonique | Transport actuel |
|---|---|
| `pm.create_ticket` | `create_ticket` |
| `context.repo.get` | `repo_context_get` |
| `context.workspace.set` | `workspace_context_set` |

---

## 5. Format de transport actuel

Le transport actuel reste le bloc `nakiros-action` :

~~~md
```nakiros-action
{ "tool": "create_ticket", "title": "Export monthly CSV", "type": "story" }
```
~~~

Règles :

- `tool` est requis
- `args` sont encodés inline dans l'objet JSON
- une action par bloc
- plusieurs blocs peuvent être émis séquentiellement

Ce document ne change pas ce format v1.
Il fixe seulement la cible conceptuelle au-dessus.

---

## 6. Catégories d'actions

Les actions sont regroupées en six familles.

### 6.1 `workspace.*`

Famille historique de lecture de métadonnées de workspace.

Exemples :

- `workspace.resolve` (cible)

Note :
- `workspace.info` et `workspace.repos` sont des actions legacy en cours de retrait.
- Le contrat cible lit désormais `{repo}/_nakiros/workspace.yaml` puis `~/.nakiros/workspaces/{workspace_slug}/workspace.yaml`.

### 6.2 `context.*`

Lecture et écriture du contexte Nakiros.

Exemples :

- `context.repo.get`
- `context.repo.set`
- `context.workspace.get`
- `context.workspace.set`

### 6.3 `pm.*`

Actions liées au PM tool configuré du workspace.

Exemples :

- `pm.get_ticket`
- `pm.create_ticket`
- `pm.update_ticket_status`
- `pm.add_comment`
- `pm.list_tickets`
- `pm.get_sprint`

Important :

- l'agent ne sait pas si le backend route vers Jira, Linear ou GitHub
- la primitive reste `pm.*`

### 6.4 `backlog.*`

Actions liées au backlog Nakiros structuré.

Exemples :

- `backlog.create_epic`
- `backlog.create_story`
- `backlog.create_task`
- `backlog.update_story`
- `backlog.update_epic`
- `backlog.update_task`
- `backlog.update_sprint`
- `backlog.list_stories`

### 6.5 `review.*`

Actions liées au cycle de review.

Exemples :

- `review.open`
- `review.accept`
- `review.reject`
- `review.ask_changes`

### 6.6 `agent.*`

Actions liées à l'orchestration augmentée.

Exemples :

- `agent.consult`
- `agent.handoff`
- `agent.spawn`

Remarque :

Ces actions sont très liées au runtime Nakiros.
Elles n'ont pas de sens en mode portable pur.

---

## 7. Registre canonique v1

### Workspace

| Canonique | Transport actuel | Effet |
|---|---|---|
| `workspace.resolve` | lecture locale yaml | résout le pointeur repo puis charge le workspace canonique |

### Context

| Canonique | Transport actuel | Effet |
|---|---|---|
| `context.repo.get` | `repo_context_get` | lit le contexte d'un repo |
| `context.repo.set` | `repo_context_set` | écrit le contexte d'un repo |
| `context.workspace.get` | `workspace_context_get` | lit un document de contexte workspace |
| `context.workspace.set` | `workspace_context_set` | écrit un document de contexte workspace |

### PM

| Canonique | Transport actuel | Effet |
|---|---|---|
| `pm.get_ticket` | `get_ticket` | lit un ticket du PM tool |
| `pm.create_ticket` | `create_ticket` | crée un ticket dans le PM tool |
| `pm.update_ticket_status` | `update_ticket_status` | change le statut d'un ticket |
| `pm.add_comment` | `add_comment` | ajoute un commentaire |
| `pm.list_tickets` | `list_tickets` | liste les tickets |
| `pm.get_sprint` | `get_sprint` | lit le sprint actif |

### Backlog

| Canonique | Transport actuel | Effet |
|---|---|---|
| `backlog.create_epic` | `create_epic` | crée un epic backlog |
| `backlog.create_story` | `create_story` | crée une story backlog |
| `backlog.update_story` | `update_story` | met à jour une story backlog existante |
| `backlog.create_task` | `create_task` | crée une task backlog |

### Review

Les actions review sont une cible d'architecture.
Elles ne sont pas encore toutes exposées comme `nakiros-action` stable dans la stack actuelle.

### Agent

Même remarque :

- elles existent comme besoin d'architecture
- leur transport final reste à figer

---

## 8. Payload métier

Les payloads d'actions doivent rester métier et compacts.

### Bon payload

```json
{
  "tool": "create_ticket",
  "title": "Export monthly CSV",
  "type": "story",
  "priority": "high",
  "description": "..."
}
```

### Mauvais payload

```json
{
  "tool": "jiraCreateIssue",
  "projectKey": "AUTH",
  "issueTypeId": "10014",
  "customField_12345": "..."
}
```

Règle :

- l'agent ne manipule pas les détails du provider
- le backend traduit vers le PM tool réel

---

## 9. Validation et autorisation

Chaque action doit pouvoir déclarer :

- si elle est autorisée pour cet agent
- si elle est autorisée dans ce workflow
- si elle demande une confirmation humaine
- si elle est portable ou Nakiros-only

Schéma conceptuel :

```yaml
id: pm.create_ticket
transport_tool: create_ticket
category: pm
portable: false
requires_confirmation: true
allowed_from_agents:
  - pm
  - nakiros
allowed_from_workflows:
  - create-ticket
  - create-story
payload_schema:
  title: string
  type: string
  priority: string
  description: string
```

---

## 10. Portabilité

Toutes les actions ne sont pas portables.

### Portables

Indirectement portables :

- un agent peut produire un artefact ou une instruction manuelle à la place d'une action

Exemple :

- au lieu d'appeler `pm.create_ticket`, le PM peut produire une story ou un ticket draft dans `_nakiros/`

### Nakiros-only

Par nature :

- `context.*`
- `review.*`
- `agent.*`
- la plupart des `pm.*` quand ils impliquent le backend SaaS

Règle :

> **quand une action n'est pas disponible, l'agent doit produire un fallback utile**

---

## 11. Résultats d'actions

Le backend doit renvoyer un résultat normalisé.

Exemple attendu :

```json
{
  "ticketId": "NAK-123",
  "summary": "Export monthly CSV",
  "status": "To Do",
  "url": "https://..."
}
```

Règles :

- pas de réponse brute provider en premier niveau
- noms de champs stables
- réponse exploitable immédiatement par l'agent

---

## 12. Règles de conception

### R1 — Action métier, pas action provider

Toujours :

- `pm.create_ticket`

Jamais :

- `jira.createIssue`
- `linear.createIssue`
- `github.createIssue`

### R2 — Les noms doivent être verbaux et clairs

Exemples :

- `context.repo.get`
- `pm.update_ticket_status`
- `review.accept`

### R3 — Les payloads restent simples

On expose l'intention, pas les détails de mapping technique.

### R4 — Le backend garde la connaissance des outils réels

Le routing Jira / Linear / GitHub appartient au backend SaaS.

### R5 — Toute action doit avoir une histoire de fallback

Si l'action n'est pas disponible, l'agent doit pouvoir continuer utilement.

---

## 13. Décisions structurantes

### D1 — Nakiros expose une couche d'actions métier unifiée

Les outils externes ne sont jamais les primitives directes du modèle.

### D2 — Le transport actuel plat est conservé en v1 pour compatibilité

Mais le langage d'architecture raisonne en noms canoniques.

### D3 — Le backend SaaS est le point de routage

L'agent ne sait pas quel PM tool est branché.

### D4 — Les actions review et agent sont des primitives cibles

Même si leur exposition complète reste à finaliser.

---

## 14. Relations avec les autres docs

Ce document complète :

- [agent-workflow-orchestration-model.md](/Users/thomasailleaume/Perso/timetrackerAgent/docs/architecture/agent-workflow-orchestration-model.md)
- [agent-runtime-decision-protocol.md](/Users/thomasailleaume/Perso/timetrackerAgent/docs/architecture/agent-runtime-decision-protocol.md)
- [nakiros-agent-workflow-bundle-architecture.md](/Users/thomasailleaume/Perso/timetrackerAgent/docs/architecture/nakiros-agent-workflow-bundle-architecture.md)
- [nakiros-actions.md](/Users/thomasailleaume/Perso/timetrackerAgent/docs/nakiros-actions.md)

`docs/nakiros-actions.md` reste la référence agent-facing sur le transport actuel.
Le présent document est la référence d'architecture sur le modèle cible.
