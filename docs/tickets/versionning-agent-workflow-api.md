# Ticket 2 — Cloudflare Worker : API manifest et téléchargement sécurisé

## Contexte

Les agents et workflows sont stockés sur Cloudflare R2 (voir Ticket 1). Ce Worker expose une API sécurisée que l'app Nakiros utilise pour vérifier et télécharger les mises à jour. Seule l'application Nakiros doit pouvoir accéder à ces fichiers.

---

## Stack

- Cloudflare Worker (TypeScript)
- Cloudflare R2 binding pour accéder aux fichiers
- Hébergé sur `updates.nakiros.com`

---

## Endpoints

### GET /manifest

Retourne le manifest.json de la dernière version disponible pour un channel donné.

**Paramètres query :**

| Paramètre | Requis | Description |
|---|---|---|
| `channel` | Non | `stable` (défaut) ou `beta` |
| `app_version` | Oui | Version de l'app qui fait la requête (ex: 1.0.0) |

**Exemple de requête :**
```
GET https://updates.nakiros.com/manifest?channel=stable&app_version=1.0.0
```

**Réponse succès (200) :**
```json
{
  "version": "1.2.0",
  "channel": "stable",
  "released_at": "2026-03-04T10:00:00Z",
  "min_app_version": "1.0.0",
  "required_features": [],
  "changelog": "Improved PM Challenge Gate",
  "compatible": true,
  "files": [...]
}
```

**Réponse si app trop ancienne (200 avec compatible: false) :**
```json
{
  "version": "1.2.0",
  "channel": "stable",
  "compatible": false,
  "reason": "min_app_version",
  "message": "Cette mise à jour requiert Nakiros v1.1.0 minimum. Mettez à jour l'application."
}
```

**Réponse si feature manquante (200 avec compatible: false) :**
```json
{
  "version": "1.2.0",
  "channel": "stable",
  "compatible": false,
  "reason": "required_features",
  "missing_features": ["saas"],
  "message": "Cette mise à jour requiert le mode SaaS. Mettez à jour l'application."
}
```

---

### GET /download/:version/:path

Télécharge un fichier spécifique du bundle.

**Paramètres :**

| Paramètre | Description |
|---|---|
| `version` | Version du bundle (ex: 1.2.0) |
| `path` | Chemin du fichier (ex: agents/dev.md, workflows/dev-story.yaml) |

**Paramètres query :**

| Paramètre | Requis | Description |
|---|---|---|
| `channel` | Non | `stable` (défaut) ou `beta` |

**Exemple de requête :**
```
GET https://updates.nakiros.com/download/1.2.0/agents/dev.md?channel=stable
```

**Réponse succès (200) :**
Contenu brut du fichier avec headers appropriés :
```
Content-Type: text/markdown
Content-Disposition: attachment; filename="dev.md"
X-File-Hash: sha256:abc123...
```

**Réponse fichier introuvable (404) :**
```json
{
  "error": "FILE_NOT_FOUND",
  "message": "File agents/dev.md not found in bundle 1.2.0"
}
```

---

## Système de sécurité

L'API ne doit être accessible que par l'application Nakiros. Deux niveaux de protection :

### Niveau 1 — API Key dans le header

Chaque requête doit inclure un header d'authentification :

```
X-Nakiros-Key: {api_key}
```

L'API key est :
- Générée à la compilation de l'app et embarquée dans le binaire
- Stockée comme secret Cloudflare Worker (jamais dans le code source)
- Différente entre le build stable et le build beta
- Rotatable sans mise à jour de l'app si nécessaire (via rotation côté Worker + nouvelle key dans le prochain bundle)

Toute requête sans ce header ou avec une key invalide retourne :
```json
HTTP 401
{
  "error": "UNAUTHORIZED",
  "message": "Invalid or missing API key"
}
```

### Niveau 2 — User-Agent validation

Le Worker vérifie que le header `User-Agent` correspond au format Nakiros :

```
User-Agent: Nakiros/{app_version} ({platform}; {arch})
```

Exemple :
```
User-Agent: Nakiros/1.0.0 (darwin; arm64)
```

Toute requête avec un User-Agent non conforme est rejetée avec HTTP 403.

### Niveau 3 — Rate limiting

Via Cloudflare Rate Limiting :
- Maximum 60 requêtes par heure par IP pour `/manifest`
- Maximum 200 requêtes par heure par IP pour `/download`
- Au-delà : HTTP 429 avec `Retry-After` header

---

## Logique de compatibilité dans le Worker

Le Worker vérifie la compatibilité entre l'app et le bundle selon cette logique :

```typescript
function checkCompatibility(manifest, appVersion, appFeatures) {
  // Vérifier min_app_version
  if (semverLt(appVersion, manifest.min_app_version)) {
    return {
      compatible: false,
      reason: "min_app_version",
      message: `Cette mise à jour requiert Nakiros v${manifest.min_app_version} minimum.`
    }
  }

  // Vérifier required_features
  const missingFeatures = manifest.required_features.filter(
    feature => !appFeatures.includes(feature)
  )
  if (missingFeatures.length > 0) {
    return {
      compatible: false,
      reason: "required_features",
      missing_features: missingFeatures,
      message: `Cette mise à jour requiert les features : ${missingFeatures.join(", ")}.`
    }
  }

  return { compatible: true }
}
```

L'app envoie ses features supportées dans la requête manifest :

```
GET /manifest?channel=stable&app_version=1.0.0&features=saas,rag
```

---

## Gestion des erreurs

| Erreur | HTTP | Code | Description |
|---|---|---|---|
| API key manquante ou invalide | 401 | UNAUTHORIZED | Header X-Nakiros-Key absent ou invalide |
| User-Agent invalide | 403 | FORBIDDEN | Format User-Agent non conforme |
| Rate limit dépassé | 429 | RATE_LIMITED | Trop de requêtes |
| Fichier introuvable | 404 | FILE_NOT_FOUND | Fichier ou version inexistant dans R2 |
| Erreur R2 | 500 | STORAGE_ERROR | Problème d'accès au bucket R2 |
| Channel invalide | 400 | INVALID_CHANNEL | Channel autre que stable ou beta |

---

## Variables d'environnement Worker (Cloudflare Secrets)

```
NAKIROS_API_KEY_STABLE     # API key pour les builds stable
NAKIROS_API_KEY_BETA       # API key pour les builds beta
R2_BUCKET                  # Binding R2 configuré dans wrangler.toml
```

---

## Configuration wrangler.toml

```toml
name = "nakiros-updates"
main = "src/index.ts"
compatibility_date = "2026-01-01"

[[r2_buckets]]
binding = "R2_BUCKET"
bucket_name = "nakiros-assets"

[triggers]
routes = ["updates.nakiros.com/*"]
```

---

## Logging et monitoring

Chaque requête est loggée via Cloudflare Worker Analytics avec :
- Timestamp
- Endpoint appelé
- Version app
- Channel
- Version bundle demandée
- Statut de compatibilité
- Code de réponse HTTP

Pas de données personnelles loggées — uniquement des métadonnées techniques.