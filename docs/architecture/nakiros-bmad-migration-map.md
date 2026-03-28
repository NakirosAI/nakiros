# Architecture — Cartographie BMAD -> Nakiros

> Document de travail pour la future reprise complète du bundle `packages/agents-bundle/`.
> Il identifie quoi reprendre de BMAD, quoi adapter, quoi fusionner et quoi créer spécifiquement pour Nakiros.

---

## 1. Objectif

Le but n'est pas de réinventer tous les agents et workflows.

Le but est de :

- reprendre la meilleure base BMAD
- l'adapter au modèle Nakiros
- éviter les doublons inutiles
- identifier clairement les manques réels

Principe :

> **BMAD fournit la base méthodologique. Nakiros fournit la portabilité structurée, l'orchestration augmentée et l'intégration produit.**

---

## 2. Décision de périmètre v1

Décision validée :

> **la v1 du bundle reprend tout le noyau BMAD utile**

Cela inclut :

- tous les agents BMAD jugés utiles au produit cible
- tous les workflows BMAD jugés utiles au produit cible

Cela n'inclut pas encore comme priorité de reprise :

- `cto` comme agent de direction technique
- `ceo` comme agent de direction business
- les workflows purement spécifiques à Nakiros
- les modules runtime très spécialisés qui n'ont pas d'équivalent BMAD

Conséquence :

- la v1 vise d'abord une base BMAD-backed complète et cohérente
- la phase suivante ajoutera les briques spécifiques Nakiros au-dessus

---

## 3. Règles de migration

Pour chaque agent ou workflow BMAD, on choisit une seule stratégie :

- `adopt` : reprendre presque tel quel
- `adapt` : reprendre comme base, mais réécrire partiellement pour Nakiros
- `merge` : fusionner dans un autre agent/workflow Nakiros
- `drop` : ne pas reprendre
- `new` : créer côté Nakiros car BMAD n'a pas l'équivalent

Règle de décision :

- on ne crée du neuf que si BMAD ne couvre pas déjà bien le besoin
- on ne garde pas un agent distinct si sa valeur peut être absorbée proprement dans un autre

---

## 4. Cartographie des agents

### Vue synthétique

| BMAD | Valeur | Cible Nakiros | Stratégie | Commentaire |
|---|---|---|---|---|
| `analyst` | forte | `analyst` ou modules discovery PM | `adapt` | très utile pour recherche/découverte, mais peut aussi alimenter PM/brainstorming |
| `architect` | très forte | `architect` | `adapt` | base majeure à conserver |
| `dev` | forte | `dev` | `adapt` | à garder, avec séparation pair-programming vs delivery |
| `pm` | très forte | `pm` | `adapt` | base majeure à conserver |
| `qa` | moyenne à forte | `qa` | `adapt` | utile, mais à réaligner sur la stratégie qualité Nakiros |
| `sm` | forte | `sm` | `adapt` | utile pour backlog/sprint/process |
| `tech-writer` | très forte | `tech-writer` | `adopt/adapt` | candidat très fort pour ajout direct à Nakiros |
| `ux-designer` | forte | `ux-designer` | `adapt` | manque actuel probable côté Nakiros |
| `quick-flow-solo-dev` | faible comme agent durable | aucun agent dédié | `merge` | à absorber dans workflows rapides Dev |

### Recommandation détaillée

#### `analyst`

Statut recommandé : `adapt`

Pourquoi :

- très utile pour recherche marché/domaine/technique
- couvre un besoin de discovery plus large que le PM pur
- bonne base pour enrichir `product-discovery`, `brainstorming`, et piloter les découvertes avant un éventuel refresh de contexte

Deux options possibles :

1. créer un vrai agent `analyst` Nakiros
2. ne pas exposer d'agent utilisateur autonome et réutiliser ses modules de recherche dans `pm` et `brainstorming`

Ma recommandation :

- garder un **vrai agent `analyst`**
- mais comme agent de discovery et recherche, pas comme agent central permanent

#### `architect`

Statut recommandé : `adapt`

Pourquoi :

- c'est un des meilleurs candidats à reprendre presque directement
- forte valeur pour architecture, readiness, génération de contexte
- se marie très bien avec `_nakiros/architecture/index.md` et docs ciblées

Travail d'adaptation :

- portabilité `_nakiros/`
- architecture fragmentée
- review / runtime Nakiros
- multi-repo plus explicite

#### `dev`

Statut recommandé : `adapt`

Pourquoi :

- très utile comme agent d'exécution et de pair-programming
- mais doit être mieux séparé entre :
  - aide ponctuelle
  - exécution workflowée

Travail d'adaptation :

- lecture sélective de `_nakiros/`
- distinction claire pair-programming / delivery
- production d'artefacts techniques compacts

#### `pm`

Statut recommandé : `adapt`

Pourquoi :

- très forte base BMAD
- déjà proche de ce que tu veux pour Nakiros

Travail d'adaptation :

- PM tool via `nakiros-actions`
- artefacts plus compacts
- backlog canonique
- distinction feature doc / PRD / story

#### `qa`

Statut recommandé : `adapt`

Pourquoi :

- utile, mais la version BMAD est assez focalisée “génération rapide de tests”
- Nakiros a besoin d'un QA plus large :
  - review
  - quality gate
  - bug reports
  - release readiness

Travail d'adaptation :

- moins “juste générer des tests”
- plus “qualité de livraison et review”

#### `sm`

Statut recommandé : `adapt`

Pourquoi :

- bon agent pour backlog hygiene, sprint planning, sequencing
- très cohérent avec Nakiros Delivery

Travail d'adaptation :

- backlog Nakiros
- artefacts sprint compacts
- orchestration avec PM / Dev / QA

#### `tech-writer`

Statut recommandé : `adopt/adapt`

Pourquoi :

- très forte valeur
- excellent candidat pour produire :
  - docs structurées
  - ADR
  - guides
  - explications

Travail d'adaptation :

- `_nakiros/` comme cible
- docs plus compactes et réinjectables
- éventuellement usage de templates Nakiros

Ma recommandation :

- ajouter clairement `tech-writer` au bundle cible

#### `ux-designer`

Statut recommandé : `adapt`

Pourquoi :

- besoin réel si Nakiros veut aller au-delà du backlog brut
- complète très bien PM + Architect

Travail d'adaptation :

- artefacts UX plus compacts
- raccord avec `feature_doc`, `PRD`, `architecture_doc`
- potentiellement review de flows UI

Ma recommandation :

- ajouter `ux-designer` au bundle cible

#### `quick-flow-solo-dev`

Statut recommandé : `merge`

Pourquoi :

- ce n'est pas une bonne primitive d'agent à long terme
- le besoin est réel, mais doit vivre dans :
  - des quick workflows
  - ou des modes rapides de `dev`

Ma recommandation :

- ne pas garder comme agent autonome

---

## 5. Bundle agents cible recommandé

### V1 — agents BMAD-backed

- `pm` — `adapt`
- `architect` — `adapt`
- `dev` — `adapt`
- `analyst` — `adapt`
- `sm` — `adapt`
- `qa` — `adapt`
- `tech-writer` — `adopt/adapt`
- `ux-designer` — `adapt`

### V1 — agents discovery / design
- `brainstorming` — `adapt`

### Phase 2 — agents spécifiques Nakiros

- `nakiros` — `new`

### Cibles proposées

| Agent cible Nakiros | Source principale |
|---|---|
| `pm` | BMAD PM |
| `architect` | BMAD Architect |
| `dev` | BMAD Dev |
| `analyst` | BMAD Analyst |
| `brainstorming` | Nakiros existant + BMAD brainstorming style |
| `ux-designer` | BMAD UX Designer |
| `tech-writer` | BMAD Tech Writer |
| `sm` | BMAD SM |
| `qa` | BMAD QA |
| `nakiros` | nouveau |

---

## 6. Cartographie des workflows

### Vue synthétique

| BMAD workflow | Cible Nakiros | Stratégie | Commentaire |
|---|---|---|---|
| `create-product-brief` | `product-discovery` | `adapt/merge` | très bonne base discovery |
| `domain-research` | `domain-research` ou modules Analyst | `adapt` | utile, manque probable |
| `market-research` | `market-research` ou modules Analyst | `adapt` | utile, manque probable |
| `technical-research` | `technical-research` ou modules Architect | `adapt` | utile, manque probable |
| `create-prd` | `pm-feature` / futur `create-prd` | `adapt` | besoin réel à conserver |
| `edit-prd` | futur `edit-prd` | `adapt` | manque actuel |
| `validate-prd` | futur `validate-prd` | `adapt` | manque actuel |
| `create-ux-design` | futur `ux-design` | `adapt` | manque actuel important |
| `check-implementation-readiness` | readiness Nakiros | `adapt` | très utile |
| `create-architecture` | futur `create-architecture` | `adapt` | très utile |
| `create-epics-and-stories` | `plan-feature` + `create-story` | `merge/adapt` | à découper proprement |
| `code-review` | `qa-review` / futur `code-review` | `adapt` | probablement à garder distinct |
| `correct-course` | futur `correct-course` | `adapt` | besoin réel |
| `create-story` (implémentation) | `create-story` | `adapt` | base forte |
| `dev-story` | `dev-story` | `adapt` | base forte |
| `retrospective` | `sprint` / futur `retrospective` | `adapt` | utile |
| `sprint-planning` | `sprint` | `adapt` | utile |
| `sprint-status` | futur `sprint-status` | `adapt` | utile |
| `quick-dev` | quick workflows Nakiros | `merge` | pas comme primitive centrale |
| `quick-spec` | quick workflows Nakiros | `merge` | utile en mode rapide |
| `document-project` | `generate-context` + `tech-writer` | `merge/adapt` | forte base pour un workflow de refresh/documentation |
| `generate-project-context` | `generate-context` | `adapt` | base très proche pour un workflow de refresh |
| `qa-generate-e2e-tests` | futur `qa-generate-tests` | `adapt` | utile |

---

## 7. Recommandation workflow par workflow

### À reprendre vite

Ceux-là ont la meilleure valeur immédiate :

- `create-architecture`
- `check-implementation-readiness`
- `create-prd`
- `create-epics-and-stories`
- `document-project`
- `generate-project-context`
- `dev-story`
- `create-story`
- `sprint-planning`
- `retrospective`

### V1 — on les prend tous

Décision validée :

- tous les workflows BMAD listés comme utiles dans cette cartographie entrent dans le périmètre v1
- même ceux qui arriveront plus tard dans l'ordre de migration restent **dans la cible v1**

### À fusionner ou redistribuer

- `create-product-brief` -> `product-discovery`
- `quick-spec` -> quick mode PM/Architect
- `quick-dev` -> quick mode Dev

### Phase 2 — à créer spécifiquement côté Nakiros

- `nakiros-room-decision`
- `artifact-review-resolution`
- `pm-tool-sync`
- `multi-repo-context-propagation`
- `hotfix-incident-room`

---

## 8. Manques réels à créer côté Nakiros

Ce qu'on ne trouvera pas tel quel dans BMAD :

### Agent

- `nakiros`
- `hotfix` moderne relié au runtime Nakiros

### Workflows

- workflow de review d'artefact
- workflow de propagation `_nakiros/` -> contexte SaaS
- workflow d'orchestration de room multi-agent
- workflow d'actions PM tool unifiées

### Modules

- `artifact-mutation`
- `workflow-state`
- `pm-actions`
- `backlog-format`
- `architecture-slicing`
- `feature-doc-format`

---

## 9. Ordre recommandé de reprise

### Vague 1 — cœur produit/architecture

- `pm`
- `architect`
- `analyst`
- workflows :
  - `create-architecture`
  - `create-story`
  - `pm-feature`
  - `plan-feature`
  - `check-implementation-readiness`
  - `create-prd`
  - `validate-prd`

### Vague 2 — delivery

- `dev`
- `sm`
- `qa`
- workflows :
  - `dev-story`
  - `sprint-planning`
  - `retrospective`
  - `qa-review`
  - `code-review`
  - `correct-course`
  - `sprint-status`

### Vague 3 — discovery/documentation

- `brainstorming`
- `tech-writer`
- `ux-designer`
- workflows :
  - `product-discovery`
  - `create-prd`
  - `edit-prd`
  - `ux-design`
  - `document-project`
  - `generate-context`
  - `market-research`
  - `domain-research`
  - `technical-research`
  - `create-product-brief`
  - `generate-project-context`
  - `create-epics-and-stories`
  - `qa-generate-e2e-tests`

### Vague 4 — spécifique Nakiros

- `nakiros`
- review workflows
- sync workflows
- room/orchestration workflows

---

## 10. Décisions structurantes

### D1 — On reprend BMAD comme base de migration, pas seulement comme inspiration

La qualité BMAD est trop utile pour repartir de zéro.

### D2 — Tous les agents BMAD ne deviennent pas forcément des agents Nakiros 1:1

Certains seront fusionnés ou absorbés.

### D3 — `tech-writer` et `ux-designer` sont des candidats sérieux à ajouter

Ils comblent de vrais trous côté bundle actuel.

### D4 — `cto` et `ceo` restent spécifiques à la plateforme

BMAD n'a pas d'équivalent direct pour ces rôles de direction.

### D5 — La migration doit se faire par vagues cohérentes

Agent + workflows associés, jamais en patch isolé.

### D6 — La v1 inclut tout le noyau BMAD utile

On ne fait pas une v1 minimale amputée.

---

## 11. Suite logique

Après cette cartographie, la prochaine étape cohérente est :

1. figer la liste cible des agents BMAD-backed de la v1
2. figer la liste cible des workflows BMAD-backed de la v1
3. décider pour chaque item :
   - source BMAD exacte
   - stratégie `adopt / adapt / merge / new`
4. seulement ensuite reprendre le bundle fichier par fichier

Le périmètre v1 figé est documenté dans [nakiros-v1-bundle-scope.md](/Users/thomasailleaume/Perso/timetrackerAgent/docs/architecture/nakiros-v1-bundle-scope.md).

La définition du futur agent `cto` est détaillée dans [nakiros-cto-agent-model.md](/Users/thomasailleaume/Perso/timetrackerAgent/docs/architecture/nakiros-cto-agent-model.md).
