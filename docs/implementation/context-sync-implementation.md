# Implémentation — Context Sync

> Référence de reprise pour le sync de documents de contexte entre Desktop local et Nakiros Cloud.
> Mise à jour après stabilisation du modèle conversation/orchestrateur.

---

## 1. Objectif

Le Context Sync synchronise les documents de contexte d’un workspace entre :

- le stockage local du Desktop
- les repos clonés localement
- le Worker Nakiros qui sert de source de vérité partagée

Cas couverts :

- un membre d’équipe ouvre l’app et récupère les docs globaux
- un membre n’ayant pas cloné tous les repos peut lire les docs distants
- un conflit d’écriture est détecté proprement

---

## 2. Modèle des documents

### Global workspace

Emplacement local :

```text
~/.nakiros/workspaces/{slug}/context/
```

Fichiers principaux :

- `global-context.md`
- `product-context.md`
- `inter-repo.md`

### Par repo local

Emplacement :

```text
{repoPath}/_nakiros/
```

Fichiers :

- `architecture.md`
- `stack.md`
- `conventions.md`
- `api.md`
- `llms.txt`

### Par repo distant non cloné

Emplacement local miroir :

```text
~/.nakiros/workspaces/{slug}/context/repos/{repoName}/
```

---

## 3. Source de vérité

La source de vérité est le Worker.

Les structures partagées sont définies dans :

- [packages/shared/src/types/server.ts](/Users/thomasailleaume/Perso/timetrackerAgent/packages/shared/src/types/server.ts)
- `packages/worker/src/types.ts`

Le Worker stocke :

- le contexte global workspace
- le contexte par repo
- les timestamps de mise à jour
- `updatedBy`

---

## 4. API Worker

Endpoints utilisés :

### `GET /ws/:id/context`

Retourne le manifeste context :

- présence des docs globaux
- dates et auteur des repos

### `GET /ws/:id/context/_global/:file`

Télécharge un document global en `text/plain`.

Fichiers supportés :

- `global-context`
- `product-context`
- `inter-repo`

### `PUT /ws/:id/context`

Push du contexte global.

Comportement :

- si le remote est plus récent et `force` absent -> `409 CONFLICT`
- le Worker renseigne `updatedBy`

### `GET /ws/:id/repos/:name/context`

Retourne le `RepoContext` complet.

### `PUT /ws/:id/repos/:name/context`

Push du contexte repo avec la même logique de conflit.

---

## 5. Service Desktop

Implémentation dans [context-sync.ts](/Users/thomasailleaume/Perso/timetrackerAgent/apps/desktop/electron/services/context-sync.ts).

### `pushWorkspaceContext(workspace, force?)`

Le service :

1. lit les fichiers globaux dans `~/.nakiros/workspaces/{slug}/context/`
2. lit les `_nakiros/*.md` des repos locaux existants
3. pousse le global puis les repos
4. retourne un statut structuré :

- `ok`
- `conflict`
- `offline`
- `unauthenticated`

### `pullRemoteContext(workspace)`

Le service :

1. télécharge les docs globaux
2. récupère le manifeste
3. télécharge les contextes des repos non clonés localement
4. les écrit dans `context/repos/{repoName}/`

---

## 6. Plumbing IPC

Channels partagés :

- `context:push`
- `context:pull`

Handlers :

- [main.ts](/Users/thomasailleaume/Perso/timetrackerAgent/apps/desktop/electron/main.ts)
- [preload.ts](/Users/thomasailleaume/Perso/timetrackerAgent/apps/desktop/electron/preload.ts)

Types renderer :

- [global.d.ts](/Users/thomasailleaume/Perso/timetrackerAgent/apps/desktop/src/global.d.ts)

---

## 7. Déclenchement UX

### Pull au boot

Dans [App.tsx](/Users/thomasailleaume/Perso/timetrackerAgent/apps/desktop/src/App.tsx), au chargement des workspaces :

- `pullContext(workspace)` est lancé en fire-and-forget
- les erreurs offline et auth sont silencieuses

### Push après génération de contexte

Dans [ContextPanel.tsx](/Users/thomasailleaume/Perso/timetrackerAgent/apps/desktop/src/components/ContextPanel.tsx) :

- quand `/nak-workflow-generate-context` se termine
- le Desktop appelle `syncWorkspace`
- puis `pushContext`

### Push après édition manuelle

Le même panel pousse aussi le contexte après sauvegarde d’un document éditable.

---

## 8. Repos distants et scan docs

Le scanner local agrège :

- les docs des repos clonés
- les docs globaux du workspace
- les docs des repos distants miroir

Les docs distants sont marqués `isRemote`.

Effets UI :

- badge cloud sur les docs distants
- lecture autorisée
- écriture désactivée

---

## 9. Interaction avec le modèle conversation

Le Context Sync est indépendant du stockage conversation de l’orchestrateur :

- l’orchestrateur possède l’historique des conversations
- le Worker possède le contexte documentaire partagé
- le Desktop fait le lien UX entre les deux

En pratique :

- une conversation agent peut générer ou modifier du contexte
- le Desktop pousse ensuite ces documents vers le cloud
- les autres membres les récupèrent au prochain pull

---

## 10. État actuel

### En place

- endpoints Worker
- service Electron `context-sync.ts`
- IPC complet
- push post-génération
- push post-édition
- pull au boot
- scan des repos distants non clonés

### À envisager ensuite

- pull au changement de workspace actif
- polling périodique optionnel
- indicateur “last sync” visible dans l’UI
- tests bout en bout de conflits multi-utilisateurs réels
