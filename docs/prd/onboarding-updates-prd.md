# Ticket — Onboarding & Installation : Premier lancement + Système de mise à jour à distance

## Contexte

Aujourd'hui l'installation des commandes agents est accessible uniquement dans les Réglages globaux, après la création d'un projet. Il n'y a pas de flux guidé au premier lancement. De plus, mettre à jour les agents et workflows nécessite de publier une nouvelle version de l'app `.dmg`, ce qui est lourd et inutile pour des changements de contenu.

Ce ticket couvre deux sujets liés :
1. Le flux de premier lancement de l'application
2. Le système de mise à jour à distance des agents et workflows

---

## Rappel de la convention de stockage

Avant tout développement, respecter strictement cette convention (voir `docs/architecture/storage-convention.md`) :

- `~/.nakiros/` — données globales Nakiros (config, workspaces, tickets, sessions, reports)
- `{repo}/_nakiros/` — documentation générée versionnée dans le repo (architecture, conventions, llms.txt)
- **Jamais** de dossier `.nakiros/` créé à la racine d'un repo Git

---

## Bug à corriger en priorité

**La création de workspace crée actuellement un dossier `.nakiros/` à la racine du repo. Ce comportement est incorrect et doit être supprimé.**

- `.nakiros/` ne doit exister qu'à `~/.nakiros/` (home utilisateur)
- Dans les repos, seul `_nakiros/` (underscore, visible, versionné) est autorisé
- Vérifier et corriger tous les endroits dans le code qui créent un `.nakiros/` dans un repo

---

## Partie 1 — Flux de premier lancement

### Déclencheur

Le flux de premier lancement s'active uniquement si `~/.nakiros/config.yaml` n'existe pas. Si ce fichier existe, l'app démarre normalement sur le dashboard.

### Étape 1 — Écran de bienvenue

Écran plein écran avec :
- Logo Nakiros animé
- Headline : *"Welcome to Nakiros"*
- Sous-titre : *"Your autonomous dev companion. Let's set things up."*
- Bouton : "Get started →"

---

### Étape 2 — Détection des éditeurs IA

Nakiros scanne automatiquement le système pour détecter les éditeurs IA installés.

**Éditeurs à détecter :**

| Éditeur | Chemin de détection | Dossier cible des commandes |
|---|---|---|
| Claude Code | `~/.claude/` existe | `~/.claude/commands/` |
| Cursor | `/Applications/Cursor.app` existe | `~/.cursor/commands/` ou `.cursor/rules/` |
| Codex | `~/.codex/` existe | `~/.codex/prompts/` |

**Affichage :**

Liste des éditeurs avec statut détecté/non détecté :

```
Éditeurs IA détectés sur votre machine :

✅ Claude Code     — détecté
✅ Cursor          — détecté
⚪ Codex           — non détecté

Nakiros va installer ses agents dans les éditeurs détectés.
Vous pourrez ajouter d'autres éditeurs plus tard dans les Réglages.
```

Bouton : "Installer les agents →"

---

### Étape 3 — Installation des agents et workflows

**Ce que Nakiros installe :**

1. Les commandes agents (fichiers `.md`) dans les dossiers appropriés de chaque éditeur détecté
2. Les workflows (fichiers `.yaml`, `.xml`, `.md`) dans `~/.nakiros/workflows/`
3. La structure de base `~/.nakiros/` :

```
~/.nakiros/
  config.yaml          # Créé avec les valeurs par défaut
  agents/              # Version locale des agents installés
    dev.md
    pm.md
    architect.md
    sm.md
    qa.md
    hotfix.md
    brainstorming.md
  workflows/           # Workflows installés
    4-implementation/
      create-story/
        workflow.yaml
        instructions.xml
        checklist.md
      create-ticket/
        workflow.yaml
        instructions.xml
      dev-story/
        workflow.yaml
        instructions.xml
        checklist.md
      fetch-project-context/
        workflow.yaml
        instructions.xml
      generate-context/
        workflow.yaml
        instructions.xml
        steps/
      hotfix-story/
        workflow.yaml
        instructions.xml
      project-understanding-confidence/
        workflow.yaml
        instructions.xml
        checklist.md
      qa-review/
        workflow.yaml
        instructions.xml
    5-reporting/
      sprint/
        workflow.yaml
        instructions.xml
  workspaces/          # Vide à ce stade
  version.json         # Version actuelle des agents/workflows installés
```

**Affichage pendant l'installation :**

Progress avec étapes visibles :
```
Installing Nakiros agents...

✅ ~/.nakiros/ created
✅ Agents installed (7/7)
✅ Workflows installed
✅ Claude Code commands deployed
✅ Cursor commands deployed
✅ version.json saved
```

**En cas d'erreur :**
- Afficher l'erreur précise avec le chemin concerné
- Proposer "Réessayer" ou "Passer et configurer manuellement"
- Ne pas bloquer l'onboarding sur une erreur non critique

---

### Étape 4 — Vérification des mises à jour

Juste après l'installation, Nakiros check si une version plus récente des agents/workflows est disponible.

Voir Partie 2 pour le détail du système de mise à jour.

Si une mise à jour est disponible :
```
✨ Une version plus récente des agents est disponible (v1.2.0)
   Mettre à jour maintenant ?
   [Mettre à jour] [Passer]
```

---

### Étape 5 — Création du premier workspace

Rediriger vers le wizard de création de workspace.

Afficher un message contextuel :
```
Nakiros est prêt. Créez votre premier workspace pour commencer.
```

---

## Partie 2 — Système de mise à jour à distance des agents et workflows

### Principe

Les agents (`.md`) et workflows (`.yaml`, `.xml`, `.md`) sont du contenu, pas du code applicatif. Ils doivent pouvoir être mis à jour sans publier une nouvelle version du `.dmg`.

Nakiros check les mises à jour depuis un endpoint distant et télécharge uniquement les fichiers modifiés.

---

### Source de vérité distante

Les agents et workflows sont hébergés sur un endpoint public :

```
https://updates.nakiros.com/agents/manifest.json
```

Le fichier `manifest.json` contient la liste de tous les fichiers avec leur version et leur hash :

```json
{
  "version": "1.2.0",
  "released_at": "2026-03-01T10:00:00Z",
  "changelog": "Improved PM Challenge Gate with 2 new quality dimensions",
  "files": [
    {
      "type": "agent",
      "name": "dev",
      "filename": "dev.md",
      "version": "1.2.0",
      "hash": "sha256:abc123...",
      "url": "https://updates.nakiros.com/agents/v1.2.0/dev.md"
    },
    {
      "type": "workflow",
      "name": "dev-story",
      "filename": "dev-story.yaml",
      "version": "1.1.0",
      "hash": "sha256:def456...",
      "url": "https://updates.nakiros.com/workflows/v1.1.0/dev-story.yaml"
    }
  ]
}
```

---

### Fichier `version.json` local

Nakiros maintient `~/.nakiros/version.json` pour tracker ce qui est installé :

```json
{
  "nakiros_app": "1.0.0",
  "agents_version": "1.1.0",
  "workflows_version": "1.0.0",
  "last_check": "2026-03-01T08:00:00Z",
  "files": {
    "dev.md": { "version": "1.1.0", "hash": "sha256:..." },
    "pm.md": { "version": "1.1.0", "hash": "sha256:..." },
    "dev-story.yaml": { "version": "1.0.0", "hash": "sha256:..." }
  }
}
```

---

### Quand check les mises à jour

1. **Au premier lancement** — toujours (étape 4 de l'onboarding)
2. **Au démarrage de l'app** — si le dernier check date de plus de 24h
3. **Manuellement** — bouton "Vérifier les mises à jour" dans les Réglages

---

### Processus de mise à jour

```
1. Fetch manifest.json depuis updates.nakiros.com
2. Comparer les hash avec version.json local
3. Si différences détectées :
   a. Afficher la liste des fichiers modifiés + changelog
   b. Demander confirmation à l'utilisateur
   c. Télécharger uniquement les fichiers modifiés
   d. Vérifier le hash de chaque fichier téléchargé
   e. Remplacer les fichiers dans ~/.nakiros/agents/ et ~/.nakiros/workflows/
   f. Redéployer les commandes dans les éditeurs IA installés
   g. Mettre à jour version.json
4. Si aucune différence : ne rien faire, mettre à jour last_check
```

---

### Affichage de la mise à jour dans les Réglages

```
Agents & Workflows
Version installée : 1.1.0
Dernière vérification : il y a 2 heures

[Vérifier les mises à jour]

── Mise à jour disponible : v1.2.0 ──────────────────
Améliorations du PM Challenge Gate
2 agents mis à jour : dev.md, pm.md
1 workflow mis à jour : dev-story.yaml

[Mettre à jour maintenant]  [Voir le changelog]
```

---

### Gestion des erreurs réseau

- Si `updates.nakiros.com` est inaccessible → continuer sans mise à jour, log silencieux
- Ne jamais bloquer le démarrage de l'app sur une erreur de check de mise à jour
- Afficher une notification discrète si la mise à jour a échoué

---

## Récapitulatif des choses à implémenter

1. **Bug** : Supprimer la création de `.nakiros/` dans les repos Git
2. **Onboarding** : Écran de bienvenue au premier lancement si `~/.nakiros/config.yaml` absent
3. **Onboarding** : Détection automatique des éditeurs IA (Claude Code, Cursor, Codex)
4. **Onboarding** : Installation guidée des agents et workflows avec progress et gestion d'erreurs
5. **Updates** : Héberger agents et workflows sur `updates.nakiros.com` avec `manifest.json`
6. **Updates** : Système de check et téléchargement des mises à jour au démarrage
7. **Updates** : UI dans les Réglages pour vérifier et appliquer les mises à jour manuellement
8. **Updates** : Redéploiement automatique des commandes dans les éditeurs après mise à jour
