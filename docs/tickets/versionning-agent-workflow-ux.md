# Ticket 3 — Intégration app : Check et application des mises à jour

## Contexte

Le stockage R2 et l'API Worker sont en place (Tickets 1 et 2). Ce ticket couvre la logique côté app Nakiros pour vérifier, télécharger et appliquer les mises à jour des agents et workflows, ainsi que l'UI dans l'onboarding et les Settings globaux.

---

## Fichier de version locale

Nakiros maintient un fichier de version locale qui trace ce qui est installé :

```
~/.nakiros/version.json
```

```json
{
  "bundle_version": "1.0.0",
  "channel": "stable",
  "app_version": "1.0.0",
  "last_check": "2026-03-04T08:00:00Z",
  "installed_at": "2026-03-04T08:00:00Z",
  "files": {
    "agents/dev.md": "sha256:abc123...",
    "agents/pm.md": "sha256:def456...",
    "workflows/dev-story.yaml": "sha256:ghi789..."
  }
}
```

Ce fichier est créé lors de l'installation initiale (onboarding) et mis à jour à chaque mise à jour appliquée.

---

## Logique de check des mises à jour

### Quand checker

1. **Onboarding** — étape 4, juste après l'installation initiale des agents
2. **Démarrage de l'app** — si `last_check` date de plus de 24h
3. **Manuellement** — bouton dans les Settings globaux

### Processus de check

```
1. Lire bundle_version et channel depuis ~/.nakiros/version.json
2. GET https://updates.nakiros.com/manifest
   Headers:
     X-Nakiros-Key: {api_key_embarquée}
     User-Agent: Nakiros/{app_version} ({platform}; {arch})
   Query:
     channel={channel}
     app_version={app_version}
     features={features_supportées}

3. Si erreur réseau → log silencieux, ne pas bloquer l'app

4. Si manifest.compatible === false
   → Afficher notification selon reason :
     - min_app_version : "Une mise à jour de l'application est requise"
     - required_features : "Mettez à jour l'application pour accéder aux nouveaux agents"
   → Ne pas proposer de mise à jour du bundle

5. Si manifest.version === version locale → rien à faire, mettre à jour last_check

6. Si manifest.version > version locale → mise à jour disponible
   → Stocker le manifest en mémoire
   → Afficher notification selon le contexte (voir UI ci-dessous)
```

### Calcul des fichiers à télécharger

Comparer le hash de chaque fichier dans le manifest avec les hashs dans `version.json` local. Télécharger uniquement les fichiers dont le hash a changé — pas tout le bundle à chaque fois.

```typescript
const filesToDownload = manifest.files.filter(file => {
  const localHash = localVersion.files[file.path]
  return localHash !== file.hash
})
```

---

## Processus d'application d'une mise à jour

```
1. Pour chaque fichier à télécharger :
   a. GET https://updates.nakiros.com/download/{version}/{path}
   b. Vérifier le hash SHA256 du fichier téléchargé vs manifest
   c. Si hash invalide → abandonner la mise à jour, log erreur
   d. Écrire le fichier dans ~/.nakiros/agents/ ou ~/.nakiros/workflows/

2. Redéployer les commandes dans les éditeurs IA installés :
   - Claude Code : copier les agents .md dans ~/.claude/commands/
   - Cursor : copier dans ~/.cursor/commands/
   - Codex : copier dans ~/.codex/prompts/

3. Mettre à jour ~/.nakiros/version.json :
   - bundle_version = manifest.version
   - last_check = now
   - installed_at = now
   - files = nouveaux hashs

4. Afficher confirmation : "Agents mis à jour vers v{version}"
```

### Gestion des erreurs pendant la mise à jour

- Si un fichier échoue au téléchargement → retry 3 fois puis abandon
- Si le hash est invalide → abandon complet, garder l'ancienne version
- Si le redéploiement dans un éditeur échoue → log erreur, continuer avec les autres éditeurs
- En cas d'abandon → `version.json` n'est pas modifié, l'ancienne version reste active

---

## UI — Onboarding (étape 4)

Lors du premier lancement, après l'installation initiale des agents :

```
Vérification des mises à jour...

✅ Agents à jour — version 1.0.0
```

Si une mise à jour est disponible :

```
✨ Une version plus récente est disponible (v1.2.0)
   "Improved PM Challenge Gate with better AC validation"

[Mettre à jour maintenant]  [Passer]
```

Si incompatible (app trop ancienne) :

```
ℹ️ Une nouvelle version des agents est disponible mais requiert
   Nakiros v1.1.0. Téléchargez la dernière version de l'app.

[Télécharger la mise à jour]  [Continuer avec la version actuelle]
```

---

## UI — Settings globaux

### Section "Agents & Workflows"

```
┌─────────────────────────────────────────────────────────┐
│ Agents & Workflows                                       │
│                                                          │
│ Version installée    1.0.0                               │
│ Channel              [stable ▼]                          │
│ Dernière vérification  il y a 2 heures                   │
│                                                          │
│ [Vérifier les mises à jour]                              │
└─────────────────────────────────────────────────────────┘
```

**Select channel :**
- `stable` — version de production (défaut)
- `beta` — versions de test, peut être instable

Changer de channel déclenche immédiatement un check de mise à jour.

### État : mise à jour disponible

```
┌─────────────────────────────────────────────────────────┐
│ Agents & Workflows                                       │
│                                                          │
│ Version installée    1.0.0                               │
│ Channel              [stable ▼]                          │
│ Dernière vérification  il y a 2 minutes                  │
│                                                          │
│ ── Mise à jour disponible : v1.2.0 ─────────────────    │
│ Improved PM Challenge Gate with better AC validation     │
│                                                          │
│ [Mettre à jour maintenant]    [Voir le changelog]        │
└─────────────────────────────────────────────────────────┘
```

### État : incompatible

```
┌─────────────────────────────────────────────────────────┐
│ Agents & Workflows                                       │
│                                                          │
│ Version installée    1.0.0                               │
│                                                          │
│ ── Mise à jour disponible : v1.2.0 ─────────────────    │
│ ⚠️ Requiert Nakiros v1.1.0 minimum                       │
│ Mettez à jour l'application pour accéder aux            │
│ nouveaux agents.                                         │
│                                                          │
│ [Télécharger la mise à jour de l'app]                    │
└─────────────────────────────────────────────────────────┘
```

### État : vérification en cours

```
┌─────────────────────────────────────────────────────────┐
│ Agents & Workflows                                       │
│                                                          │
│ Vérification en cours...                                 │
└─────────────────────────────────────────────────────────┘
```

### État : erreur réseau

```
┌─────────────────────────────────────────────────────────┐
│ Agents & Workflows                                       │
│                                                          │
│ Version installée    1.0.0                               │
│ ⚠️ Impossible de vérifier les mises à jour               │
│    Vérifiez votre connexion internet.                    │
│                                                          │
│ [Réessayer]                                              │
└─────────────────────────────────────────────────────────┘
```

---

## Notification système au démarrage

Si une mise à jour est disponible et que le check se fait en arrière-plan au démarrage, afficher une notification discrète dans le header de l'app :

```
✨ Mise à jour agents disponible (v1.2.0)  [Mettre à jour]  [×]
```

- La notification est non bloquante — l'utilisateur peut l'ignorer
- Le [×] la ferme pour la session en cours uniquement
- Elle réapparaît au prochain démarrage si la mise à jour n'a pas été appliquée

---

## Features déclarées par l'app

L'app déclare ses features supportées dans sa config interne. Pour la v1 :

```typescript
const APP_SUPPORTED_FEATURES = [] // Aucune feature avancée en v1
```

À ajouter au fur et à mesure :
```typescript
// v2
const APP_SUPPORTED_FEATURES = ["saas"]

// v2.1
const APP_SUPPORTED_FEATURES = ["saas", "rag"]
```

Ces features sont envoyées dans chaque requête manifest pour que le Worker vérifie la compatibilité.

---

## Ce qu'il ne faut pas toucher

- Le contenu des agents et workflows — ce ticket ne modifie pas les fichiers eux-mêmes
- La structure R2 — définie dans le Ticket 1
- L'API Worker — définie dans le Ticket 2
- Le reste des Settings globaux — uniquement la section "Agents & Workflows" est ajoutée