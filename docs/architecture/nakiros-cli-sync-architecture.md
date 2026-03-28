# Nakiros CLI Sync Architecture

## Vision

Le binaire `nakiros` (déjà en place dans `packages/orchestrator`) devient la **surface universelle** pour interagir avec le contexte d'un workspace depuis n'importe quel environnement :

- Desktop Electron ouvert
- VS Code + extension Claude Code
- Codex
- Terminal autonome (CI, scripts)

Deux nouvelles familles de commandes : `nakiros workspace` et `nakiros sync`.

---

## Détection automatique du workspace par `cwd`

### Le principe

Toutes les commandes `nakiros workspace` et `nakiros sync` **n'ont pas besoin d'argument `--workspace`**.

Quand une commande est lancée, le CLI envoie `process.cwd()` au Worker. Le Worker cherche quel workspace de l'utilisateur contient ce chemin dans sa liste de repos.

```
Agent dans /Users/thomasailleaume/Keyprod/exploitation/exploitation-front
  → nakiros workspace get
  → process.cwd() = /Users/thomasailleaume/Keyprod/exploitation/exploitation-front
  → GET /workspaces/resolve?path=<cwd>
  → Worker : scan les workspaces de l'user, trouve "exploitation" qui a ce path
  → retourne workspace + contexte
```

### Pourquoi `process.cwd()` fonctionne partout

Quand n'importe quel appelant lance `nakiros`, le processus Node hérite du `cwd` de l'appelant :

| Surface | cwd reçu par nakiros |
|---------|---------------------|
| VS Code + Claude Code | dossier workspace ouvert dans VS Code |
| Terminal | répertoire courant du shell |
| Claude Code CLI | répertoire où il a été lancé |
| Codex | répertoire du projet |

**Aucune configuration, aucun fichier dans les repos.** Les projets clients restent 100% propres.

### `--workspace` comme override optionnel

```bash
nakiros workspace get                        # auto-détection par cwd (cas standard)
nakiros workspace get --workspace myapp      # override explicite (CI, scripts cross-repo)
```

### Nouveau endpoint Worker

```
GET /workspaces/resolve?path=<encoded-cwd>
Authorization: Bearer <token>
```

Le Worker itère sur les workspaces de l'utilisateur, parse le champ `repos` du JSON `data`, et retourne le workspace dont un des `repoPath` correspond à (ou est un parent de) le chemin reçu.

---

## Credential Store

### Problème

Aujourd'hui le token Melody Auth reste en mémoire Electron. Les processus externes (orchestrateur, sync watcher) n'y ont pas accès.

### Solution : `~/.nakiros/credentials.json`

```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "expiresAt": 1743200000000,
  "apiUrl": "https://api.nakiros.com"
}
```

- **Écrit par le Desktop** au login et à chaque refresh token
- **Lu par l'orchestrateur** pour toute commande nécessitant l'API
- **Permissions** : `chmod 600` à l'écriture (lecture owner uniquement)
- **Refresh automatique** : si `expiresAt - now < 5min`, l'orchestrateur rafraîchit avant d'appeler l'API

### Fichiers impactés

| Fichier | Action |
|---------|--------|
| `apps/desktop/electron/services/auth.ts` | Écrire `~/.nakiros/credentials.json` au login/refresh |
| `packages/orchestrator/src/credentials.ts` | Nouveau — lit, rafraîchit, expose le token |

---

## `nakiros workspace`

### `nakiros workspace get`

**Usage :**
```bash
nakiros workspace get                        # détection par cwd
nakiros workspace get --workspace <slug>     # override
nakiros workspace get --artifacts            # artifacts seulement
nakiros workspace get --config               # config seulement
```

**Ce que ça fait :**
1. Lit les credentials depuis `~/.nakiros/credentials.json`
2. Résout le workspace via `GET /workspaces/resolve?path=<cwd>` (ou `--workspace` si fourni)
3. `GET /ws/{workspaceId}/artifacts` → liste les artefacts (metadata, sans content)
4. Pour chaque artefact : `GET /ws/{workspaceId}/artifacts/{path}/versions/{latest}` → télécharge depuis R2
5. Écrit les fichiers dans `~/.nakiros/workspaces/{slug}/context/`
6. Sortie JSON sur stdout :

```json
{
  "workspace": {
    "id": "ws-abc",
    "name": "exploitation",
    "slug": "exploitation",
    "repos": ["/Users/thomasailleaume/Keyprod/exploitation/exploitation-front"]
  },
  "artifacts": [
    { "path": "product", "type": "prd", "version": 3, "localPath": "/Users/.../.nakiros/workspaces/exploitation/context/product.md" },
    { "path": "features/auth/spec", "type": "feature-spec", "version": 1, "localPath": "..." }
  ],
  "pulledAt": 1743200000000
}
```

**Pourquoi JSON sur stdout :**
- L'agent parse la sortie et sait exactement quels fichiers sont disponibles
- Compatible avec `nakiros workspace get | jq .artifacts`
- Même pattern que `nakiros run` qui émet des events JSON

### `nakiros workspace list`

```bash
nakiros workspace list
```

Liste les workspaces accessibles depuis l'API. Utile pour l'onboarding dans VS Code ou pour vérifier la résolution.

---

## `nakiros sync`

Toutes les commandes sync utilisent la même détection par `cwd`.

### `nakiros sync start`

```bash
nakiros sync start                           # détection par cwd
nakiros sync start --workspace <slug>        # override
```

**Ce que ça fait :**
1. Résout le workspace via cwd
2. Lance un file watcher (`chokidar`) sur `~/.nakiros/workspaces/{slug}/context/**/*.md`
3. Écrit son PID dans `~/.nakiros/sync/{slug}.pid`
4. Émet sur stdout :
```json
{ "type": "sync:started", "workspace": "exploitation", "watchPath": "...", "pid": 12345 }
```
5. Sur chaque changement de fichier (debounce 2s) :
   - Détermine l'`artifactPath` depuis le chemin relatif
   - `POST /ws/{workspaceId}/artifacts/{path}/versions`
   - Émet : `{ "type": "sync:pushed", "artifactPath": "features/auth/spec", "version": 4 }`

**Debounce 2s** : évite les writes partiels quand l'agent écrit un fichier long en plusieurs passes.

### `nakiros sync stop`

```bash
nakiros sync stop                            # détection par cwd
nakiros sync stop --workspace <slug>
```

Lit `~/.nakiros/sync/{slug}.pid`, envoie SIGTERM, supprime le fichier PID.

### `nakiros sync status`

```bash
nakiros sync status
```

```json
{ "running": true, "pid": 12345, "workspace": "exploitation", "lastPushedAt": 1743200000000 }
```

### `nakiros sync push`

```bash
nakiros sync push                            # push tous les fichiers locaux
nakiros sync push --file features/auth/spec  # push un fichier précis
```

One-shot sans watcher — flush manuel ou fin de session.

---

## Intégration dans `nak-workflow-dev-story`

```markdown
## Setup
1. nakiros workspace get    → résout depuis cwd, pull contexte depuis R2, retourne JSON
2. nakiros sync start       → résout depuis cwd, démarre watcher silencieux

## ...travail de l'agent...
## L'agent lit les fichiers dans les localPath retournés par workspace get
## Le watcher pousse automatiquement chaque fichier modifié vers R2

## Close
1. nakiros sync push        → flush final
2. nakiros sync stop        → arrêt propre
```

L'agent reçoit le JSON de `workspace get` avec les `localPath` exacts — il n'a pas à scanner le filesystem ni à connaître le slug du workspace.

---

## Compatibilité multi-surface

| Surface | Comportement |
|---------|-------------|
| **VS Code + Claude Code** | `process.cwd()` = dossier workspace VS Code. Zéro config. |
| **Codex** | `process.cwd()` = dossier du projet. Zéro config. |
| **Terminal** | `process.cwd()` = répertoire courant. |
| **Desktop** | Peut spawner `sync start` en passant `--workspace` explicitement (il connaît le slug). |
| **CI** | `nakiros sync push --workspace <slug>` avec token injecté en env var. |

---

## Structure fichiers locaux

```
~/.nakiros/
  credentials.json              ← token, refresh, expiry (chmod 600)
  sync/
    {slug}.pid                  ← PID du watcher actif
    {slug}.log                  ← log des derniers pushes (rolling, 100 lignes)
  workspaces/
    {slug}/
      context/
        product.md
        personas.md
        features/
          auth/
            spec.md
```

Les repos clients ne contiennent **aucun fichier nakiros**.

---

## Plan d'implémentation

### Étape 1 — Credential store
- `apps/desktop/electron/services/auth.ts` : écriture `~/.nakiros/credentials.json` au login/refresh
- `packages/orchestrator/src/credentials.ts` : lecture + refresh automatique

### Étape 2 — Endpoint Worker `resolve`
- `packages/worker/src/index.ts` : `GET /workspaces/resolve?path=<cwd>`
- Parcourt les workspaces de l'user, match sur les `repoPath` du JSON `data`

### Étape 3 — `nakiros workspace get`
- `packages/orchestrator/src/workspace.ts` : résolution cwd + pull artifacts (API → disk)
- `packages/orchestrator/bin/nakiros.ts` : commande `workspace`

### Étape 4 — `nakiros sync`
- Dépendance : `chokidar` dans `packages/orchestrator`
- `packages/orchestrator/src/sync-watcher.ts` : watcher + debounce + push
- `packages/orchestrator/bin/nakiros.ts` : commandes `sync start/stop/status/push`

### Étape 5 — Intégration workflow
- `packages/agents-bundle/commands/nak-workflow-dev-story.md` : ajout setup/close sync

---

## Ce qui ne change pas

- `artifact-service.ts` Desktop : inchangé, continue de faire write local + push API pour les actions UI
- Routes Worker `artifact:*` : inchangées (sauf le nouvel endpoint `resolve`)
- IPC channels Desktop : inchangés
- R2 path `workspaces/{workspaceId}/artifacts/...` : identique depuis tous les clients
