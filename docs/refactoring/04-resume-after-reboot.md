# Cadrage — Bouton "Reprendre" après interruption daemon

> Branche cible : à ouvrir · Statut : à cadrer · Date : 2026-04-25

## Pourquoi

Aujourd'hui, après un reboot du daemon en plein run :

- audit / fix / create : les runs en `running` ou `starting` sont **collapsés en `waiting_for_input`** par le hook `spec.rehydrate` (avec `sessionId` préservé). Le user rouvre la vue et voit une conversation qui s'arrête abruptement.
- eval : les runs en `running` / `grading` sont collapsés en `stopped` — non reprenables. Les runs `waiting_for_input` survivent via la rehydratation lazy de `loadPersistedRuns`.

**Limite UX** : un run rehydraté ressemble exactement à un run qui attend vraiment une question de l'utilisateur. Le user n'a aucun signal "ça a été interrompu, tu peux reprendre" et finit par taper un message au hasard pour relancer.

## Diagnostic technique

Côté Claude CLI il n'existe pas de "continue this same turn". Le mécanisme `--resume <sessionId> --print "<message>"` **ajoute un nouveau user message**. Donc un bouton "Reprendre" n'est pas magique — il envoie un prompt synthétique de continuation.

Distinction sémantique non tracée aujourd'hui :

| Cas | Status | Différence |
|---|---|---|
| Agent a posé une question | `waiting_for_input` | dernier assistant turn contient la question |
| Daemon killé mid-turn → rehydraté | `waiting_for_input` | dernier assistant turn est partiel ou vide |

Le `RunEntry` n'a pas de flag pour distinguer.

## Périmètre proposé

### 1. Modèle

Ajouter un champ optionnel sur `BaseRun` (donc `AuditRun` / `SkillEvalRun`) :

```ts
/**
 * `true` quand la dernière transition vers `waiting_for_input` vient d'une
 * collapse au boot (subprocess mort), `false` ou `undefined` quand l'agent a
 * naturellement demandé une réponse. Effacé par {@link sendUserMessage} après
 * un turn réussi.
 */
interruptedByReboot?: boolean;
```

Mis à `true` par chaque `spec.rehydrate` sur le chemin `running/starting → waiting_for_input`. Persisté dans `run.json` (donc survit aux reboots successifs jusqu'au resume effectif).

### 2. Backend (factory + spec)

- `createRunner` clear le flag dans `executeTurn` à l'entrée (avant le `entry.eventLog.resetForNewTurn()`) — un turn lancé = plus interrompu.
- Hook optionnel `spec.buildResumePrompt?(entry): string` qui retourne le prompt synthétique pour le resume. Default : `"Continue from where you left off."`.

### 3. Frontend

- Étendre `RunStatusBadge` ou ajouter un `RunInterruptedBadge` orange/jaune à côté du badge waiting_for_input quand `run.interruptedByReboot === true`.
- Étendre `RunControlHeader.actions` : bouton **"Reprendre"** (icône `RotateCw` lucide) visible UNIQUEMENT quand interrupted. Click → `runner.sendUserMessage(runId, spec.buildResumePrompt(entry))`.
- Pour eval : même bouton dans le `RunDetail` de `EvalRunsView`. Visible seulement sur les runs `waiting_for_input` interrupted (pas sur les `stopped`-collapsés — ceux-là ne sont pas reprenables).

### 4. i18n

Ajouter à la namespace `runs` :
- `runs:resume` = "Reprendre"
- `runs:status.interrupted` = "Interrompu" (badge add-on)
- `runs:input.resumePromptDefault` = "Continue from where you left off."

## Questions à trancher

1. **Prompt de resume — uniforme ou kind-specific ?**
   - Uniforme : "Continue from where you left off." (simple, cohérent)
   - Kind-specific via `spec.buildResumePrompt` :
     - audit : "Resume the audit. Re-emit any partial findings then finish the report."
     - fix : "Continue editing where you left off."
     - create : "Continue building the skill where you left off."
     - eval : "Continue answering the eval prompt."
   - **Recommandation** : kind-specific. Donne à l'agent un contexte de relance plus précis, marginal en effort.

2. **Persistance du flag — clear quand ?**
   - Au prochain `executeTurn` réussi (le user a vraiment repris).
   - Auto-clear après N heures sans interaction (évite que le badge reste éternellement si user oublie le run).
   - **Recommandation** : clear uniquement sur turn réussi. Pas d'auto-expiration — si l'user oublie, le badge reste un rappel utile.

3. **eval rehydraté en stopped — reprenable ?**
   - Aujourd'hui : non. Le subprocess est mort, sandbox détruite, grading partiel.
   - Pourrait-on relancer un run stopped en re-créant la sandbox ? Théoriquement oui (recréer le worktree depuis le gitRoot, recopier les fixtures), mais ça coûte autant qu'un run frais → autant relancer le batch.
   - **Recommandation** : laisser stopped non-reprenable. Ne montrer le bouton que sur waiting_for_input.

4. **Bouton "Reprendre" vs auto-resume au mount**
   - Auto-resume : quand le user ouvre la vue d'un run interrupted, le daemon envoie automatiquement le resume prompt.
   - Bouton explicite : le user décide.
   - **Recommandation** : bouton explicite. Le user doit pouvoir lire la conversation interrompue avant de relancer (peut-être qu'il veut éditer son contexte d'abord, ou abandonner).

## Critères de succès

1. Un audit en cours, daemon killé, redémarré → bouton "Reprendre" visible, badge "Interrompu" affiché. Click → l'agent continue, badge disparaît.
2. Un fix `waiting_for_input` qui attend une vraie réponse user → pas de bouton "Reprendre" (badge interrupted absent).
3. Un eval batch killé en plein turn → l'eval `waiting_for_input` rehydraté affiche "Reprendre" ; les autres collapsed-en-stopped n'affichent rien (sont juste terminaux).
4. Pas de régression sur les flows nominaux (start, send, finish, stop).
5. tsc clean. Smoke test manuel par kind.

## Effort estimé

| Tâche | Effort |
|---|---|
| Backend : flag + clear + spec.buildResumePrompt | 0,25 j |
| Frontend : badge + bouton + i18n | 0,25 j |
| Étendre eval-runner avec le flag (hors factory) | 0,1 j |
| Smoke + docs/technical refresh | 0,1 j |
| **Total** | **~0,7 j** |

## Hors scope

- **Auto-recovery sans intervention user** — pas demandé, et plus risqué (peut consommer des tokens sans signal).
- **Résolution mid-grading pour eval** — recréer la sandbox + re-runner les scripts, complexe et probablement pas plus économique qu'un run frais.
- **Notifications système quand un run rehydraté attend** — décision projet : pas de notif OS (peu utile sans autorisation explicite). Le badge in-app suffit.
