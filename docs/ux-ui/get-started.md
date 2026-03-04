# Ticket — Getting Started : Écran de démarrage post-création de workspace

## Contexte

Après la création d'un workspace, l'utilisateur arrive sur le Morning Briefing avec des données vides et aucun contexte généré. Sans guidage, il ne sait pas quoi faire en premier. Les agents n'ont aucune connaissance du codebase et ne peuvent pas travailler efficacement.

## Objectif

Afficher un écran de démarrage guidé juste après la création d'un workspace, avec 3 étapes claires à compléter avant de commencer à développer. Chaque étape redirige vers le Chat IA et lance automatiquement le workflow approprié.

---

## Déclencheur

L'écran Getting Started s'affiche uniquement dans deux cas :

1. Juste après la création d'un nouveau workspace — première ouverture
2. Si `~/.nakiros/workspaces/{id}/` existe mais qu'aucune étape n'a encore été complétée

Il disparaît définitivement une fois les 3 étapes complétées. L'utilisateur peut aussi le fermer manuellement avec un bouton "Passer — je configure manuellement" discret en bas de page.

---

## Détection du contexte existant

Au chargement du Getting Started, Nakiros vérifie si `_nakiros/architecture.md` existe déjà dans les repos du workspace.

**Cas A — Nouveau projet, aucun contexte existant**
Afficher les 3 étapes dans l'ordre.

**Cas B — Nouveau dev qui rejoint un projet existant**
`_nakiros/architecture.md` existe déjà dans les repos.
Afficher uniquement l'étape 1 adaptée + les étapes 2 et 3 :

```
Contexte repo détecté — architecture et conventions déjà disponibles.
Il reste à générer le contexte global inter-repo.

[ ] 1. Générer le contexte global inter-repo
[ ] 2. Évaluer la confiance projet
[ ] 3. Challenger les tickets
```

---

## Layout de l'écran

Écran centré par-dessus le Morning Briefing (overlay ou page dédiée).

```
+----------------------------------------------------------+
|                                                          |
|   Workspace "Exploi" créé.                               |
|   Voici les 3 étapes pour que vos agents soient          |
|   opérationnels.                                         |
|                                                          |
|   [ ] 1. Générer le contexte        [Lancer →]           |
|       Les agents vont analyser vos repos et              |
|       générer la documentation de référence.             |
|                                                          |
|   [ ] 2. Évaluer la confiance projet  [Lancer →]         |
|       L'Architect évalue ce qu'il comprend               |
|       du projet et identifie les zones floues.           |
|                                                          |
|   [ ] 3. Challenger les tickets       [Lancer →]         |
|       Le PM Agent vérifie la qualité des tickets         |
|       synchronisés avant de commencer à développer.      |
|                                                          |
|                     [Passer — configurer manuellement]   |
+----------------------------------------------------------+
```

---

## Étape 1 — Générer le contexte

### Ce que l'utilisateur voit
Checkbox vide + description + bouton "Lancer →"

### Ce qui se passe au clic sur "Lancer →"

1. Redirection vers la vue **Chat IA**
2. Ouverture automatique d'une nouvelle session intitulée *"Generate Context · [nom du workspace]"*
3. Agent sélectionné automatiquement : **Architect**
4. Lancement automatique de la commande `/nak-workflow-generate-context` sans que l'utilisateur ait à la taper
5. L'agent commence à travailler — scanne les repos, génère les fichiers

### Ce que l'utilisateur peut faire
Suivre le travail de l'agent en temps réel dans le chat. Interagir librement :
- "Fais attention au module auth qui est custom"
- "On utilise une convention de nommage spécifique pour les events"
- L'agent intègre ces précisions dans la documentation générée

### Fichiers produits
Dans chaque repo du workspace :
```
{repo}/_nakiros/
  architecture.md
  stack.md
  conventions.md
  llms.txt
```

Dans le workspace global :
```
~/.nakiros/workspaces/{id}/context/
  global-context.md
  inter-repo.md
```

### Complétion automatique
Quand le workflow se termine, Nakiros :
1. Détecte que les fichiers ont été générés
2. Coche automatiquement la checkbox de l'étape 1 dans le Getting Started
3. Affiche une notification discrète : "Contexte généré — étape 1 complétée"
4. L'utilisateur peut revenir au Getting Started via un bouton flottant ou la sidebar

---

## Étape 2 — Évaluer la confiance projet

### Prérequis
L'étape 2 est grisée et non cliquable tant que l'étape 1 n'est pas complétée.
Message affiché : "Complétez d'abord la génération du contexte."

### Ce qui se passe au clic sur "Lancer →"

1. Redirection vers la vue **Chat IA**
2. Ouverture automatique d'une nouvelle session intitulée *"Project Confidence · [nom du workspace]"*
3. Agent sélectionné automatiquement : **Architect**
4. Lancement automatique de `/nak-workflow-project-confidence`

### Fichiers produits
```
~/.nakiros/workspaces/{id}/reports/confidence/
  {date}.json
```

### Complétion automatique
Même logique que l'étape 1 — détection automatique de la fin du workflow, checkbox cochée.

---

## Étape 3 — Challenger les tickets

### Prérequis
L'étape 3 est grisée tant que l'étape 2 n'est pas complétée.

### Ce qui se passe au clic sur "Lancer →"

1. Redirection vers la vue **Chat IA**
2. Ouverture automatique d'une nouvelle session intitulée *"PM Challenge · Sprint [nom du sprint actif]"*
3. Agent sélectionné automatiquement : **PM Agent**
4. Lancement automatique de `/nak-workflow-pm-challenge` avec injection automatique des tickets synchronisés du sprint actif comme contexte
5. Le PM Agent analyse la cohérence des épics, la qualité des AC, le scope des stories

### Fichiers produits
Les commentaires et suggestions du PM Agent sont persistés dans :
```
~/.nakiros/workspaces/{id}/sessions/{session-id}.json
```

### Complétion automatique
Checkbox cochée à la fin du workflow.

---

## État final — Getting Started complété

Une fois les 3 checkboxes cochées :

```
Votre workspace est prêt.
Les agents connaissent votre projet et vos tickets sont challengés.

[Aller au Morning Briefing →]
```

L'écran Getting Started ne réapparaît plus pour ce workspace.

---

## Bouton d'accès depuis le Morning Briefing

Tant que le Getting Started n'est pas complété, afficher une bannière discrète en haut du Morning Briefing :

```
⚡ Votre workspace n'est pas encore configuré.
   Compléter la configuration →          [X]
```

Clic sur "Compléter la configuration" rouvre le Getting Started.
Le [X] ferme la bannière pour la session en cours uniquement — elle réapparaît au prochain lancement.

---

## Ce qu'il ne faut pas toucher

- Le wizard de création de workspace : aucun changement
- Le Morning Briefing : uniquement ajout de la bannière décrite ci-dessus
- Le Chat IA : aucun changement sur l'UI — le Getting Started exploite les fonctionnalités existantes
- Le dark theme et les couleurs teal