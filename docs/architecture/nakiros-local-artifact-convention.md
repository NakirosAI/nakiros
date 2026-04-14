# Architecture — Convention locale `_nakiros/`

> **Statut : En cours.** La convention est définie et le parser existe dans `apps/desktop/src/utils/artifact-review.ts`. Les dossiers `_nakiros/` ne sont pas encore seedés dans les repos — adoption à faire lors du setup workspace.

> Document de référence pour le mode portable local-first.
> Il définit l'arborescence `_nakiros/`, les types d'artefacts portables et leurs formats canoniques.

---

## 1. Objectif

Le dossier `_nakiros/` est le point d'entrée portable des agents Nakiros dans un repo.

Il permet :

- de produire des artefacts utiles sans Desktop, sans SaaS et sans orchestrateur
- de conserver des conventions lisibles dans Git
- de préparer une future synchronisation sélective vers Nakiros Desktop / SaaS

Principe :

> **Tout ce qui a du sens dans le repo sans Nakiros peut vivre dans `_nakiros/`.**

`_nakiros/` est donc :

- visible
- versionnable
- mono-repo
- portable

Il ne remplace pas `~/.nakiros/`, qui reste le stockage runtime et workspace de Nakiros.

Contrepartie importante :

- `_nakiros/` = artefacts **repo-locaux**
- `~/.nakiros/workspaces/{workspaceSlug}/context/` = artefacts **workspace-globaux**

La vue d'architecture complète de Nakiros doit donc se lire en deux niveaux :

1. workspace-global pour comprendre le système entier
2. repo-local pour comprendre la mise en oeuvre d'un repo précis

---

## 2. Principes non négociables

### P1 — Repo-local only

Le contenu de `_nakiros/` appartient au repo courant.

En mode portable :

- pas de multi-repo natif
- pas de dépendance à un workspace cloud
- pas de référence obligatoire à un state externe

### P2 — Les fichiers doivent rester utiles à un humain

Un artefact `_nakiros/` doit être lisible, diffable et compréhensible dans GitHub ou un éditeur.

### P3 — Les formats doivent être compacts

On cherche des artefacts :

- courts
- normalisés
- réinjectables dans le contexte

### P4 — Le backlog a des formats canoniques stricts

Les formats backlog décrits ici doivent rester alignés avec l'implémentation actuelle dans [artifact-review.ts](/Users/thomasailleaume/Perso/timetrackerAgent/apps/desktop/src/utils/artifact-review.ts).

### P5 — Les documents workspace sont plus souples

Pour `workspace_doc`, Nakiros sait manipuler un fichier markdown cible complet.
La structure proposée ici est la convention recommandée, mais pas encore un contrat strict imposé par le runtime.

---

## 3. Arborescence recommandée

Structure recommandée :

```text
{repo}/
  _nakiros/
    workspace.yaml
    stack.md
    conventions.md
    llms.txt
    api.md

    architecture/
      index.md
      auth.md
      billing-export.md
      notifications.md

    decisions/
      adr-001-auth-boundary.md
      adr-002-billing-export.md

    product/
      prd-billing-export.md
      feature-export-monthly-csv.md
      features/
        auth-login.md
        auth-session-refresh.md
        billing-monthly-export.md

    research/
      market-exporting-options.md
      technical-jira-integration.md

    backlog/
      epics/
        epic-billing-observability.md
      stories/
        story-export-monthly-csv.md
      tasks/
        task-wire-csv-endpoint.md
      sprints/
        sprint-2026-03-24.md

    qa-reviews/
      qa-export-monthly-csv-2026-03-24.md

    incidents/
      inc-payment-timeout-postmortem.md

    dev-notes/
      auth-login-refactor.md
```

Tous les dossiers ne sont pas obligatoires.

Règle :

- créer uniquement les sous-dossiers utiles au repo
- ne pas précréer une arborescence vide

---

## 4. Rôles des emplacements

### Fichiers repo de base

À la racine de `_nakiros/` :

- `workspace.yaml`
- `stack.md`
- `conventions.md`
- `llms.txt`
- `api.md`

Ces fichiers décrivent le repo lui-même.

### `architecture/`

Contient la documentation d'architecture navigable du repo.

Structure recommandée :

- `architecture/index.md`
- un fichier par domaine ou feature technique importante

Usage :

- vue d'ensemble du repo
- cartographie des domaines techniques
- accès ciblé à un sous-ensemble d'architecture sans charger toute la documentation

Règle :

- `index.md` reste court et sert de sommaire
- les détails vivent dans des fichiers séparés
- le repo-local ne remplace pas la future vue globale workspace dans `~/.nakiros/workspaces/{workspaceSlug}/context/architecture/`

Exemples :

- `architecture/auth.md`
- `architecture/billing-export.md`
- `architecture/notifications.md`

### Articulation avec l'architecture workspace-globale

Quand Nakiros complet est disponible, cette arborescence a une contrepartie globale :

- `~/.nakiros/workspaces/{workspaceSlug}/context/architecture/index.md`
- `~/.nakiros/workspaces/{workspaceSlug}/context/architecture/{domain}.md`

Règle d'usage recommandée pour les agents :

1. lire le global d'abord quand la question dépasse un repo
2. lire ensuite seulement les slices `_nakiros/architecture/...` des repos concernés
3. écrire dans le global si la décision concerne plusieurs repos
4. écrire dans le local si la décision est propre à un repo

### `decisions/`

Contient les ADR et décisions durables.

Usage :

- arbitrages techniques
- arbitrages produit/tech
- décisions de contrat inter-module

### `product/`

Contient les artefacts produit mono-repo.

Usage :

- feature briefs
- PRD compacts
- specs de surface locale au repo

Sous-structure recommandée :

- fichiers globaux à la racine de `product/`
- `product/features/` pour les fiches feature compactes

Exemples :

- `product/features/auth-login.md`
- `product/features/billing-monthly-export.md`

### `research/`

Contient les notes de recherche utiles à la suite du projet.

Usage :

- benchmark technique
- analyse d'options
- notes d'investigation

### `backlog/`

Contient les artefacts backlog portables.

Sous-dossiers canoniques :

- `epics/`
- `stories/`
- `tasks/`
- `sprints/`

### `qa-reviews/`

Contient les revues QA portables.

### `incidents/`

Contient post-mortems et analyses d'incident.

### `dev-notes/`

Contient des notes temporaires ou techniques utiles au repo.

Ce dossier ne doit pas devenir une poubelle.

---

## 5. Règles de nommage

### Extensions

- utiliser `.md` pour tous les artefacts documentaires
- réserver `.yaml` à `workspace.yaml` ou à des métadonnées techniques spécifiques

### Slugs de fichiers

Recommandation :

- minuscules
- mots séparés par `-`
- pas d'espaces
- pas d'accents

Exemples :

- `story-export-monthly-csv.md`
- `prd-billing-export.md`
- `adr-002-billing-export.md`

### Préfixes recommandés

Pour éviter les collisions et rendre la lecture immédiate :

- `adr-` pour `decisions/`
- `prd-` ou `feature-` pour `product/`
- `epic-`, `story-`, `task-`, `sprint-` pour `backlog/`
- `qa-` pour `qa-reviews/`
- `inc-` pour `incidents/`

---

## 6. Types d'artefacts portables

Les types principaux sont :

- `workspace_doc`
- `architecture_doc`
- `feature_doc`
- `ux_spec`
- `backlog_epic`
- `backlog_story`
- `backlog_task`
- `backlog_sprint`
- `qa_review`
- `incident_postmortem`
- `dev_note`

Statut :

- `backlog_*` : format canonique déjà aligné avec l'app
- `workspace_doc`, `architecture_doc`, `feature_doc` : conventions recommandées
- `ux_spec` : convention recommandée pour les spécifications UX
- `qa_review`, `incident_postmortem`, `dev_note` : conventions légères recommandées

---

## 7. Format canonique — `backlog_story`

Format strict, aligné sur [artifact-review.ts](/Users/thomasailleaume/Perso/timetrackerAgent/apps/desktop/src/utils/artifact-review.ts).

```md
---
kind: backlog_story
id: story-export-monthly-csv
title: Export Monthly Device Status CSV
status: backlog
priority: medium
storyPoints: 5
epicId: epic-billing-observability
sprintId:
assignee:
---

## Description

As an accounting manager, I want to export the monthly device status as CSV so that I can reconcile billing.

## Acceptance Criteria

- A CSV export button is visible on the monthly billing screen
- The exported file contains device status for the selected month
- The file is downloadable with a stable column order
```

Champs frontmatter supportés :

- `kind`
- `id`
- `title`
- `status`
- `priority`
- `storyPoints`
- `epicId`
- `sprintId`
- `assignee`

Sections supportées :

- `Description`
- `Acceptance Criteria`

---

## 8. Format canonique — `backlog_epic`

```md
---
kind: backlog_epic
id: epic-billing-observability
name: Billing Observability
status: backlog
color: blue
---

## Description

Improve billing exports, diagnostics, and monthly reconciliation visibility.
```

Champs frontmatter :

- `kind`
- `id`
- `name`
- `status`
- `color`

Sections :

- `Description`

---

## 9. Format canonique — `backlog_task`

```md
---
kind: backlog_task
id: task-wire-csv-endpoint
title: Wire monthly CSV export endpoint
type: technical
status: todo
assignee:
---

## Description

Implement the service and route needed to generate the monthly CSV export.
```

Champs frontmatter :

- `kind`
- `id`
- `title`
- `type`
- `status`
- `assignee`

Sections :

- `Description`

---

## 10. Format canonique — `backlog_sprint`

```md
---
kind: backlog_sprint
id: sprint-2026-03-24
name: Sprint 12
status: planning
startDate:
endDate:
---

## Goal

Ship the first end-to-end version of monthly CSV export with QA validation.
```

Champs frontmatter :

- `kind`
- `id`
- `name`
- `status`
- `startDate`
- `endDate`

Sections :

- `Goal`

---

## 11. Convention recommandée — `workspace_doc`

Contrairement aux artefacts backlog, `workspace_doc` n'est pas encore imposé par un parseur strict dans l'app.

La convention recommandée est :

```md
---
kind: workspace_doc
docType: decision
id: adr-001-auth-boundary
title: Auth Boundary Between API and Frontend
status: draft
updatedAt: 2026-03-23
---

## Summary

Move token refresh ownership to the API gateway.

## Context

The frontend currently owns refresh timing and creates duplicate retry logic.

## Decision

The API gateway becomes the only refresh authority.

## Consequences

- Frontend auth code becomes simpler
- API gateway becomes a critical dependency
```

Frontmatter recommandé :

- `kind: workspace_doc`
- `docType`
- `id`
- `title`
- `status`
- `updatedAt`

Sections recommandées :

- `Summary`
- `Context`
- `Decision` ou `Content`
- `Consequences` ou `Notes`

Règle :

- préférer des documents courts
- éviter les sections vides
- ne pas écrire un PRD de 20 pages si un brief compact suffit

---

## 12. Convention recommandée — `architecture_doc`

Les documents d'architecture doivent être fragmentés par domaine ou feature technique, avec un index léger.

### `architecture/index.md`

Ce fichier doit rester un sommaire.

Exemple :

```md
---
kind: architecture_doc
docType: architecture_index
id: repo-architecture-index
title: Repository Architecture Index
status: active
updatedAt: 2026-03-23
---

## Overview

This repository is organized around three main technical domains:

- Authentication
- Billing Export
- Notifications

## Sections

- [Authentication](./auth.md)
- [Billing Export](./billing-export.md)
- [Notifications](./notifications.md)
```

Règles :

- pas de long contenu détaillé dans `index.md`
- seulement une vue d'ensemble et des pointeurs
- un agent doit pouvoir lire `index.md`, choisir la bonne section, puis charger seulement le fichier utile

### Fichier de domaine ou feature technique

Exemple `architecture/auth.md` :

```md
---
kind: architecture_doc
docType: domain_architecture
id: auth
title: Authentication Architecture
status: active
updatedAt: 2026-03-23
---

## Summary

Authentication is split between the API gateway, the session store, and the frontend shell.

## Entry Points

- `src/auth/*`
- `src/session/*`

## Responsibilities

- API gateway validates and refreshes tokens
- frontend only consumes authenticated state

## Dependencies

- Session store
- API gateway middleware

## Related Decisions

- `../decisions/adr-001-auth-boundary.md`
```

Règles :

- un fichier = un domaine ou une feature technique identifiable
- sections courtes
- liens vers décisions, pas duplication du contenu ADR
- inclure si possible des entry points code pour guider l'agent

---

## 13. Convention recommandée — `feature_doc`

Les `feature_doc` décrivent une feature de manière compacte, orientée produit/implémentation, sans remplacer backlog ni PRD.

Emplacement recommandé :

- `product/features/{feature-slug}.md`

Exemple :

```md
---
kind: feature_doc
id: billing-monthly-export
title: Monthly Billing Export
status: active
updatedAt: 2026-03-23
---

## Summary

Allow accounting managers to export monthly device status as CSV.

## User Value

Reduces manual reconciliation work each month.

## Main Flow

1. User opens monthly billing screen
2. User clicks export
3. System generates and downloads CSV

## Technical Notes

- Depends on billing aggregation service
- Uses export endpoint in API

## Related Files

- `../architecture/billing-export.md`
- `../backlog/stories/story-export-monthly-csv.md`
```

Règles :

- rester court
- expliquer "ce que fait la feature"
- décrire le flux principal
- pointer vers l'architecture détaillée si nécessaire
- pointer vers backlog ou PRD si disponibles

---

## 14. Convention recommandée — `ux_spec`

Les `ux_spec` décrivent les spécifications UX d'une feature ou d'un produit : flows utilisateurs, états d'interface, règles d'accessibilité et décisions d'interaction.

Deux emplacements selon la portée :

- `product/ux-design-specification.md` pour une spécification UX cross-feature ou niveau produit
- `product/features/{feature}.md` pour les décisions UX d'une feature bornée

Exemple `product/ux-design-specification.md` :

```md
---
kind: ux_spec
id: ux-billing-export
title: UX Specification — Monthly Billing Export
status: draft
updatedAt: 2026-03-24
---

## Summary

Monthly billing export must be accessible from the billing screen with a single action, with clear feedback on progress and error states.

## User Flows

1. User opens monthly billing screen
2. User clicks "Export CSV"
3. System shows progress indicator
4. File downloads automatically on success

## States

- Default: export button visible and enabled
- Loading: button disabled, spinner shown
- Success: download triggers, success toast
- Error: inline error message with retry option
- Empty: export button hidden or disabled with tooltip

## Accessibility

- Export button accessible via keyboard
- Loading state communicated via aria-live region
- Error messages linked to the triggering action
```

Frontmatter recommandé :

- `kind: ux_spec`
- `id`
- `title`
- `status`
- `updatedAt`

Sections recommandées :

- `Summary`
- `User Flows`
- `States`
- `Accessibility`
- `Open Questions` (optionnel)

Règles :

- décrire les flows depuis la perspective utilisateur
- lister tous les états significatifs (empty, loading, error, success)
- inclure les exigences d'accessibilité dès la spec
- rester compact : pas de prose décorative

---

## 15. Conventions légères — `qa_review`, `incident_postmortem`, `dev_note`

Ces artefacts peuvent utiliser le même style :

```md
---
kind: qa_review
id: qa-export-monthly-csv-2026-03-24
title: QA Review — Monthly CSV Export
status: draft
updatedAt: 2026-03-24
---

## Summary

Export works for the happy path but fails when month data is missing.

## Findings

- Missing empty-state handling
- Filename format is inconsistent
```

La structure exacte peut varier, mais doit respecter :

- frontmatter minimal stable
- sections courtes et explicites
- nommage cohérent

---

## 16. Règles d'écriture pour les agents

Quand un agent écrit dans `_nakiros/`, il doit :

- choisir le bon dossier avant d'écrire
- respecter le format canonique de l'artefact cible
- écrire le contenu final complet, pas un patch
- éviter de multiplier les fichiers dupliqués
- préférer la mise à jour d'un artefact existant si c'est la même intention
- privilégier `architecture/index.md` comme porte d'entrée vers les docs d'architecture
- fragmenter les sujets par domaine/feature au lieu d'allonger un seul fichier massif

En mode portable :

- l'agent peut écrire directement le fichier
- il peut aussi simplement rendre le contenu si l'outil ne permet pas d'écriture

En mode Nakiros augmenté :

- l'agent peut soit proposer la mutation avant write
- soit signaler qu'elle a déjà été appliquée
- la review peut alors être ouverte avant ou après écriture

---

## 17. Relation avec les autres stockages

Résumé :

- `{repo}/_nakiros/` = artefacts utiles au repo et portables
- `~/.nakiros/` = stockage runtime, workspace, conversations, reviews, sync

Règle pratique :

> **si cela doit survivre dans le repo et rester utile sans Nakiros, c'est dans `_nakiros/`**

---

## 18. Synchronisation future vers le SaaS

Direction cible :

- sync sélective des artefacts `_nakiros/`
- validation humaine avant publication cloud
- enrichissement du contexte partagé à partir des artefacts locaux

La sync future ne doit pas casser le local-first.

Le modèle visé est :

1. l'agent écrit ou propose un artefact local
2. l'humain valide
3. Nakiros peut publier cet artefact dans le contexte SaaS si pertinent

---

## 19. Implications pour la suite

Les prochaines étapes cohérentes sont :

1. figer l'arborescence minimale `_nakiros/` utilisée par les agents du bundle
2. aligner les prompts agents sur ces chemins et formats
3. introduire `architecture/index.md` comme point d'entrée de contexte partiel
4. connecter la review Nakiros aux mutations `proposal` et `applied`
5. ajouter plus tard la sync `_nakiros/` -> SaaS avec validation
