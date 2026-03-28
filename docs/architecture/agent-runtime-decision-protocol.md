# Architecture — Protocole de Décision Runtime & Registre de Workflows

> Suite de [agent-workflow-orchestration-model.md](/Users/thomasailleaume/Perso/timetrackerAgent/docs/architecture/agent-workflow-orchestration-model.md).
> Ce document décrit la forme concrète des décisions qu'un agent exprime au runtime et la manière dont l'orchestrateur résout workflows, actions et reviews.

---

## 1. Objectif

Le modèle conceptuel précédent fixe les responsabilités.
Ce document fixe la mécanique runtime minimale nécessaire pour l'implémenter.

Il répond à trois questions :

- comment un agent exprime une décision au runtime
- comment l'orchestrateur résout cette décision
- comment les workflows sont déclarés et découverts

---

## 2. Périmètre de ce protocole

Ce protocole décrit le **mode augmenté Nakiros**.

Il ne doit pas être interprété comme une dépendance obligatoire pour tous les agents.

En dehors de Nakiros :

- un agent doit rester capable de raisonner
- un agent doit pouvoir suivre un workflow de manière portable
- un agent doit pouvoir produire des artefacts locaux dans `_nakiros/`

Ce protocole n'ajoute que les capacités de runtime supplémentaires :

- orchestration multi-agent
- nakiros-actions système
- review globale
- coordination UI / CLI / SaaS

Le lancement d'un workflow ne fait pas partie de ce protocole.
Un agent peut lancer et suivre un workflow lui-même, avec ou sans Nakiros.

En dehors de Nakiros, les signaux runtime doivent être :

- absents par défaut
- ou silencieux si un outil les tolère sans polluer l'expérience utilisateur

---

## 3. Principes non négociables

### P1 — L'agent reste l'auteur de la décision

L'orchestrateur ne doit pas déduire seul une stratégie métier.
Il exécute une décision explicitement exprimée.

### P2 — Une décision runtime doit être structurée

Un simple markdown libre n'est pas un contrat fiable.
Les bascules critiques doivent passer par un format machine-readable.

### P3 — Les workflows sont déclaratifs

Un workflow doit pouvoir être listé, résolu, validé et versionné comme objet système.

### P4 — La review reste une primitive transverse

Toute proposition de mutation importante doit pouvoir ouvrir une review standardisée.

---

## 4. Vue d'ensemble

```text
User message
  -> Agent run
    -> Agent emits runtime decision block
      -> Orchestrator parses and validates
        -> Workflow registry resolves capability
          -> Workflow or action executes
            -> Artifact proposal emitted
              -> Review opens
                -> Accept / Reject / Ask changes
```

---

## 5. Bloc de décision runtime

Le runtime a besoin d'un bloc structuré unique pour les décisions agent -> orchestrateur.

Format cible :

```html
<!-- nakiros-runtime-decision {json metadata} -->
optional human-readable explanation
<!-- /nakiros-runtime-decision -->
```

Le body est optionnel et sert uniquement d'explication lisible.
La source de vérité est le JSON de metadata.

### Schéma minimal

```json
{
  "type": "consult_agent",
  "agentId": "architect",
  "reason": "Valider les implications d'architecture avant de poursuivre",
  "prompt": "Challenge cette proposition et liste les risques principaux"
}
```

### Types de décision supportés

- `stay_in_chat`
- `consult_agent`
- `handoff_agent`
- `request_action`
- `artifact_mutation`

Ce document ne remplace pas les blocs métiers déjà existants comme `artifact-change`.
Il ajoute un niveau supérieur de pilotage runtime.

---

## 6. Schéma par type de décision

### `stay_in_chat`

Utilisé quand l'agent reste en conversation libre.

```json
{
  "type": "stay_in_chat",
  "reason": "Le besoin est encore ambigu et doit être clarifié"
}
```

Effet :

- aucune transition de workflow
- aucun side effect
- la conversation continue normalement

### `consult_agent`

Utilisé quand un agent veut un avis d'un autre agent sans transfert d'autorité.

```json
{
  "type": "consult_agent",
  "agentId": "architect",
  "reason": "Valider les implications d'architecture avant de poursuivre",
  "prompt": "Challenge cette proposition et liste les risques principaux"
}
```

Effet :

- lancement d'un runner secondaire
- conservation de l'agent principal comme décideur
- retour de la synthèse dans la même conversation

### `handoff_agent`

Utilisé quand un autre agent devient agent principal pour la suite.

```json
{
  "type": "handoff_agent",
  "agentId": "dev",
  "reason": "Le travail est maintenant en phase d'implémentation",
  "handoffContext": {
    "artifactId": "story_123"
  }
}
```

Effet :

- changement explicite d'ownership du run principal
- journalisation de la transition

### `request_action`

Utilisé quand l'agent veut déclencher une `nakiros-action`.

```json
{
  "type": "request_action",
  "action": "pm.create_ticket",
  "reason": "Créer le ticket dans le PM tool configuré après validation de la story",
  "payload": {
    "workspaceId": "ws_123",
    "title": "Implement monthly CSV export"
  }
}
```

Effet :

- validation action/payload
- exécution si autorisée
- retour structuré à la conversation

Hors mode augmenté, l'agent doit fournir un fallback lisible :

- artefact manuel
- ticket à créer
- commande à exécuter
- note d'action à appliquer

### `artifact_mutation`

Utilisé quand l'agent indique qu'un artefact est en train d'être modifié ou vient d'être modifié.

```json
{
  "type": "artifact_mutation",
  "mode": "proposal",
  "target": {
    "kind": "workspace_doc",
    "absolutePath": "/repo/_nakiros/decisions/adr-001.md"
  },
  "reason": "Rédiger un document de décision à relire"
}
```

Effet :

- `mode: proposal` prépare le runtime à attendre un bloc `artifact-change`
- `mode: applied` indique qu'un changement a déjà été écrit
- permet au consumer UI d'ouvrir une review avant ou après application selon le mode

Schéma appliqué :

```json
{
  "type": "artifact_mutation",
  "mode": "applied",
  "target": {
    "kind": "workspace_doc",
    "absolutePath": "/repo/_nakiros/decisions/adr-001.md"
  },
  "reason": "Le document a déjà été écrit localement"
}
```

---

## 7. Pourquoi garder `artifact-change`

Le bloc `nakiros-runtime-decision` ne remplace pas `artifact-change`.

Séparation recommandée :

- `runtime-decision` = l'agent signale l'état de la mutation
- `artifact-change` = l'agent fournit l'artefact final proposé quand il existe encore sous forme de proposition

Exemple :

1. l'agent émet `artifact_mutation(mode=proposal)`
2. il génère ensuite un bloc `artifact-change`
3. l'orchestrateur ouvre la review

Cette séparation évite de surcharger un seul format pour deux responsabilités différentes.

---

## 8. Signal optionnel d'observabilité de workflow

Le runtime peut avoir intérêt à savoir quel workflow l'agent suit actuellement.

Ce besoin est légitime pour :

- l'UI
- le logging
- la persistance
- la reprise de contexte

Mais ce signal ne doit pas être une commande de lancement.

Format optionnel :

```html
<!-- nakiros-workflow-state {"workflow":"create-story","phase":"active"} -->
optional human-readable note
<!-- /nakiros-workflow-state -->
```

Ce bloc indique :

- quel workflow l'agent suit déjà
- dans quelle phase il se trouve

Il n'autorise pas l'orchestrateur à choisir ou démarrer ce workflow.

---

## 9. Mode portable hors orchestrateur

Quand Nakiros n'est pas disponible :

- aucun bloc `nakiros-runtime-decision` n'est requis
- aucun workflow runtime n'est déclenché
- aucun multi-agent orchestré n'est garanti

Le comportement attendu devient :

- l'agent suit le workflow de manière autonome
- il produit un artefact canonique
- il le dépose dans `_nakiros/` ou le retourne inline
- il peut écrire directement le fichier cible
- il explicite les étapes manuelles restantes

Exemple :

- dans Claude CLI, `PM` peut produire `_nakiros/backlog/stories/export-monthly-csv.md`
- dans Nakiros, le même PM peut signaler `nakiros-workflow-state` puis ouvrir une review

Le protocole runtime ne doit donc jamais être la seule manière de faire produire un agent.

---

## 10. Registre de workflows

L'orchestrateur a besoin d'un registre résoluble, typé et versionnable.

Le bundle actuel dispose déjà de workflows versionnés dans [packages/agents-bundle/manifest.json](/Users/thomasailleaume/Perso/timetrackerAgent/packages/agents-bundle/manifest.json).
La prochaine étape est d'ajouter un index logique au-dessus des fichiers.

### Rôle du registre

Le registre sert à :

- lister les workflows disponibles
- décrire leurs capacités
- dire quels agents peuvent les suivre
- dire quels artefacts ils produisent
- dire quelles actions ils peuvent demander

### Schéma conceptuel

```yaml
id: create-story
title: Create Backlog Story
category: pm
description: Convertit une feature clarifiée en story backlog reviewable
entry_agents:
  - pm
  - nakiros
entry_surfaces:
  - chat
  - backlog
  - product
required_inputs:
  - target.kind
produces:
  - backlog_story
actions_allowed:
  - backlog.upsertStory
  - review.open
review_policy: required
output_protocols:
  - artifact-change
bundle_path: workflows/2-pm/create-story/workflow.yaml
portable_outputs:
  - _nakiros/backlog/stories/
mutation_modes:
  - proposal
  - applied
```

### Champs minimaux du registre

- `id`
- `title`
- `category`
- `description`
- `entry_agents`
- `entry_surfaces`
- `required_inputs`
- `produces`
- `actions_allowed`
- `review_policy`
- `output_protocols`
- `bundle_path`
- `portable_outputs`
- `mutation_modes`

---

## 11. Registre d'actions

Le runtime a aussi besoin d'un catalogue explicite des actions.

Exemples :

- `review.open`
- `review.accept`
- `review.reject`
- `backlog.upsertStory`
- `backlog.updateEpic`
- `workspace.writeDocument`
- `pm.create_ticket`
- `pm.update_ticket`
- `pm.add_comment`
- `agent.spawn`
- `agent.consult`

Schéma conceptuel :

```yaml
id: pm.create_ticket
title: Create Ticket Through Configured PM Tool
category: pm
requires_confirmation: true
allowed_from:
  - create-ticket
  - create-story
payload_schema:
  workspaceId: string
  title: string
  description: string
returns:
  ticketId: string
  url: string
```

L'objectif n'est pas de mettre de l'intelligence dans l'orchestrateur.
L'objectif est de rendre les capacités exécutables visibles, validables et traçables.

---

## 12. Règles de routage

### Routage primaire

Le runtime suit la priorité suivante :

1. `runtime-decision` valide
2. `workflow-state` optionnel pour l'observabilité
3. `artifact-change` ou autre protocole métier explicite
3. texte libre sans effet système

### Règles

- si une `artifact_mutation(mode=proposal)` est présente, le runtime attend un bloc `artifact-change`
- si une `artifact_mutation(mode=applied)` est présente, le runtime reconstruit la review à partir du fichier courant et du baseline
- si plusieurs décisions incompatibles sont présentes, la première décision valide gagne et les autres sont ignorées avec trace
- sans bloc structuré valide, aucune action système implicite ne doit être lancée
- un `workflow-state` ne déclenche aucune action par lui-même

### Règle anti-magie

Le runtime ne doit pas déduire seul :

- qu'un markdown ressemble à une story
- qu'un texte devrait devenir un ticket dans le PM tool
- qu'il faudrait consulter Architect

Il peut au plus proposer côté UI une conversion ou une relance contextualisée, mais pas exécuter seul.

---

## 13. Statut du chat libre

Le chat libre garde une grande valeur.

Mais le runtime doit distinguer deux cas :

### Chat libre pur

- exploration
- questions
- challenge
- brainstorming

Sortie :

- texte
- synthèse
- éventuelle recommandation de workflow

### Chat libre avec transition guidée

Quand l'agent produit quelque chose de structuré mais sans cible explicite, l'app peut proposer :

- convertir en document
- convertir en story backlog
- relancer avec `artifactContext`

Cette conversion reste une décision UI assistée, pas une exécution implicite de l'orchestrateur.

---

## 14. Flux de référence

### A — Feature discussion -> create story

1. l'utilisateur parle au PM
2. le PM clarifie la feature
3. le PM suit `create-story`
4. en mode augmenté, il peut émettre `nakiros-workflow-state`
5. le workflow produit un `artifact-change`
6. review ouverte
7. validation
8. action backlog exécutée

### B — Decision doc depuis Chat

1. l'utilisateur parle à Nakiros
2. Nakiros émet `artifact_mutation(mode=proposal)`
3. il produit un `artifact-change` ciblé `workspace_doc`
4. review ouverte
5. accept ou reject

### C — Consultation Architect

1. Nakiros émet `consult_agent(architect)`
2. l'orchestrateur lance le runner Architect
3. le retour est injecté dans la conversation
4. Nakiros reste décideur principal

### D — Action PM Tool via Nakiros Backend

1. le PM émet `request_action(pm.create_ticket)`
2. l'orchestrateur valide le payload
3. la nakiros-action s'exécute via le backend SaaS et le PM tool configuré
4. le ticket créé est renvoyé dans la conversation

### E — Mutation locale déjà appliquée

1. dans un outil portable, l'agent écrit directement `_nakiros/decisions/adr-001.md`
2. dans Nakiros, ce même comportement peut être signalé par `artifact_mutation(mode=applied)`
3. le runtime ouvre une review post-write
4. l'utilisateur valide ou rollbacke

---

## 15. Décisions d'architecture

### D1 — Introduire un bloc `nakiros-runtime-decision`

Il porte les décisions de pilotage runtime.

### D2 — Conserver `artifact-change` comme protocole métier séparé

Il reste le format standard pour proposer une mutation d'artefact.

### D3 — Ajouter un registre logique de workflows

Le manifest bundle ne suffit pas à lui seul pour le routage sémantique.

### D4 — Ajouter un registre logique d'actions

Les actions doivent être explicites, validables et observables.

### D5 — Aucune action système implicite à partir d'un simple texte libre

L'orchestrateur doit rester strict.

### D6 — Le protocole runtime ne doit pas casser la portabilité des agents

Les agents doivent garder un comportement utile sans orchestrateur.

### D7 — Le lancement d'un workflow reste une responsabilité agent

Le runtime peut observer un workflow en cours, pas le décider à la place de l'agent.

### D8 — Les décisions runtime sont explicites dans Nakiros, silencieuses ou absentes ailleurs

Le protocole ne doit jamais polluer l'expérience des outils portables.

---

## 16. Étapes d'implémentation recommandées

1. ajouter les types partagés `RuntimeDecision`, `WorkflowRegistryEntry`, `ActionRegistryEntry`
2. créer un parser `extractRuntimeDecisionBlocks(...)`
3. ajouter un registre local minimal des workflows du bundle
4. ajouter un parser optionnel `extractWorkflowStateBlocks(...)` pour l'observabilité
5. brancher `consult_agent` dans l'orchestrateur
6. connecter les agents principaux à ce protocole
7. définir la convention portable `_nakiros/` par type d'artefact
8. supporter `artifact_mutation(mode=applied)` avec reconstruction de review
9. ajouter une UI de conversion pour le chat libre quand aucun target explicite n'existe

---

## 17. Relation avec l'architecture existante

Ce document prolonge :

- [agent-workflow-orchestration-model.md](/Users/thomasailleaume/Perso/timetrackerAgent/docs/architecture/agent-workflow-orchestration-model.md)
- [nakiros-agent-workflow-bundle-architecture.md](/Users/thomasailleaume/Perso/timetrackerAgent/docs/architecture/nakiros-agent-workflow-bundle-architecture.md)
- [nakiros-action-registry.md](/Users/thomasailleaume/Perso/timetrackerAgent/docs/architecture/nakiros-action-registry.md)
- [orchestrator-cli-migration.md](/Users/thomasailleaume/Perso/timetrackerAgent/docs/architecture/orchestrator-cli-migration.md)
- [orchestrator-session-management.md](/Users/thomasailleaume/Perso/timetrackerAgent/docs/architecture/orchestrator-session-management.md)

Il ne remplace pas ces documents.
Il fixe la couche de contrat runtime qui manque encore entre les agents versionnés et le moteur d'orchestration.
