# Ticket 1 — Structure, Versioning & Push R2 des agents et workflows

## Contexte

Les agents (.md) et workflows (.yaml, .xml, .md) sont actuellement embarqués dans le .dmg de l'application. Toute mise à jour nécessite une nouvelle release de l'app complète. L'objectif est de les externaliser sur Cloudflare R2 pour pouvoir les mettre à jour indépendamment de l'app.

Le projet est un mono repo Turborepo sur GitHub contenant l'app Electron, le serveur MCP, les agents et les workflows.

---

## Principe fondamental

Les agents et workflows sont versionnés en **bundle global** — une version unique couvre l'ensemble des agents et workflows qui sont testés et compatibles ensemble. Pas de versioning par fichier individuel.

---

## Structure du mono repo

Créer le dossier suivant à la racine du mono repo :

```
/packages/agents-bundle/
  agents/
    dev.md
    pm.md
    architect.md
    sm.md
    qa.md
    hotfix.md
    brainstorming.md
  workflows/
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
  manifest.json
  CHANGELOG.md
```

---

## Format du manifest.json

Le manifest.json est la source de vérité pour les mises à jour. Il doit être maintenu manuellement à chaque release du bundle.

```json
{
  "version": "1.0.0",
  "channel": "stable",
  "released_at": "2026-03-04T10:00:00Z",
  "min_app_version": "1.0.0",
  "required_features": [],
  "changelog": "Initial release of agents bundle",
  "files": [
    {
      "type": "agent",
      "name": "dev",
      "filename": "dev.md",
      "path": "agents/dev.md",
      "hash": "sha256:abc123..."
    },
    {
      "type": "agent",
      "name": "pm",
      "filename": "pm.md",
      "path": "agents/pm.md",
      "hash": "sha256:def456..."
    },
    {
      "type": "workflow",
      "name": "dev-story",
      "filename": "workflow.yaml",
      "path": "workflows/4-implementation/dev-story/workflow.yaml",
      "hash": "sha256:ghi789..."
    }
  ]
}
```

### Champs du manifest

| Champ | Type | Description |
|---|---|---|
| `version` | string | Version du bundle au format semver (ex: 1.2.0) |
| `channel` | string | `stable` ou `beta` |
| `released_at` | string | Date ISO de la release |
| `min_app_version` | string | Version minimale de l'app Nakiros requise |
| `required_features` | array | Features app requises (ex: ["saas", "rag"]). Vide pour v1. |
| `changelog` | string | Description des changements pour cette version |
| `files` | array | Liste de tous les fichiers du bundle avec leur hash SHA256 |

### Channels

- `stable` — version de production, distribuée à tous les utilisateurs
- `beta` — version de test, distribuée uniquement aux utilisateurs ayant activé le channel beta dans les Settings

---

## Structure R2

Bucket R2 : `nakiros-assets`

```
nakiros-assets/
  channels/
    stable/
      manifest.json          ← toujours la dernière version stable
      1.0.0/
        agents/
          dev.md
          pm.md
          architect.md
          sm.md
          qa.md
          hotfix.md
          brainstorming.md
        workflows/
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
      1.1.0/
        ...
    beta/
      manifest.json          ← toujours la dernière version beta
      1.1.0-beta/
        ...
```

Le fichier `channels/{channel}/manifest.json` est toujours la dernière version disponible pour ce channel. Les dossiers versionnés permettent de rollback si nécessaire.

---

## Script de génération des hashs

Créer un script `/packages/agents-bundle/scripts/generate-manifest.js` qui :

1. Parcourt tous les fichiers agents et workflows
2. Calcule le hash SHA256 de chaque fichier
3. Met à jour le champ `files` dans manifest.json avec les hashs calculés
4. Ne modifie pas les autres champs (version, channel, changelog — maintenus manuellement)

```bash
# Utilisation
node packages/agents-bundle/scripts/generate-manifest.js
```

---

## GitHub Action — Push automatique sur R2

Créer `.github/workflows/push-agents-bundle.yml`

### Déclencheur

Le workflow GitHub Action se déclenche uniquement quand :
- Un push sur la branche `main` ET
- Des fichiers dans `packages/agents-bundle/` ont été modifiés

```yaml
on:
  push:
    branches:
      - main
    paths:
      - 'packages/agents-bundle/**'
```

### Étapes du workflow

```
1. Checkout du repo
2. Lire le channel depuis manifest.json (stable ou beta)
3. Lire la version depuis manifest.json
4. Générer les hashs via generate-manifest.js
5. Vérifier que la version n'existe pas déjà sur R2 (éviter l'écrasement)
6. Uploader tous les fichiers dans channels/{channel}/{version}/
7. Uploader manifest.json dans channels/{channel}/manifest.json
8. Logger le succès avec version et channel
```

### Variables d'environnement GitHub Secrets requis

```
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_R2_ACCESS_KEY_ID
CLOUDFLARE_R2_SECRET_ACCESS_KEY
R2_BUCKET_NAME=nakiros-assets
```

### Comportement si la version existe déjà sur R2

Le workflow échoue avec un message explicite :
```
ERROR: Bundle version 1.0.0 already exists on channel stable.
Bump the version in manifest.json before pushing.
```

Cela force le développeur à toujours incrémenter la version avant de pusher.

---

## Processus de release d'un nouveau bundle

1. Modifier les fichiers agents/workflows dans `packages/agents-bundle/`
2. Mettre à jour `manifest.json` manuellement :
   - Incrémenter `version`
   - Mettre à jour `channel` si besoin
   - Mettre à jour `min_app_version` si la nouvelle version requiert une app plus récente
   - Mettre à jour `required_features` si besoin
   - Rédiger le `changelog`
3. Mettre à jour `CHANGELOG.md`
4. Merger sur `main`
5. Le GitHub Action détecte les changements, génère les hashs et push sur R2 automatiquement

---

## Compatibilité et required_features — Exemples concrets

| Scénario | min_app_version | required_features |
|---|---|---|
| Release standard | 1.0.0 | [] |
| Agents utilisant le mode SaaS | 2.0.0 | ["saas"] |
| Agents utilisant le RAG | 2.1.0 | ["rag"] |
| Agents SaaS + RAG | 2.1.0 | ["saas", "rag"] |

L'app déclare les features qu'elle supporte dans sa propre config. Si `required_features` du bundle contient une feature que l'app ne supporte pas, la mise à jour est bloquée avec un message clair à l'utilisateur.

---

## Ce qu'il ne faut pas toucher

- Le contenu des agents et workflows eux-mêmes — ce ticket couvre uniquement la structure et le pipeline
- La logique d'installation locale dans l'app — couverte dans le Ticket 3
- L'API Worker Cloudflare — couverte dans le Ticket 2
