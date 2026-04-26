# Cadrage — Broadcast d'erreur structuré pour handlers IPC

> Branche cible : à ouvrir · Statut : à cadrer · Date : 2026-04-26

## Pourquoi

L'audit initial signalait :
> *Try/catch + broadcast d'erreur manquant systématiquement (eval.ts:48, fix.ts:57-62)*

Aujourd'hui :
- La couche HTTP (`POST /ipc/:channel`) intercepte les exceptions des handlers et les sérialise en `{ ok: false, error }`. Le frontend reçoit donc une réponse d'erreur sur la **réponse HTTP** qui a déclenché l'appel.
- En revanche, **aucun event d'erreur n'est broadcasté sur le bus** (`eventBus.broadcast`). Si un run échoue silencieusement côté serveur (ex. `runFixEvalsInTemp` qui lance un batch eval qui crashe avant le premier event de status), le frontend n'a aucune visibilité hors-bande.

## Ce qui n'est PAS le problème

- La *gestion* des erreurs côté HTTP est OK. Les exceptions ne disparaissent pas — elles atteignent le frontend via la promise du `invoke()`.
- Les runners (audit/fix/create) émettent déjà des events `done` avec `error` quand un turn échoue. C'est correct.

## Ce qui manque vraiment

Un **event de niveau handler** broadcasté sur le bus quand le handler lui-même throw, **avant** que le runner ait pu émettre quoi que ce soit. Cas concrets :
- `fix:runEvalsInTemp` jette parce que `getFixRealSkillDir` retourne `null` → frontend bloqué sur le bouton "Running evals" jusqu'à un timeout côté UI.
- `eval:startRuns` jette parce que `evals.json` est introuvable → idem.

L'utilisateur final reçoit l'erreur via la réponse HTTP, mais la **vue qui l'a déclenchée** ne reçoit pas d'event broadcast. Pour un flow synchrone (read-write CRUD) c'est OK ; pour un flow asynchrone qui s'attend à des events (start eval batch), c'est confusionnant.

## Périmètre proposé

### 1. Helper `withBroadcastOnError`

Wrapper côté `run-helpers.ts` :
```ts
export function withBroadcastOnError<TArgs extends unknown[], TResult>(
  channel: IpcChannel,                          // canal d'event d'erreur (ex. 'audit:event')
  handler: (...args: TArgs) => Promise<TResult> | TResult,
): (...args: TArgs) => Promise<TResult> {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      eventBus.broadcast(IPC_CHANNELS[channel], {
        type: 'error',
        error: message,
      });
      throw err; // re-throw pour que la couche HTTP réponde aussi en erreur
    }
  };
}
```

### 2. Application sélective

Seulement sur les handlers qui démarrent / mutent un run et dont le frontend s'attend à des events :
- `audit:start`, `audit:sendUserMessage`, `audit:finish`, `audit:stopRun`
- `fix:start`, `fix:sendUserMessage`, `fix:finish`, `fix:stopRun`, `fix:runEvalsInTemp`
- `create:start`, `create:sendUserMessage`, `create:finish`, `create:stopRun`
- `eval:startRuns`, `eval:sendUserMessage`, `eval:finishRun`, `eval:stopRun`

Pas sur les handlers CRUD (`*:listActive`, `*:getRun`, `*:listHistory`, etc.) — leur erreur est toujours synchrone et le frontend la lit sur la promise.

### 3. Type d'event d'erreur

Étendre les unions `AuditRunEvent`, `FixRunEvent`, `EvalRunEvent` avec un variant `{ type: 'error'; error: string }`. Le frontend peut alors switcher dessus pour afficher un toast ou inline-banner.

Alternative plus simple : un canal d'erreur séparé, dédié, partagé entre runners (`runs:error`). Moins typé, plus simple à propager.

**Recommandation** : variant typé sur les channels existants — la dispatch côté frontend est déjà branchée par kind.

## Questions à trancher

1. **Re-throw ou swallow ?** Re-throw permet à la couche HTTP de répondre en 500. Sans re-throw, le frontend reçoit `{ ok: true, result: undefined }` ce qui est trompeur. **Recommandation : re-throw.**
2. **Event d'erreur persisté dans le replay buffer ?** Le buffer est destiné aux events de turn (text/tool). Une erreur de handler n'est pas un event de turn — elle ne devrait PAS aller dans `events.jsonl`. **Recommandation : broadcast-only, pas de persistance.**
3. **Seulement sur les handlers de mutation ?** Voir §2 ci-dessus. **Recommandation : oui, seulement ceux qui s'attendent à un event-flow.**

## Critères de succès

1. `fix:runEvalsInTemp` appelé sur un run sans temp workdir → un event
   `{ type: 'error', error: '...' }` arrive sur `eval:event`, le bouton
   "Running evals" repasse en idle, un toast/banner inline affiche le
   message côté UI.
2. `eval:startRuns` sur un skill sans `evals.json` → idem côté
   `eval:event` ; pas de spinner figé.
3. Les flows nominaux (start → run → done success) ne broadcastent
   **pas** d'event `'error'`.
4. La réponse HTTP du `invoke()` est toujours en erreur sur les handlers
   wrappés (re-throw confirmé). La promise frontend rejette avec le même
   message que l'event.
5. `events.jsonl` ne contient pas d'events `'error'` issus de
   `withBroadcastOnError` (broadcast-only — pas de pollution du replay
   buffer).
6. tsc clean. Smoke par kind + un test négatif explicite (forcer un
   throw dans `fix:runEvalsInTemp`).

## Effort estimé

| Tâche | Effort |
|---|---|
| Helper `withBroadcastOnError` + type d'event | 0,2 j |
| Wrap les ~15 handlers sélectionnés | 0,2 j |
| Frontend : handler de l'event 'error' (toast inline) | 0,1 j |
| Smoke + tsc | 0,1 j |
| **Total** | **~0,6 j** |

## Hors scope

- **Logging serveur centralisé** — ce sera utile mais relève d'une couche obs au-dessus.
- **Retries automatiques** — pas demandé ; les retries explicites sont le job du frontend qui voit l'erreur.
- **Nakiros télémétrie** — local-first, hors scope par décision projet.
