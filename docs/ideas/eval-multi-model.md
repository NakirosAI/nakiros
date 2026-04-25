---
title: Eval multi-modèle (Haiku / Sonnet / Opus) + mode VS
date: 2026-04-22
status: exploring
author: brainstorm-agent
---

# Eval multi-modèle (Haiku / Sonnet / Opus) + mode VS

## Problème

**Persona** : dev de skill (auteur, pas utilisateur final du skill).
**Besoin** : vérifier (a) que le skill répond bien aux attentes et (b) **sur quel modèle le moins cher il reste performant**, pour documenter un modèle recommandé et optimiser les coûts.
**Solution imaginée** : picker de modèle dans le runner d'eval existant + mode VS parallèle (Haiku + Sonnet + Opus en simultané) comparés à la baseline `without_skill`.

## Hypothèses critiques

- **H1** — Il existe une variance de qualité mesurable entre Haiku/Sonnet/Opus sur les eval-suites Nakiros *suffisante pour changer une décision* (sinon la feature n'a aucune valeur).
- **H2** — Le surcoût du mode VS (≈3× tokens d'un run normal) est **acceptable pour un dev de skill** qui le lance manuellement, de manière opt-in.
- **H3** — Le schéma de stockage actuel (`iteration-N/benchmark.json`) peut accueillir une dimension `model` sans casser la matrix existante ni les analyses de `eval-matrix.ts`.

## Contexte technique observé

- `runner-core/claude-stream.ts` **ne passe pas `--model`** → l'eval tourne sur le default de la CLI Claude Code de l'utilisateur. Ajouter `--model` est peu invasif côté spawn.
- Stockage : `evals/workspace/iteration-N/benchmark.json` + `grading.json` par run. Aujourd'hui **une itération = un modèle implicite** (celui de la CLI).
- Baseline `without_skill` existe déjà → le VS se plaque sur la mécanique actuelle, pas une refonte.
- `eval-matrix.ts` agrège les runs pour l'UI `EvalRunsView.tsx` — impacté si on ajoute une dimension modèle.

## Réponses utilisateur (Compréhension)

- **Persona** : dev de skill (pas end-user).
- **Décision** : l'utilisateur tranche, Nakiros **n'impose pas de reco automatique**.
- **Cadence** : opt-in, lancé quand l'utilisateur le souhaite — le surcoût est explicite et assumé.
- **Métriques** : pass/fail + temps + tokens, *identique au mode actuel*, juste multiplié par modèle.
- **Existant** : storage des runs dans le skill déjà en place, comparaison baseline déjà en place.

## Contrainte ajoutée (2026-04-22)

La **prochaine** feature est le support multi-provider (Codex, Cursor, Gemini). L'architecture de la feature multi-modèle doit donc être un **cas particulier** d'une abstraction « runner » ou « provider », pas un `enum` de modèles Claude.

**Question conceptuelle non tranchée** : qu'est-ce que signifie « tester un skill sur Codex / Gemini » ?
- Option α — **On exécute le même skill Claude Code** via un agent non-Claude qui sait charger des skills (peu probable, aucun ne le fait nativement aujourd'hui).
- Option β — **On exécute le même *problème* (eval-suite)** sur un autre agent, sans notion de skill. Le baseline `without_skill` devient le seul mode possible pour les non-Claude → on mesure « est-ce que ce problème nécessite le skill, ou un autre agent le résout-il sans skill ? ». Cadrage différent mais cohérent.
- Option γ — **On réécrit le skill** comme un prompt + outils natifs de chaque provider. Gros chantier, probablement hors scope de Nakiros.

## Approches envisagées

_[à compléter — phase exploration en cours — approches révisées pour extensibilité provider]_

## Recommandation

_à compléter phase 4_

## Décision / Next steps

_à compléter phase 4_
