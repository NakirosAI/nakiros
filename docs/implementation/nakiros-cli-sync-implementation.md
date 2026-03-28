# Nakiros CLI Sync — Suivi d'implémentation

Doc architecture complète : `docs/architecture/nakiros-cli-sync-architecture.md`

---

## Étape 1 — Credential store

- [ ] `apps/desktop/electron/services/auth.ts` : écrire `~/.nakiros/credentials.json` au login et à chaque refresh token (`chmod 600`)
- [ ] `packages/orchestrator/src/credentials.ts` : lire le fichier, rafraîchir si `expiresAt - now < 5min`, exposer `getAccessToken()`

## Étape 2 — Endpoint Worker `resolve`

- [ ] `packages/worker/src/index.ts` : `GET /workspaces/resolve?path=<cwd>`
  - Auth requise
  - Parcourt les workspaces de l'user
  - Match sur les `repoPath` du JSON `data` (chemin exact ou parent)
  - Retourne `{ workspace, slug }`

## Étape 3 — `nakiros workspace get`

- [ ] `packages/orchestrator/src/workspace.ts` : `resolveWorkspaceFromCwd(cwd)` + `pullArtifacts(workspace)`
- [ ] `packages/orchestrator/bin/nakiros.ts` : commande `workspace get` + `workspace list`

## Étape 4 — `nakiros sync`

- [ ] Ajouter `chokidar` dans `packages/orchestrator/package.json`
- [ ] `packages/orchestrator/src/sync-watcher.ts` : watcher + debounce 2s + push API + PID file
- [ ] `packages/orchestrator/bin/nakiros.ts` : commandes `sync start`, `sync stop`, `sync status`, `sync push`

## Étape 5 — Intégration workflow

- [ ] `packages/agents-bundle/commands/nak-workflow-dev-story.md` : `nakiros workspace get` en setup, `nakiros sync start/stop/push` en setup/close
