# Architecture — Modèle Agent, Workflow, Orchestrateur

> Document de cadrage pour Nakiros.
> Il fixe la séparation des responsabilités entre les agents, les workflows, l'orchestrateur, les actions et les artefacts.

---

## 1. Objectif

Nakiros ne doit pas être conçu comme un simple chat d'agents.

Nakiros doit être pensé en **local-first**, avec deux niveaux de capacité :

- un **mode portable** où les agents restent utiles hors de Nakiros
- un **mode augmenté** où Nakiros apporte orchestration, review, multi-agent, multi-repo et intégrations

Le modèle cible est :

- des agents qui raisonnent et décident
- des workflows explicites pour encadrer le travail reproductible
- un orchestrateur qui exécute et coordonne
- des actions qui touchent les systèmes externes
- des artefacts structurés, courts et réutilisables

La règle directrice est simple :

**si cela demande du jugement, c'est l'agent ; si cela demande de l'exécution fiable, c'est l'orchestrateur.**

---

## 2. Deux modes d'exécution

### Mode portable

Le mode portable doit fonctionner dans Claude CLI, Codex CLI, Cursor ou tout autre outil sans runtime Nakiros.

Dans ce mode :

- les agents gardent leur persona, leurs règles et leur méthode
- ils peuvent suivre un workflow "mentalement" ou via un simple fichier de workflow
- ils peuvent produire des artefacts structurés dans un dossier local `_nakiros/`
- ils restent limités au repo courant
- il n'y a pas de multi-repo natif
- il n'y a pas de review UI Nakiros
- il n'y a pas d'action système Nakiros garantie

Le dossier `_nakiros/` est le format portable local.

Il permet :

- de conserver les habitudes des utilisateurs
- de garder les artefacts visibles dans le repo
- de rester utile même sans Desktop, SaaS ou orchestrateur

### Mode augmenté Nakiros

Quand Nakiros est branché, le système ajoute :

- orchestrateur runtime
- review globale des artefacts
- orchestration multi-agent
- nakiros-actions / backlog / docs / sync
- contexte partagé équipe
- multi-repo
- synchronisation SaaS future des dossiers `_nakiros/`

Règle produit :

**les agents doivent être bons partout, et meilleurs dans Nakiros.**

---

## 3. Positionnement des couches

```text
Conversation UI
  -> Agent
    -> choisit de rester en chat libre ou d'entrer dans un workflow
      -> Workflow
        -> cadre la procédure et les sorties attendues
          -> Orchestrateur
            -> exécute, persiste, coordonne
              -> Actions
                -> Nakiros-actions / Docs / Backlog / Sync / Spawn agent
          -> Artifact Review
            -> validation humaine
              -> application finale / rollback / publication
```

---

## 4. Responsabilités par couche

### Agent

L'agent est le décideur.

Il :

- interprète l'intention utilisateur
- choisit une stratégie
- décide s'il reste en conversation libre
- décide s'il faut entrer dans un workflow explicite
- décide s'il faut consulter ou challenger un autre agent
- décide s'il faut produire un artefact
- décide s'il faut demander une action

En mode portable, l'agent doit aussi savoir :

- produire un artefact exploitable sans orchestrateur
- le déposer dans `_nakiros/` ou le rendre inline
- appliquer directement une modification locale si le mode d'usage le demande
- dégrader proprement ses capacités avancées quand Nakiros n'est pas disponible

Il ne doit pas :

- gérer la persistance technique
- implémenter la logique UI
- gérer les retries, timeouts ou sessions provider
- exécuter lui-même les intégrations système

### Workflow

Le workflow est un cadre procédural réutilisable.

Il :

- formalise une intention métier connue
- définit les inputs nécessaires
- définit les étapes
- définit les artefacts attendus
- définit les actions autorisées
- définit les critères de complétion

Il ne doit pas :

- remplacer le jugement de l'agent
- décider seul de s'exécuter
- contenir de logique d'intégration spécifique à l'infra

### Orchestrateur

L'orchestrateur est le moteur d'exécution et de coordination.

Il :

- lance les runs d'agents
- matérialise l'entrée dans les workflows demandés par l'agent
- persiste conversations, runners et streams
- coordonne les handoffs inter-agents
- applique les garde-fous runtime
- ouvre les reviews d'artefacts
- exécute les actions autorisées
- gère l'état, les erreurs, retries et timeouts

Il ne doit pas :

- interpréter seul l'intention métier
- choisir une stratégie produit ou technique
- inventer un workflow sans décision explicite d'un agent
- arbitrer à la place de l'agent

### Actions

Les actions sont des effets réels sur les systèmes.

Exemples :

- créer ou mettre à jour un ticket via le PM tool configuré
- mettre à jour un backlog
- écrire un document workspace
- synchroniser du contexte
- ouvrir une review
- lancer un autre agent

Une action est :

- explicite
- traçable
- validable
- sécurisée
- optionnelle hors mode augmenté Nakiros

### Artefacts

Les artefacts sont les sorties structurées du système.

Exemples :

- story
- epic
- task
- sprint
- PRD
- ADR
- document de décision
- context digest
- ticket payload

Un artefact doit être :

- court
- canonique
- diffable
- reviewable
- réinjectable dans le contexte

En mode portable, ils peuvent être déposés localement dans `_nakiros/`.
En mode augmenté, ils deviennent des objets reviewables, synchronisables et partageables.

---

## 5. Contrat de décision Agent -> Orchestrateur

L'agent ne doit pas seulement "répondre en texte".
Il doit pouvoir exprimer des décisions structurées au runtime.

Les décisions de haut niveau attendues sont :

- `stay_in_chat`
- `consult_agent`
- `handoff_agent`
- `artifact_mutation`
- `request_action`

Ce document ne fixe pas encore le protocole technique final, mais fixe la sémantique :

- l'agent exprime une intention de runtime quand Nakiros est présent
- l'orchestrateur exécute cette intention quand Nakiros est présent
- la review humaine reste possible sur les artefacts mutables

En mode portable, ces décisions peuvent être :

- totalement absentes
- silencieuses
- remplacées par des effets locaux directs sur les fichiers

Hors orchestrateur, l'agent doit pouvoir continuer en mode portable :

- produire lui-même l'artefact
- le déposer dans `_nakiros/`
- ou fournir un résultat manuel exploitable par l'utilisateur

La transition vers un workflow n'est pas une décision runtime à exécuter.
Elle appartient à l'agent lui-même.

Si Nakiros a besoin d'observer qu'un agent suit un workflow donné, cela doit passer par un signal d'observabilité, pas par une commande d'exécution.

---

## 6. Contrat Workflow -> Runtime

Un workflow Nakiros doit décrire explicitement :

- son `id`
- son objectif
- ses prérequis
- ses entrées
- ses étapes
- ses sorties attendues
- les actions autorisées
- ses critères de fin

Schéma conceptuel :

```yaml
id: create-story
goal: Convertir une feature clarifiée en story backlog exploitable
entry_conditions:
  - feature clarifiée
required_context:
  - product context
  - backlog context
produces:
  - backlog_story
actions_allowed:
  - backlog.upsertStory
  - review.open
completion_criteria:
  - story rédigée
  - review ouverte ou mutation appliquée selon le mode
```

La responsabilité du workflow est de cadrer la production.
La responsabilité de l'orchestrateur est d'exécuter ce cadre.

Hors runtime Nakiros, un agent peut suivre ce même cadre sans orchestration avancée.

---

## 7. Règles sur les outputs

Les outputs Nakiros ne doivent pas être de longs markdowns jetables.

Les sorties doivent être :

- suffisamment petites pour être remises en contexte plus tard
- suffisamment structurées pour être utilisées par l'app
- suffisamment stables pour être validées par diff

Règles :

- privilégier les formats canoniques
- borner la taille des sections
- séparer clairement métadonnées et contenu
- produire un artefact exploitable plutôt qu'un texte "joli"

Conséquence :

- un `PRD` Nakiros ne doit pas être un roman
- une `story` Nakiros ne doit pas être un markdown libre ambigu
- un `decision record` doit être compact et normalisé
- un artefact portable doit rester exploitable depuis `_nakiros/`
- une mutation locale directe doit rester reconstructible a posteriori dans Nakiros

---

## 8. Dossier local `_nakiros/`

Le dossier `_nakiros/` dans un repo est la base du mode portable.

Il permet :

- de stocker des artefacts générés localement
- de conserver des contextes locaux du repo
- d'offrir un point d'entrée stable pour Claude CLI, Codex CLI et autres outils

Dans ce mode :

- les sorties restent mono-repo
- la structure doit rester simple et lisible
- aucune dépendance au SaaS ou au Desktop n'est requise

À terme, Nakiros pourra proposer :

- une synchronisation sélective de `_nakiros/` vers le cloud
- une validation avant publication
- une transformation de certains artefacts locaux en contexte partagé

Mais la portabilité locale doit exister indépendamment de cette future sync.

---

## 9. Discussion libre vs Workflow

Le chat libre reste nécessaire.

Il sert à :

- explorer
- clarifier
- challenger
- brainstormer
- arbitrer

Un workflow devient préférable quand il faut :

- produire un artefact structuré
- modifier un artefact existant
- lancer une séquence reproductible
- impliquer plusieurs agents avec rôles explicites
- déclencher des actions sur des systèmes externes

Règle produit :

**conversation libre pour explorer, workflow pour produire ou transformer.**

---

## 10. Exemples de flux

### Flux 1 — Discussion simple

Cas :

- l'utilisateur parle au PM d'une idée encore floue

Séquence :

1. l'agent reste en `stay_in_chat`
2. il clarifie le besoin
3. il peut consulter un autre agent si utile
4. aucun workflow n'est lancé tant que la demande n'est pas prête

### Flux 2 — Création d'une story backlog

Cas :

- l'utilisateur dit "crée la story backlog"

Séquence :

1. le PM décide d'entrer dans `create-story`
2. le PM suit lui-même ce workflow
3. le workflow produit un artefact `backlog_story`
4. en mode augmenté, l'orchestrateur ouvre une review
5. après validation, la nakiros-action correspondante est appliquée

En mode portable :

1. le PM suit le même workflow sans orchestrateur
2. il produit une story canonique dans `_nakiros/`
3. l'utilisateur peut l'appliquer manuellement ou la réimporter plus tard dans Nakiros

### Flux 3 — Modification d'un document ciblé

Cas :

- l'utilisateur édite un document dans Product

Séquence :

1. l'agent produit une `artifact_mutation`
2. la mutation est soit proposée, soit déjà appliquée
3. l'orchestrateur ouvre la review globale
4. selon le mode :
   - `proposal` : rien n'est appliqué avant validation
   - `applied` : l'écriture est déjà faite puis review/rollback possible

### Flux 4 — Orchestration multi-agent

Cas :

- Nakiros veut faire challenger une proposition par Architect puis PM

Séquence :

1. Nakiros décide `consult_agent(architect)`
2. l'orchestrateur lance un runner Architect dans la même conversation
3. Nakiros décide ensuite `consult_agent(pm)` si nécessaire
4. il synthétise les résultats
5. si un artefact final est prêt, il entre en review

L'orchestrateur ne choisit pas lui-même les agents à consulter.
Il exécute la décision de l'agent principal.

---

## 11. Décisions structurantes

### D1 — L'agent reste le décideur principal

L'intelligence métier et la stratégie restent dans l'agent.

### D2 — L'orchestrateur ne doit pas devenir une seconde IA cachée

L'orchestrateur exécute, coordonne et sécurise.
Il ne raisonne pas à la place de l'agent.

### D3 — Les workflows sont des cadres, pas des cerveaux

Un workflow encadre une manière de faire.
Il n'initie pas seul son exécution, et l'agent peut le suivre sans orchestrateur.

### D4 — Les artefacts sont des objets système

Ils ne sont pas de simples textes déposés dans un dossier.
Ils sont la sortie reviewable, diffable et réinjectable du travail agent.

### D5 — Toute mutation importante passe par un mécanisme de review

Sauf cas explicitement assumé, une mutation d'artefact doit être visible et validable.

### D6 — Le mode portable reste une exigence produit

Les agents doivent rester utiles hors orchestrateur via des artefacts locaux `_nakiros/`.

### D7 — Le SaaS est une couche d'augmentation, pas une dépendance de base

La synchronisation cloud doit enrichir le local-first, pas le remplacer.

---

## 12. Implications pour la suite

Les prochaines briques à formaliser dans Nakiros sont :

1. un schéma commun des décisions agent -> orchestrateur
2. un registre central des workflows et de leurs capacités
3. un catalogue d'actions explicites et sécurisées
4. des formats canoniques d'artefacts par domaine
5. un routeur clair entre chat libre, workflow, review et action
6. une convention locale `_nakiros/` par repo
7. une stratégie de synchronisation `_nakiros/` -> SaaS avec validation

Le routeur ne doit pas "lancer" un workflow à la place de l'agent.
Il doit au plus observer le workflow en cours et brancher les capacités Nakiros associées.

Ce document sert de source de vérité conceptuelle pour ces travaux.

La traduction de ce modèle dans le bundle concret `agents + workflows` est détaillée dans [nakiros-agent-workflow-bundle-architecture.md](/Users/thomasailleaume/Perso/timetrackerAgent/docs/architecture/nakiros-agent-workflow-bundle-architecture.md).

La définition spécifique du futur agent de direction technique est détaillée dans [nakiros-cto-agent-model.md](/Users/thomasailleaume/Perso/timetrackerAgent/docs/architecture/nakiros-cto-agent-model.md).

La définition spécifique du futur agent de direction business est détaillée dans [nakiros-ceo-agent-model.md](/Users/thomasailleaume/Perso/timetrackerAgent/docs/architecture/nakiros-ceo-agent-model.md).
