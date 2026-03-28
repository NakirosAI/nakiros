# Architecture — Périmètre V1 du Bundle BMAD-backed

> Document d'exécution.
> Il fige le périmètre v1 du bundle agents/workflows à reprendre depuis BMAD avant l'ajout des briques spécifiques Nakiros.

---

## 1. Décision de périmètre

La v1 du bundle Nakiros couvre :

- tous les agents BMAD jugés utiles au produit cible
- tous les workflows BMAD jugés utiles au produit cible
- leur adaptation au modèle Nakiros :
  - mode portable `_nakiros/`
  - artefacts compacts
  - `nakiros-actions`
  - compatibilité runtime augmentée

La v1 ne couvre pas encore comme priorité :

- `cto` comme agent de direction technique
- `ceo` comme agent de direction business
- les workflows purement spécifiques à Nakiros
- les modules runtime avancés sans équivalent BMAD direct

Principe :

> **v1 = socle BMAD complet et adapté ; v2 = surcouche spécifique Nakiros**

---

## 2. Agents V1 figés

### Liste finale

| Agent cible v1 | Source BMAD | Stratégie | Statut attendu |
|---|---|---|---|
| `pm` | `_bmad/bmm/agents/pm.md` | `adapt` | agent cœur |
| `architect` | `_bmad/bmm/agents/architect.md` | `adapt` | agent cœur |
| `dev` | `_bmad/bmm/agents/dev.md` | `adapt` | agent cœur |
| `analyst` | `_bmad/bmm/agents/analyst.md` | `adapt` | agent discovery |
| `sm` | `_bmad/bmm/agents/sm.md` | `adapt` | agent delivery/process |
| `qa` | `_bmad/bmm/agents/qa.md` | `adapt` | agent qualité |
| `tech-writer` | `_bmad/bmm/agents/tech-writer/tech-writer.md` | `adopt/adapt` | agent documentation |
| `ux-designer` | `_bmad/bmm/agents/ux-designer.md` | `adapt` | agent design |
| `brainstorming` | BMAD brainstorming patterns + agent Nakiros existant | `merge/adapt` | agent exploration |

### Hors v1

| Agent | Raison |
|---|---|
| `cto` | agent de direction technique spécifique Nakiros, traité après le socle |
| `ceo` | agent de direction business spécifique Nakiros, traité après `cto` |
| `quick-flow-solo-dev` | absorbé par `dev` et par des workflows rapides |

---

## 3. Workflows V1 figés

### Liste finale

| Workflow cible v1 | Source BMAD | Stratégie | Catégorie |
|---|---|---|---|
| `product-discovery` | `create-product-brief` | `adapt/merge` | discovery |
| `generate-context` | `document-project` + `generate-project-context` | `adapt/merge` | discovery-support |
| `domain-research` | `workflow-domain-research.md` | `adapt` | discovery |
| `market-research` | `workflow-market-research.md` | `adapt` | discovery |
| `technical-research` | `workflow-technical-research.md` | `adapt` | discovery |
| `create-prd` | `workflow-create-prd.md` | `adapt` | product |
| `edit-prd` | `workflow-edit-prd.md` | `adapt` | product |
| `validate-prd` | `workflow-validate-prd.md` | `adapt` | product |
| `ux-design` | `create-ux-design/workflow.md` | `adapt` | design |
| `create-architecture` | `create-architecture/workflow.md` | `adapt` | architecture |
| `check-implementation-readiness` | `check-implementation-readiness/workflow.md` | `adapt` | architecture/readiness |
| `create-epics-and-stories` | `create-epics-and-stories/workflow.md` | `adapt/merge` | planning |
| `create-story` | `4-implementation/create-story/workflow.yaml` | `adapt` | planning/delivery |
| `dev-story` | `4-implementation/dev-story/workflow.yaml` | `adapt` | delivery |
| `code-review` | `4-implementation/code-review/workflow.yaml` | `adapt` | quality |
| `correct-course` | `4-implementation/correct-course/workflow.yaml` | `adapt` | delivery/process |
| `retrospective` | `4-implementation/retrospective/workflow.yaml` | `adapt` | reporting |
| `sprint-planning` | `4-implementation/sprint-planning/workflow.yaml` | `adapt` | reporting |
| `sprint-status` | `4-implementation/sprint-status/workflow.yaml` | `adapt` | reporting |
| `document-project` | `document-project/workflow.yaml` | `adapt/merge` | documentation/context |
| `generate-project-context` | `generate-project-context/workflow.md` | `adapt` | documentation/context |
| `qa-generate-tests` | `qa-generate-e2e-tests/workflow.yaml` | `adapt` | quality |
| `quick-spec` | `bmad-quick-flow/quick-spec/workflow.md` | `merge` | quick flow |
| `quick-dev` | `bmad-quick-flow/quick-dev/workflow.md` | `merge` | quick flow |

### Hors v1

| Workflow | Raison |
|---|---|
| `nakiros-room-decision` | spécifique Nakiros |
| `artifact-review-resolution` | spécifique Nakiros |
| `pm-tool-sync` | spécifique Nakiros |
| `multi-repo-context-propagation` | spécifique Nakiros |
| `hotfix-incident-room` | spécifique Nakiros |

---

## 4. Stratégie `adopt / adapt / merge`

### `adopt`

Utiliser quand :

- la structure BMAD est déjà bonne
- les sorties sont proches du besoin Nakiros
- l'effort doit surtout porter sur les chemins et la portabilité

Candidat principal :

- `tech-writer`

### `adapt`

Utiliser quand :

- la base BMAD est forte
- mais le comportement doit être réécrit pour :
  - `_nakiros/`
  - outputs compacts
  - `nakiros-actions`
  - mode portable vs augmenté

Candidats principaux :

- `pm`
- `architect`
- `dev`
- `analyst`
- `sm`
- `qa`
- `ux-design`
- la majorité des workflows

### `merge`

Utiliser quand :

- BMAD couvre une capacité utile
- mais pas comme entité autonome durable dans Nakiros

Candidats principaux :

- `quick-spec`
- `quick-dev`
- une partie de `create-product-brief` dans `product-discovery`
- une partie de `document-project` dans `generate-context` comme workflow de support / refresh

---

## 5. Livrables attendus de la V1

Quand la V1 sera terminée, on doit avoir :

- un bundle agents/workflows complet sans `nakiros`
- tous les agents cœur BMAD-backed disponibles
- des workflows portables pouvant produire dans `_nakiros/`
- des artefacts backlog canoniques
- une documentation plus compacte et plus réinjectable
- des agents capables de fonctionner hors Nakiros
- des extensions runtime compatibles quand Nakiros est présent

La V1 n'a pas besoin de résoudre :

- l'orchestration conversationnelle complète
- la room multi-agent pilotée par `nakiros`
- la sync SaaS avancée des artefacts

---

## 6. Ordre d'exécution recommandé

### Vague 1 — cœur produit / architecture

Agents :

- `pm`
- `architect`
- `analyst`

Workflows :

- `create-architecture`
- `check-implementation-readiness`
- `create-prd`
- `edit-prd`
- `validate-prd`
- `create-epics-and-stories`
- `create-story`
- `product-discovery`

### Vague 2 — delivery

Agents :

- `dev`
- `sm`
- `qa`

Workflows :

- `dev-story`
- `code-review`
- `correct-course`
- `sprint-planning`
- `sprint-status`
- `retrospective`
- `qa-generate-tests`

### Vague 3 — design / documentation

Agents :

- `tech-writer`
- `ux-designer`
- `brainstorming`

Workflows :

- `ux-design`
- `document-project`
- `generate-project-context`
- `domain-research`
- `market-research`
- `technical-research`

### Vague 4 — quick flows et harmonisation

Workflows :

- `quick-spec`
- `quick-dev`

Puis :

- extraction des modules communs
- harmonisation prompts / workflows / artefacts
- validation globale du bundle

---

## 7. Critères d'acceptation de la V1

La V1 est considérée comme cadrée quand :

- la liste des agents est figée
- la liste des workflows est figée
- chaque item a une source BMAD identifiée
- chaque item a une stratégie `adopt / adapt / merge`
- l'ordre de reprise est clair

La V1 est considérée comme terminée plus tard quand :

- tous les agents v1 ont été repris
- tous les workflows v1 ont été repris
- les sorties respectent `_nakiros/`
- les `nakiros-actions` sont cohérentes
- le bundle fonctionne sans dépendre de `nakiros`

---

## 8. Relations avec les autres docs

Ce document complète :

- [nakiros-bmad-migration-map.md](/Users/thomasailleaume/Perso/timetrackerAgent/docs/architecture/nakiros-bmad-migration-map.md)
- [nakiros-agent-workflow-bundle-architecture.md](/Users/thomasailleaume/Perso/timetrackerAgent/docs/architecture/nakiros-agent-workflow-bundle-architecture.md)
- [nakiros-local-artifact-convention.md](/Users/thomasailleaume/Perso/timetrackerAgent/docs/architecture/nakiros-local-artifact-convention.md)
- [nakiros-action-registry.md](/Users/thomasailleaume/Perso/timetrackerAgent/docs/architecture/nakiros-action-registry.md)

Il sert de référence de périmètre avant la reprise effective fichier par fichier du bundle.
