# Artifact R2 Migration

Migrer le stockage du contenu markdown des artefacts de D1 vers R2.

**Décision clé** : path R2 = `workspaces/{workspaceId}/artifacts/{artifactPath}/v{version}.md`
Pas d'`orgId` dans le path → stable même si le workspace change d'organisation.

---

## Tâches

### 1. Migration D1 — `0008_artifact_r2.sql`
- Ajouter colonne `r2_key TEXT` sur `artifact_versions`
- Rendre `content` nullable (migration douce, pas de breaking change)

```sql
ALTER TABLE artifact_versions ADD COLUMN r2_key TEXT;
-- content reste pour rétro-compat, on le retire dans une migration future
```

### 2. Worker — binding R2

Dans `packages/worker/wrangler.toml` :
```toml
[[r2_buckets]]
binding = "CONTEXT_BUCKET"
bucket_name = "nakiros-context"
```

Ajouter le type dans l'`Env` du worker.

### 3. Worker schema — `packages/worker/src/schema.ts`
- Ajouter `r2Key: text('r2_key')`
- Passer `content` en `.notNull()` → nullable

### 4. Worker storage — `packages/worker/src/storage.ts`

**`saveArtifactVersion`** :
1. Construire `r2Key = workspaces/${workspaceId}/artifacts/${artifactPath}/v${nextVersion}.md`
2. `await env.CONTEXT_BUCKET.put(r2Key, content)`
3. INSERT dans D1 avec `r2Key`, `content: null`

**`getArtifactVersion`** (nouvelle méthode) :
1. SELECT row depuis D1
2. Si `r2Key` présent → `env.CONTEXT_BUCKET.get(r2Key)` → `.text()`
3. Fallback sur `row.content` pour les anciens enregistrements

**`listArtifactVersions`** : inchangé (pas de content dans le listing)

### 5. Worker routes — `packages/worker/src/index.ts`

Routes concernées :
- `POST /ws/:workspaceId/artifacts/:path/versions` → utilise `saveArtifactVersion` modifié
- `GET /ws/:workspaceId/artifacts/:path/versions/:version` → utilise `getArtifactVersion`
- `GET /ws/:workspaceId/artifacts` → inchangé (listing metadata)

### 6. Tests

- `packages/worker/src/agent-actions.test.ts` ou nouveau fichier : mock R2 binding, vérifier que save écrit dans R2 et que read lit depuis R2
- Vérifier le fallback `content` pour les anciennes lignes D1

---

## Hors scope (pour plus tard)

- Suppression du champ `content` dans D1 (migration 0009 quand tous les clients sont migrés)
- Script de backfill : migrer les `content` existants vers R2 + remplir `r2_key`
- `deleteR2Prefix(workspaceId)` dans le flow de suppression de workspace

---

## Aucun changement côté Desktop

`artifact-service.ts` et les IPC channels `artifact:*` sont transparents — ils appellent les mêmes routes Worker.
