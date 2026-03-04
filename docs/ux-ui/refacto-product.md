# Ticket — Refactor : Vue Product

## Contexte

La vue Product actuelle liste les documents markdown des repos mais manque de la dimension globale du workspace. La section Global n'existe pas, les docs n'ont pas d'indicateur de fraîcheur, et les boutons d'action lancent les agents directement au lieu de passer par le Chat IA.

## Objectif

Enrichir la vue Product avec trois changements précis :
1. Ajouter la section Global dans le listing des documents
2. Ajouter des indicateurs de fraîcheur sur chaque doc
3. Les boutons Actions redirigent vers le Chat IA avec le bon agent pré-sélectionné

---

## Ce qu'il ne faut PAS changer

- La structure générale en deux encarts (Documents + Actions)
- La visionneuse markdown à droite — lecture seule, aucun éditeur
- Le dark theme et les couleurs teal
- La sidebar de navigation

---

## Encart 1 — Documents

### Changement : Ajouter la section Global en premier

La section Global doit apparaître en tête de liste, avant les repos. Elle pointe vers les fichiers dans `~/.nakiros/workspaces/{id}/context/`.

Structure complète du listing :

```
DOCUMENTS

  GLOBAL
    global-context.md        Généré il y a 2 jours  [↻]
    inter-repo.md            Généré il y a 2 jours  [↻]
    pm-context.md            Généré il y a 5 jours  [↻]

  TENANT-MANAGEMENT
    README                   Modifié il y a 1 jour
    _nakiros/
      architecture.md        Généré il y a 2 jours  [↻]
      conventions.md         Généré il y a 2 jours  [↻]
      llms.txt               Généré il y a 2 jours  [↻]

  IO-LINK-INTERPRETER
    README                   Modifié il y a 3 jours
    _nakiros/
      architecture.md        Généré il y a 2 jours  [↻]
      conventions.md         Généré il y a 2 jours  [↻]
      llms.txt               Généré il y a 2 jours  [↻]
```

### Indicateurs de fraîcheur

Chaque fichier affiche à droite de son nom :
- **Fichiers générés par Nakiros** (`_nakiros/` et `context/`) : "Généré il y a X jours" en texte gris clair + bouton [↻] pour régénérer
- **Fichiers du repo non générés** (README, autres .md) : "Modifié il y a X jours" en texte gris clair, pas de bouton [↻]

**Règle de couleur sur l'indicateur de fraîcheur :**

| Ancienneté | Couleur |
|---|---|
| Moins de 3 jours | Gris clair — normal |
| Entre 3 et 7 jours | Orange — à surveiller |
| Plus de 7 jours | Rouge — régénération recommandée |

**Comportement du bouton [↻] :**
- Clic → redirige vers le Chat IA
- Ouvre une nouvelle session avec l'agent Architect pré-sélectionné
- Lance automatiquement la régénération du fichier concerné
- Pas de confirmation — action directe

### Fichier absent

Si un fichier attendu n'existe pas encore (ex: `architecture.md` absent car Generate Context n'a jamais été lancé) :

```
  _nakiros/
    architecture.md    Non généré  [Générer →]
    conventions.md     Non généré  [Générer →]
    llms.txt           Non généré  [Générer →]
```

Texte en gris italique, bouton [Générer →] qui redirige vers le Chat IA.

### Section Global absente

Si le contexte global n'a jamais été généré, afficher la section Global avec un état vide :

```
  GLOBAL
    Aucun contexte global généré.
    [Générer le contexte global →]
```

---

## Encart 2 — Actions

### Changement : redirection vers Chat IA

Les boutons d'action ne lancent plus les agents directement. Ils redirigent vers le Chat IA avec l'agent ou le workflow pré-sélectionné.

**Boutons à conserver :**

| Bouton | Comportement actuel | Nouveau comportement |
|---|---|---|
| Generate Context | Lance directement | Chat IA → Architect → workflow Generate Context |
| Project Confidence | Lance directement | Chat IA → Architect → workflow Project Confidence |
| Architect | Ouvre chat intégré | Chat IA → Architect |
| PM Agent | Ouvre chat intégré | Chat IA → PM Agent |

**Aucun nouveau bouton à ajouter.** Les boutons existants sont suffisants.

---

## Visionneuse markdown (panel droit)

### Pas de changement fonctionnel

La visionneuse reste en lecture seule. Aucun éditeur markdown.

### Ajout : bandeau de fraîcheur en haut du document ouvert

Quand un fichier généré par Nakiros est ouvert, afficher un bandeau discret sous le titre :

```
architecture.md
Généré le 1 mars 2026 par l'agent Architect  ·  [Régénérer →]
─────────────────────────────────────────────────────────────
[contenu du fichier]
```

Si le fichier date de plus de 7 jours, le bandeau passe en orange :

```
architecture.md
⚠️ Généré il y a 8 jours — peut ne plus être à jour  ·  [Régénérer →]
```

---

## Sources de données

| Donnée | Source |
|---|---|
| Fichiers context global | ~/.nakiros/workspaces/{id}/context/ |
| Fichiers _nakiros repo | {repo}/_nakiros/ |
| README et autres .md | {repo}/ (lecture directe du filesystem) |
| Date de génération | Métadonnée stockée dans ~/.nakiros/workspaces/{id}/context/meta.json |
| Date de modification README | git log --follow -1 {fichier} |