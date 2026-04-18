# Architecture — Bundle Agents & Workflows Nakiros

> Document de cadrage pour la future refonte complète du bundle `packages/agents-bundle/`.
> Il décrit le modèle cible des agents, workflows et modules Nakiros, en s'appuyant sur la qualité méthodologique de BMAD tout en ajoutant les capacités propres à Nakiros.

---

## 1. Objectif

Nakiros doit viser :

- la qualité de persona et de workflow de BMAD
- la portabilité hors Nakiros
- une surcouche augmentée quand Nakiros est branché
- des artefacts plus compacts et mieux structurés
- une vraie orchestration multi-agent et multi-outils

La stratégie recommandée est explicite :

> **reprendre les meilleurs agents et workflows BMAD comme base de travail, puis les adapter au modèle Nakiros**

Décision de phase :

> **la v1 du bundle couvre tout le noyau BMAD utile ; les briques purement spécifiques Nakiros arrivent ensuite**

Il ne s'agit pas de réécrire à zéro par principe.
Il s'agit de conserver leur qualité méthodologique, puis d'ajouter :

- `_nakiros/` comme format local portable
- review d'artefacts
- nakiros-actions runtime
- multi-agent
- multi-repo

---

## 2. Positionnement par rapport à BMAD

### Ce qu'on veut garder de BMAD

- personas fortes
- activation claire
- réflexes métiers bien explicités
- commandes et menus
- workflows guidés
- découpage micro-fichiers quand il améliore vraiment la qualité

### Ce qu'on veut dépasser

- dépendance à un modèle purement local
- artefacts trop longs
- fichiers déposés sans structure exploitable
- faible distinction entre mode portable et mode augmenté
- manque d'orchestration runtime
- manque d'intégration outillée

### Principe d'adaptation

Le bundle Nakiros doit être pensé comme :

- **BMAD-compatible dans la méthode**
- **Nakiros-native dans l'exécution augmentée**

---

## 3. Deux couches dans chaque agent

Chaque agent Nakiros doit être conçu avec deux couches explicites.

### Couche 1 — Portable core

Fonctionne dans :

- Claude CLI
- Codex CLI
- Cursor
- tout environnement sans runtime Nakiros

Elle contient :

- persona
- règles
- méthode
- menus et intentions
- capacité à suivre un workflow
- capacité à écrire des artefacts dans `_nakiros/`

### Couche 2 — Nakiros extensions

Fonctionne seulement quand Nakiros est présent.

Elle ajoute :

- signaux runtime silencieux ou explicites
- `artifact_mutation`
- `consult_agent`
- `handoff_agent`
- `request_action`
- review
- contexte workspace / multi-repo
- coordination avec l'orchestrateur

Règle :

> **l'agent doit rester utile sans Nakiros, et devenir meilleur avec Nakiros**

---

## 4. Structure cible du bundle

Structure recommandée :

```text
packages/agents-bundle/
  agents/
    architect.md
    dev.md
    pm.md
    qa.md
    sm.md
    brainstorming.md
    cto.md
    ceo.md

  workflows/
    1-discovery/
    2-pm/
    3-implementation/
    4-quality/
    5-reporting/

  modules/
    portable/
      local-artifacts.md
      local-reading-strategy.md
    runtime/
      artifact-mutation.md
      workflow-state.md
      consult-agent.md
      request-action.md
    domains/
      backlog-format.md
      architecture-slicing.md
      feature-doc-format.md
    integrations/
      pm-actions.md
      context-sync.md

  commands/
    nak-agent-*.md
    nak-workflow-*.md

  core/
    tasks/
      workflow.xml

  manifest.json
  CHANGELOG.md
```

### Couche direction Nakiros

Au-dessus du noyau BMAD-backed, Nakiros introduit une couche de direction propre :

- `cto`
- `ceo`

Règle de rôle :

- `cto` porte la vision technique, la soutenabilité du système et l'orchestration des spécialistes techniques
- `ceo` portera la vision business à 3 ans, la rentabilité et l'orchestration des spécialistes business

`Nakiros` reste le nom de la plateforme, pas le nom d'un agent métier.

---

## 5. Schéma cible d'un agent Nakiros

Le format final peut rester en markdown/XML compilé comme aujourd'hui, mais le contenu logique doit suivre ce modèle.

### Sections attendues

1. `metadata`
2. `activation`
3. `portable_reflexes`
4. `runtime_reflexes`
5. `persona`
6. `workflow_affinities`
7. `artifact_policies`
8. `action_policies`
9. `menu`

### Sémantique des sections

#### `metadata`

- `id`
- `name`
- `title`
- `description`
- `capabilities`
- `domains`

#### `activation`

Ce qui doit toujours se passer au démarrage.

Exemples :

- chargement du contexte de base
- application des defaults de langue
- règles de silence d'activation

#### `portable_reflexes`

Réflexes utilisables partout.

Exemples :

- lire `_nakiros/architecture/index.md` avant un scan large
- écrire un feature doc compact
- produire un backlog artifact canonique

#### `runtime_reflexes`

Réflexes disponibles seulement avec Nakiros.

Exemples :

- émettre `artifact_mutation`
- demander `consult_agent`
- appeler `request_action`
- utiliser le contexte workspace

#### `persona`

Toujours forte, claire et stable.

BMAD est une bonne référence ici.

#### `workflow_affinities`

Liste des workflows que l'agent peut suivre ou recommander.

Exemples :

- `pm` -> `create-story`, `pm-feature`, `plan-feature`
- `analyst` -> `product-discovery`, `project-understanding-confidence`
- `architect` -> `generate-context` (support refresh), `project-understanding-confidence`
- `dev` -> `dev-story`

#### `artifact_policies`

Définit les artefacts que l'agent sait produire proprement.

Exemples :

- `pm` :
  - `feature_doc`
  - `backlog_story`
  - `backlog_epic`
- `architect` :
  - `architecture_doc`
  - `workspace_doc`
- `qa` :
  - `qa_review`
  - `bug_report`

#### `action_policies`

Définit les actions que l'agent peut demander en mode augmenté.

Exemples :

- `pm` :
  - create/update ticket via `nakiros-actions`
  - update backlog
- `architect` :
  - consult agent
  - update repo/workspace context
- `nakiros` :
  - consult agent
  - handoff agent
  - decision log

#### `menu`

Le menu reste utile, à la BMAD, mais il doit pointer vers :

- chat/advisory mode
- workflows
- commandes structurées

---

## 6. Schéma cible d'un workflow Nakiros

Un workflow Nakiros doit garder la discipline BMAD, mais déclarer plus explicitement ses sorties et ses compatibilités.

### Structure minimale

```text
workflows/{category}/{workflow-name}/
  workflow.yaml
  instructions.xml
  checklist.md
  templates/
  steps/
```

Tous les workflows n'ont pas besoin de tous ces fichiers, mais `workflow.yaml` et `instructions.xml` sont la base.

### Champs attendus dans `workflow.yaml`

- `name`
- `description`
- `author`
- `config_source`
- `installed_path`
- `instructions`
- `validation`
- `portable_mode`
- `runtime_mode`
- `artifacts_produced`
- `portable_outputs`
- `actions_allowed`

### Nouveaux champs recommandés

#### `portable_mode`

Décrit comment le workflow fonctionne sans Nakiros.

Exemple :

```yaml
portable_mode:
  supported: true
  output_root: "{project-root}/_nakiros/"
  notes: "Writes compact markdown artifacts locally when runtime is absent"
```

#### `runtime_mode`

Décrit ce que Nakiros ajoute.

Exemple :

```yaml
runtime_mode:
  supports_review: true
  supports_actions: true
  supports_multi_agent: false
```

#### `artifacts_produced`

Exemple :

```yaml
artifacts_produced:
  - backlog_story
  - feature_doc
```

#### `portable_outputs`

Exemple :

```yaml
portable_outputs:
  - "_nakiros/backlog/stories/"
  - "_nakiros/product/features/"
```

#### `actions_allowed`

Exemple :

```yaml
actions_allowed:
  - backlog.upsertStory
  - pm.create_ticket
  - review.open
```

---

## 7. Rôle des modules additionnels

Les modules évitent de dupliquer la même logique dans tous les agents/workflows.

Ils servent à factoriser :

- conventions `_nakiros/`
- formats d'artefacts
- protocoles runtime
- règles d'intégration

### Exemples

#### `modules/portable/local-artifacts.md`

Contient :

- la convention `_nakiros/`
- les règles de nommage
- les dossiers canoniques

#### `modules/domains/backlog-format.md`

Contient :

- formats `backlog_story`
- `backlog_epic`
- `backlog_task`
- `backlog_sprint`

#### `modules/domains/architecture-slicing.md`

Contient :

- règle `architecture/index.md`
- découpage en docs ciblées
- comment éviter un fichier monolithique

#### `modules/runtime/artifact-mutation.md`

Contient :

- `artifact_mutation`
- modes `proposal` et `applied`
- attentes côté review

#### `modules/integrations/pm-actions.md`

Contient :

- les `nakiros-actions` liées au PM tool configuré
- ce qu'un agent a le droit de demander
- quand créer ou mettre à jour un ticket
- quelle granularité de payload produire sans exposer l'issue tracker comme primitive directe

---

## 8. Règles de qualité pour les agents

### Q1 — Persona forte, logique stable

On garde l'exigence BMAD :

- ton clair
- principes forts
- rôle distinct

### Q2 — Réflexes explicites

Les comportements importants ne doivent pas être implicites.

Ils doivent être formulés comme réflexes ou modules réutilisables.

### Q3 — Pas de prose géante

Les agents doivent éviter de produire :

- de grands blocs bavards
- des specs trop longues
- des docs peu réutilisables

### Q4 — Production orientée artefact

Dès qu'on produit quelque chose de durable, il faut viser :

- un artefact canonique
- un chemin `_nakiros/` clair
- une taille compatible avec la réinjection en contexte

### Q5 — Dégradation propre hors Nakiros

Un agent ne doit jamais dépendre du runtime pour rester utile.

---

## 9. Règles de qualité pour les workflows

### Q1 — Un workflow doit être compréhensible seul

`workflow.yaml` doit décrire clairement :

- l'objectif
- les sorties
- les modes portable/augmenté

### Q2 — Les étapes doivent être utiles

On peut garder le micro-file style BMAD quand il apporte vraiment :

- contrôle
- qualité
- validation

Mais il ne faut pas éclater un workflow artificiellement.

### Q3 — Les sorties doivent être déclarées à l'avance

Un workflow doit annoncer ce qu'il produit.

### Q4 — La review ne doit pas être implicite

Si un workflow peut muter un artefact, il doit dire :

- s'il produit une `proposal`
- s'il peut produire un `applied`

### Q5 — Le workflow n'est pas un agent

Le workflow cadre une manière de faire.
Il ne remplace pas la persona.

---

## 10. Stratégie de migration depuis BMAD

La bonne stratégie n'est pas de “s'inspirer vaguement”.

La bonne stratégie est :

1. identifier les agents BMAD réellement utiles
2. identifier les workflows BMAD réellement robustes
3. les copier comme base de travail dans le bundle Nakiros
4. les normaliser au modèle `portable + runtime extensions`
5. les connecter aux artefacts `_nakiros/`
6. ajouter les modules Nakiros nécessaires

### Agents BMAD à forte valeur probable

- analyst / pm
- architect
- tech-writer
- sm
- qa
- brainstorming

### Types d'adaptation à prévoir

- remplacer `_bmad-output` par `_nakiros/`
- réduire la taille des outputs
- introduire les formats canoniques
- retirer les hypothèses purement locales quand elles bloquent la portabilité
- ajouter les extensions runtime Nakiros

---

## 11. Règles de non-régression architecturale

Quand on reprendra le bundle complet :

- ne pas modifier un agent isolé sans revoir son workflow principal
- ne pas modifier un workflow sans vérifier ses artefacts de sortie
- ne pas introduire une capacité runtime sans fallback portable
- ne pas écrire un module si la logique est purement spécifique à un seul agent

---

## 12. Décisions structurantes

### D1 — BMAD est la base méthodologique assumée

On ne repart pas de zéro.

### D2 — Les agents Nakiros ont deux couches

Portable core + runtime extensions.

### D3 — Le bundle doit intégrer des modules réutilisables

Pour éviter la duplication et rendre le système maintenable.

### D4 — `_nakiros/` est la cible portable de sortie

Les workflows doivent savoir produire vers ce format.

### D5 — Le runtime Nakiros ajoute de la puissance, pas une dépendance obligatoire

Le mode augmenté ne doit jamais casser le mode portable.

---

## 13. Ordre recommandé pour la suite

Avant de reprendre tous les agents :

1. finaliser la doc du registre d'actions
2. finaliser le cycle de vie complet d'un artefact
3. figer le schéma final des agents
4. figer le schéma final des workflows

Ensuite seulement :

1. reprendre les agents un par un
2. reprendre leurs workflows associés
3. extraire les modules communs
4. revalider l'ensemble du bundle comme système cohérent

Le catalogue d'actions qui alimente `action_policies`, `request_action` et les modules d'intégration est défini dans [nakiros-action-registry.md](/Users/thomasailleaume/Perso/timetrackerAgent/docs/architecture/nakiros-action-registry.md).

La cartographie concrète des sources BMAD à reprendre ou adapter est définie dans [nakiros-bmad-migration-map.md](/Users/thomasailleaume/Perso/timetrackerAgent/docs/architecture/nakiros-bmad-migration-map.md).

Le périmètre v1 figé avant reprise effective du bundle est défini dans [nakiros-v1-bundle-scope.md](/Users/thomasailleaume/Perso/timetrackerAgent/docs/architecture/nakiros-v1-bundle-scope.md).

La définition du futur agent de direction technique est détaillée dans [nakiros-cto-agent-model.md](/Users/thomasailleaume/Perso/timetrackerAgent/docs/architecture/nakiros-cto-agent-model.md).

La définition du futur agent de direction business est détaillée dans [nakiros-ceo-agent-model.md](/Users/thomasailleaume/Perso/timetrackerAgent/docs/architecture/nakiros-ceo-agent-model.md).
